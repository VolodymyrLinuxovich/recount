"""Read bill images into ParsedBill JSON with the same model, prompt and settings as the app
(convex/agent.ts readAndCheck step 1), so score.py can measure reading without running Convex.

Each bill gets two reads in parallel, as in the app: the full bill (readWithClaude) and the charges
column alone (readChargesColumn). Where they disagree on a line, the column amount is kept, the line
goes in "amountChecks" and a note in "unreadable" asks the patient to check it. <id>.parsed.json is
that final bill; <id>.reads.json keeps both raw reads.

  python -I read.py                      # every out/bill-*.png -> preds/<id>.parsed.json
  python -I read.py --only bill-001 bill-002 --pdf

Needs ANTHROPIC_API_KEY (or an `ant auth login` profile). To read with an Azure OpenAI deployment
instead, as the app does with MODEL_PROVIDER=azure (convex/lib/model.ts):

  python -I read.py --provider azure --env ../.env.azure --dst preds-azure

The env file needs AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT. Bills already read are skipped
unless --force. Keep READ_PROMPT, COLUMN_PROMPT, the settings and the schema in sync with
convex/agent.ts and convex/lib/bill.ts.
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parent))  # -I leaves the script dir off sys.path

import argparse
import base64
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import urllib.error
import urllib.request

import anthropic

HERE = Path(__file__).resolve().parent
MODEL = "claude-opus-5-5"

READ_PROMPT = """This is a hospital bill a patient photographed or uploaded. Transcribe it into the schema.
Rules:
- Copy codes, descriptions, dates and amounts exactly as printed. Never guess a CPT/HCPCS code that isn't printed; use null.
- Each line's charge is the amount printed on that line, nothing else. Never adjust or recompute a line so the lines add up to the printed total: bills often contain arithmetic errors, and a total that doesn't match its lines is exactly what the patient needs us to find. Report the printed total as printed, too.
- If a number is blurry or cut off, put your best reading in the field AND add a short plain-English note to "unreadable" that a patient can understand (e.g. "The amount on the CT scan line is blurry"). Never use field names like hospitalAddress or insurancePaid in the notes.
- If you can't read the individual charges at all, return no lines rather than guessing.
- Payments and adjustments are positive numbers.
- If this is not a hospital or medical bill, return empty lines and say so in "unreadable"."""

COLUMN_PROMPT = ("Copy the CHARGES column of the itemized line table, top to bottom across all pages, exactly as printed, "
                 "one string per line item. Only the line items: no totals, payments or amount due.")


def f(t, desc: str | None = None) -> dict:
    """A JSON Schema field; `t` is a type name or ["string", "null"]. Descriptions mirror the zod .describe() text."""
    d = {"type": t}
    if desc:
        d["description"] = desc
    return d


def obj(props: dict) -> dict:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


NS, NN = ["string", "null"], ["number", "null"]
# Same fields, order and descriptions as convex/lib/bill.ts (BillLine, ParsedBill).
LINE = obj({
    "date": f(NS, "Service date YYYY-MM-DD, or null if not printed"),
    "code": f(NS, "CPT/HCPCS code exactly as printed, or null if no code is printed"),
    "revCode": f(NS, "4-digit revenue code if printed, else null"),
    "description": f("string", "Line description as printed"),
    "quantity": f("number", "Units; 1 if not printed"),
    "chargePrinted": f("string", 'The charge exactly as printed on this line, character for character (e.g. "3,694.00"). Copy it; don\'t calculate.'),
    "charge": f("number", "Same amount as a number. Must equal chargePrinted."),
})
PARSED_BILL = obj({
    "isMedicalBill": f("boolean", "False if this is not a hospital or medical bill (e.g. a store receipt)"),
    "hospitalName": f(NS),
    "hospitalWebsite": f(NS, "Only if printed on the bill"),
    "hospitalAddress": f(NS, "Hospital street address with city, as printed"),
    "billingPhone": f(NS),
    "accountNumber": f(NS),
    "patientName": f(NS),
    "patientAddress": f(NS, "Patient or guarantor mailing address as printed, else null"),
    "statementDate": f(NS, "YYYY-MM-DD"),
    "serviceDate": f(NS, "First date of service, YYYY-MM-DD"),
    "insurancePayer": f(NS, "Insurance named on the bill, or null if self-pay/none"),
    "insurancePaid": f("number", "Total insurance payments shown, 0 if none"),
    "adjustments": f("number", "Total discounts/adjustments shown as a positive number, 0 if none"),
    "patientPaid": f("number", "Payments already made by the patient, 0 if none"),
    "totalCharges": f(NN),
    "amountDue": f(NN),
    "isItemized": f("boolean", "True if individual services with charges are listed"),
    "lines": {"type": "array", "items": LINE},
    "unreadable": {"type": "array", "items": {"type": "string"}, "description": "Parts of the bill you could not read with confidence"},
})
CHARGES_COLUMN = obj({"charges": {"type": "array", "items": {"type": "string"},
                                  "description": "Each line item's charge exactly as printed, top to bottom"}})


_INT = r"(\d{1,3}(?:,\d{3})+|\d+)"
_SPLIT = re.compile(rf"^{_INT}\s+(\d{{2}})$")
_PLAIN = re.compile(rf"^{_INT}?(\.\d{{1,2}})?$")
_NOISE = re.compile(rf"^{_INT}(\.\d{{2}})\s+\S.*$")


def money(s) -> float | None:
    """printedAmount in convex/lib/amount.ts: "11963 00" -> 11963.0, "135.00 45" -> 135.0, junk -> None."""
    s = str(s or "").strip()
    if not s:
        return None
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg, s = True, s[1:-1].strip()
    s = re.sub(r"^\$\s*", "", s)
    if s.startswith("-"):
        neg, s = not neg, re.sub(r"^\$\s*", "", s[1:].strip())
    m = _SPLIT.match(s)
    if m:
        n = float(m[1].replace(",", "") + "." + m[2])
    elif (m := _PLAIN.match(s)) and (m[1] or m[2]):
        n = float((m[1] or "0").replace(",", "") + (m[2] or ""))
    elif m := _NOISE.match(s):
        n = float(m[1].replace(",", "") + m[2])
    else:
        return None
    return -n if neg else n


class Azure:
    """Azure OpenAI chat completions with a JSON schema, the same request as the app's azure adapter."""

    def __init__(self, env_file: Path):
        e = {}
        for line in env_file.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                e[k.strip()] = v.strip().strip('"').strip("'")
        self.base = e["AZURE_OPENAI_ENDPOINT"].rstrip("/")
        self.key = e["AZURE_OPENAI_API_KEY"]
        self.model = e.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4.1-mini")
        self.version = e.get("AZURE_OPENAI_API_VERSION", "2024-10-21")

    def ask(self, path: Path, prompt: str, schema: dict, max_tokens: int) -> dict:
        data = base64.standard_b64encode(path.read_bytes()).decode()
        media = ({"type": "file", "file": {"filename": path.name, "file_data": f"data:application/pdf;base64,{data}"}}
                 if path.suffix == ".pdf" else {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{data}"}})
        body = {"max_completion_tokens": max_tokens,
                "messages": [{"role": "user", "content": [media, {"type": "text", "text": prompt}]}],
                "response_format": {"type": "json_schema", "json_schema": {"name": "output", "schema": schema, "strict": True}}}
        url = f"{self.base}/openai/deployments/{self.model}/chat/completions?api-version={self.version}"
        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "api-key": self.key})
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=180) as r:
                    j = json.loads(r.read())
                break
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 4:
                    time.sleep(2 ** attempt * 5)
                    continue
                raise RuntimeError(f"Azure {e.code}: {e.read()[:200].decode(errors='replace')}")
        msg = j["choices"][0]["message"]
        if msg.get("refusal"):
            raise RuntimeError("model declined to read this file")
        return json.loads(msg["content"])


