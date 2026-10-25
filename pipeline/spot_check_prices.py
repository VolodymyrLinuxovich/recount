"""Spot-check statewide prices with a second, independent reader of the same price files.

The statewide prices come from the Actor's streaming scanner (actor/src/mrf.py). This re-reads the
hospital's whole file with pipeline/scripts/mrf_extract.py (a separate parser, written for the
hand-checked San Francisco extracts), applies the same row rule as build_statewide_prices.pick_row
(outpatient rows, ER rows first, highest list price) and compares every code.

Usage: python -I pipeline/spot_check_prices.py <download_dir> <key> [<key> ...]
       (tall CSV and JSON files only; mrf_extract does not read wide CSV)
Output: pipeline/out/price_spot_checks.json; the test suite checks the app's prices still match it.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
from build_statewide_prices import is_er, ok_price  # noqa: E402
from scripts.mrf_extract import read_json, read_tall_csv  # noqa: E402

PRICES = ROOT / "convex/lib/statewidePrices.json"
OUT = ROOT / "pipeline/out/price_spot_checks.json"


def expected(items: list[dict], code: str) -> float | None:
    rows = [e for e in items if e["code"] == code and ok_price(e["gross_charge"])]
    if not rows:
        return None
    outp = [e for e in rows if (e["setting"] or "").lower() in ("outpatient", "both")] or rows
    pool = [e for e in outp if is_er(e["description"])] or outp
    return round(max(e["gross_charge"] for e in pool), 2)


def main(dl: str, keys: list[str]) -> None:
    data = json.loads(PRICES.read_text())["hospitals"]
    old = json.loads(OUT.read_text())["hospitals"] if OUT.exists() else {}
    Path(dl).mkdir(parents=True, exist_ok=True)
    for key in keys:
        h = data[key]
        path = Path(dl) / f"{key}.mrf"
        url = h["url"].replace("http://", "https://", 1)
        subprocess.run(["curl", "-s", "-g", "-L", "-m", "900", "-A", "Mozilla/5.0", "-o", str(path), url], check=True)
        head = path.read_bytes()[:4096].lstrip(b"\xef\xbb\xbf").lstrip()
        _, rows, items = (read_json if head[:1] == b"{" else read_tall_csv)(str(path))
        codes = {}
        for code, row in h["prices"].items():
            want = expected(items, code)
            in_file = any(abs((e["gross_charge"] or -1) - row["grossCharge"]) < 0.005 for e in items if e["code"] == code)
            codes[code] = {"app": row["grossCharge"], "secondReader": want, "same": want is not None and abs(want - row["grossCharge"]) < 0.005,
                           "valueInFile": in_file}
        same = sum(1 for c in codes.values() if c["same"])
        old[key] = {"url": h["url"], "rowsRead": rows, "checkedAt": datetime.now(timezone.utc).isoformat()[:19] + "Z",
                    "codes": codes, "same": same, "compared": len(codes)}
        print(f"{key}: {same}/{len(codes)} same; {sum(1 for c in codes.values() if c['valueInFile'])} values found in the file", flush=True)
        path.unlink()
    tot = sum(v["compared"] for v in old.values())
    same = sum(v["same"] for v in old.values())
    OUT.write_text(json.dumps({"note": __doc__.split("Usage")[0].strip(), "hospitals": old, "compared": tot, "same": same},
                              indent=1, ensure_ascii=False) + "\n")
    print(f"total {same}/{tot} -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
