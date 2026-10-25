"""Read the eval bills with Azure AI Document Intelligence (prebuilt-layout) and score it two ways:

  1. On its own: does its table read get each line's (code, charge) right?
  2. As the app's second read (convex/agent.ts readChargesColumn with AZURE_DOCINTEL_* set): next to
     Claude's full read in --claude, how often do the two agree on every charge, and when they
     disagree, which one matches the answer key?

The table parsing mirrors convex/lib/docIntel.ts linesFromTables. Raw Azure responses are cached in
--out, so re-scoring never calls Azure again (the free tier allows 500 pages a month).

  python -I read_docintel.py --env ../.env.azure --claude preds --out preds-docintel
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
API_VERSION = "2024-11-30"
MODEL = "prebuilt-layout"

CHARGE_HEAD = re.compile(r"charge|amount|total|price", re.I)
CODE_HEAD = re.compile(r"cpt|hcpcs|proc|code", re.I)
DESC_HEAD = re.compile(r"desc|service|item", re.I)
NOT_A_LINE = re.compile(r"total|payment|adjust|balance|amount due|subtotal|insurance paid", re.I)
MONEY = re.compile(r"^(\()?(-)?\$?(\d{1,3}(?:,\d{3})+|\d+)?(\.\d+)?(\))?$")


def money(s: str) -> float | None:
    m = MONEY.match(re.sub(r"\s+", "", s))
    if not m or (not m[3] and not m[4]) or bool(m[1]) != bool(m[5]):
        return None
    n = float((m[3] or "0").replace(",", "") + (m[4] or ""))
    return -n if (m[1] or m[2]) else n


def lines_from_tables(tables: list[dict]) -> list[dict]:
    out = []
    for t in tables:
        rows = [[""] * t["columnCount"] for _ in range(t["rowCount"])]
        for c in t["cells"]:
            rows[c["rowIndex"]][c["columnIndex"]] = c["content"].strip()
        head_at = next((i for i, r in enumerate(rows)
                        if any(CHARGE_HEAD.search(x) for x in r) and any(CODE_HEAD.search(x) or DESC_HEAD.search(x) for x in r)), -1)
        if head_at < 0:
            continue
        head = rows[head_at]
        charge_col = [i for i, h in enumerate(head) if CHARGE_HEAD.search(h)][-1]
        code_col = next((i for i, h in enumerate(head) if CODE_HEAD.search(h) and not re.search("rev", h, re.I)), -1)
        for r in rows[head_at + 1:]:
            if any(NOT_A_LINE.search(x) for x in r):
                continue
            charge = money(r[charge_col] if charge_col < len(r) else "")
            if charge is None:
                continue
            out.append({"code": (r[code_col] or None) if code_col >= 0 else None, "charge": charge})
    return out


def load_env(path: Path) -> dict:
    env = {}
    for line in path.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    return env


def ssl_context() -> ssl.SSLContext:
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def analyze(path: Path, endpoint: str, key: str, ctx: ssl.SSLContext) -> tuple[dict, float]:
    body = json.dumps({"base64Source": base64.b64encode(path.read_bytes()).decode()}).encode()
    url = f"{endpoint.rstrip('/')}/documentintelligence/documentModels/{MODEL}:analyze?api-version={API_VERSION}"
    t0 = time.time()
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, data=body, headers={"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/json"})
            loc = urllib.request.urlopen(req, context=ctx, timeout=60).headers["Operation-Location"]
            break
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 5:
                raise
            time.sleep(int(e.headers.get("Retry-After", "10")))
    while True:
        time.sleep(1)
        try:
            d = json.load(urllib.request.urlopen(urllib.request.Request(loc, headers={"Ocp-Apim-Subscription-Key": key}), context=ctx, timeout=60))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(int(e.headers.get("Retry-After", "5")))
                continue
            raise
        if d["status"] in ("succeeded", "failed"):
            return d, time.time() - t0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bills", default=str(HERE / "out"))
    ap.add_argument("--claude", default=str(HERE / "preds"), help="Claude's reads: <id>.parsed.json")
    ap.add_argument("--out", default=str(HERE / "preds-docintel"))
    ap.add_argument("--env", default=str(HERE.parent / ".env.azure"))
    a = ap.parse_args()
    bills, claude, out = Path(a.bills), Path(a.claude), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    env = load_env(Path(a.env))
    ctx = ssl_context()

    rows = []
    for truth_path in sorted(bills.glob("bill-*.truth.json")):
        truth = json.loads(truth_path.read_text())
        bid = truth["id"]
        files = truth["files"]
        src = bills / files.get("pdf", files.get("png"))
        cache = out / f"{bid}.layout.json"
        if cache.exists():
            raw, secs = json.loads(cache.read_text()), None
        else:
            raw, secs = analyze(src, env["AZURE_DOCINTEL_ENDPOINT"], env["AZURE_DOCINTEL_KEY"], ctx)
            cache.write_text(json.dumps(raw))
        tables = (raw.get("analyzeResult") or {}).get("tables") or []
        di = lines_from_tables(tables)
        true_lines = [{"code": l["code"], "charge": float(l["charge"])} for l in truth["bill"]["lines"]]
        same_len = len(di) == len(true_lines)
        pairs_right = sum(1 for d, t in zip(di, true_lines) if d["code"] == t["code"] and abs(d["charge"] - t["charge"]) < 0.005) if same_len else 0
        charges_right = sum(1 for d, t in zip(di, true_lines) if abs(d["charge"] - t["charge"]) < 0.005) if same_len else 0

        # As the second read: compare with Claude's lines the way agent.ts does.
        cp = claude / f"{bid}.parsed.json"
        agree = verdict = None
        if cp.exists():
            cl = [float(l["charge"]) for l in json.loads(cp.read_text())["lines"]]
            if len(cl) == len(di):
                dis = [i for i, (x, y) in enumerate(zip(cl, (d["charge"] for d in di))) if abs(x - y) > 0.005]
                agree = not dis
                if dis:
                    verdict = [{"line": i + 1, "claude": cl[i], "docintel": di[i]["charge"],
                                "truth": true_lines[i]["charge"] if i < len(true_lines) else None} for i in dis]
            else:
                agree, verdict = False, f"line count differs: Claude {len(cl)}, Document Intelligence {len(di)}"
        rows.append({"id": bid, "variant": truth["variant"], "file": src.suffix[1:], "truthLines": len(true_lines), "diLines": len(di),
                     "pairsRight": pairs_right, "chargesRight": charges_right, "agreesWithClaude": agree, "disagreements": verdict,
                     "seconds": round(secs, 1) if secs else None})
        print(f"{bid} {truth['variant']:5} lines {len(di)}/{len(true_lines)} pairs {pairs_right} charges {charges_right} agree={agree}", file=sys.stderr)

    total = sum(r["truthLines"] for r in rows)
    summary = {
        "model": f"Azure AI Document Intelligence {MODEL} (api {API_VERSION})",
        "bills": len(rows),
        "billsAllLinesFound": sum(r["diLines"] == r["truthLines"] for r in rows),
        "linesTotal": total,
        "codeAndChargeRight": sum(r["pairsRight"] for r in rows),
        "chargeRight": sum(r["chargesRight"] for r in rows),
        "billsEveryChargeRight": sum(r["chargesRight"] == r["truthLines"] and r["diLines"] == r["truthLines"] for r in rows),
        "byVariant": {v: {"bills": sum(r["variant"] == v for r in rows),
                          "chargeRight": sum(r["chargesRight"] for r in rows if r["variant"] == v),
                          "lines": sum(r["truthLines"] for r in rows if r["variant"] == v)}
                      for v in sorted({r["variant"] for r in rows})},
        "asSecondRead": {"billsCompared": sum(r["agreesWithClaude"] is not None for r in rows),
                         "billsAgreeOnEveryCharge": sum(r["agreesWithClaude"] is True for r in rows)},
        "secondsMedian": sorted(r["seconds"] for r in rows if r["seconds"])[len([r for r in rows if r["seconds"]]) // 2] if any(r["seconds"] for r in rows) else None,
    }
    (out / "score.json").write_text(json.dumps({"summary": summary, "bills": rows}, indent=1) + "\n")
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