def ask(client, path: Path, prompt: str, schema: dict, max_tokens: int) -> dict:
    if isinstance(client, Azure):
        return client.ask(path, prompt, schema, max_tokens)
    data = base64.standard_b64encode(path.read_bytes()).decode()
    if path.suffix == ".pdf":
        media = {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": data}}
    else:
        media = {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": data}}
    res = client.beta.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
        messages=[{"role": "user", "content": [media, {"type": "text", "text": prompt}]}],
    )
    if res.stop_reason == "refusal":
        raise RuntimeError("model declined to read this file")
    return json.loads(next(b.text for b in res.content if b.type == "text"))


def read_full(client, path: Path) -> dict:
    """readWithClaude: the full read, then each charge re-parsed from its printed text (English patient)."""
    bill = ask(client, path, READ_PROMPT, PARSED_BILL, 16000)
    for l in bill["lines"]:
        cp = str(l.get("chargePrinted") or "")
        v = money(cp)
        if v is not None and any(c.isdigit() for c in cp):
            l["charge"] = v
    return bill  # niceName only changes patientName, which nothing scores


def read_column(client, path: Path) -> list[float] | None:
    """readChargesColumn: null when the read fails or any amount isn't a number."""
    try:
        raw = ask(client, path, COLUMN_PROMPT, CHARGES_COLUMN, 4000).get("charges")
    except (anthropic.APIError, RuntimeError, json.JSONDecodeError, StopIteration):
        return None
    if not raw:
        return None
    nums = [money(x) for x in raw]
    return None if any(n is None for n in nums) else nums


def read_one(client: anthropic.Anthropic, path: Path) -> tuple[dict, dict]:
    """readAndCheck step 1: both reads in parallel; where they disagree, use the column and ask the patient.
    Returns (the bill the app keeps, the two raw reads)."""
    with ThreadPoolExecutor(2) as ex:
        ff, fc = ex.submit(read_full, client, path), ex.submit(read_column, client, path)
        first, column = ff.result(), fc.result()
    raw = {"full": json.loads(json.dumps(first)), "column": column}
    bill = first
    if column is not None and len(column) == len(first["lines"]):
        disagree = [{"index": i, "first": column[i], "second": l["charge"]}
                    for i, l in enumerate(first["lines"]) if abs(column[i] - l["charge"]) > 0.005]
        if disagree:
            bill = {**first, "lines": [{**l, "charge": column[i]} for i, l in enumerate(first["lines"])],
                    "amountChecks": disagree,
                    "unreadable": first["unreadable"] + [
                        f"Line {x['index'] + 1}: we read ${x['first']:.2f}, but a second look read ${x['second']:.2f}. "
                        "Please check this amount on your bill." for x in disagree]}
    return bill, raw


def save(out: Path, bill: dict, raw: dict) -> None:
    out.write_text(json.dumps(bill, indent=1))
    out.with_name(out.name.replace(".parsed.json", ".reads.json")).write_text(json.dumps(raw, indent=1))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, default=HERE / "out")
    ap.add_argument("--dst", type=Path, default=HERE / "preds")
    ap.add_argument("--only", nargs="*", help="bill ids to read")
    ap.add_argument("--pdf", action="store_true", help="send the PDF instead of the PNG when a bill has one")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("-j", type=int, default=4, help="parallel requests")
    ap.add_argument("--provider", choices=["anthropic", "azure"], default="anthropic")
    ap.add_argument("--env", type=Path, help="env file with the Azure keys (for --provider azure)")
    a = ap.parse_args()
    a.dst.mkdir(exist_ok=True)
    if a.provider == "azure" and not a.env:
        raise SystemExit("--provider azure needs --env <file with AZURE_OPENAI_* keys>")
    client = Azure(a.env) if a.provider == "azure" else anthropic.Anthropic()

    jobs = []
    for tp in sorted(a.src.glob("bill-*.truth.json")):
        t = json.loads(tp.read_text())
        if a.only and t["id"] not in a.only:
            continue
        out = a.dst / f"{t['id']}.parsed.json"
        if out.exists() and not a.force:
            continue
        f = t["files"].get("pdf") if a.pdf and "pdf" in t["files"] else t["files"]["png"]
        jobs.append((t["id"], a.src / f, out))

    if not jobs:
        print("nothing to read")
        return
    # One request first: a bad key or an empty credit balance fails every bill the same way.
    try:
        save(jobs[0][2], *read_one(client, jobs[0][1]))
        print(f"{jobs[0][0]}: ok", flush=True)
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError, anthropic.BadRequestError, RuntimeError) as e:
        raise SystemExit(f"first request failed, stopping: {e}")

    def run(job):
        bid, src, out = job
        t0 = time.time()
        try:
            save(out, *read_one(client, src))
            return True, f"{bid}: ok ({time.time() - t0:.0f}s)"
        except (anthropic.APIError, RuntimeError, json.JSONDecodeError, StopIteration) as e:
            return False, f"{bid}: FAILED {type(e).__name__}: {e}"

    ok = 1
    with ThreadPoolExecutor(a.j) as ex:
        for good, msg in ex.map(run, jobs[1:]):
            ok += good
            print(msg, flush=True)
    print(f"{ok}/{len(jobs)} bills read into {a.dst}")


if __name__ == "__main__":
    main()
