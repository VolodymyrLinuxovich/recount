"""Read bill images into ParsedBill JSON with the same model, prompt and settings as the app
(convex/agent.ts readWithClaude), so score.py can measure reading without running Convex.

  python -I read.py                      # every out/bill-*.png -> preds/<id>.parsed.json
  python -I read.py --only bill-001 bill-002 --pdf

Needs ANTHROPIC_API_KEY (or an `ant auth login` profile). Bills already read are skipped
unless --force. Keep READ_PROMPT and the schema in sync with convex/agent.ts and
convex/lib/bill.ts.
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parent))  # -I leaves the script dir off sys.path

import argparse
import base64
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic

HERE = Path(__file__).resolve().parent
MODEL = "claude-opus-5-5"

READ_PROMPT = """This is a hospital bill a patient photographed or uploaded. Transcribe it into the schema.
Rules:
- Copy codes, descriptions, dates and amounts exactly as printed. Never guess a CPT/HCPCS code that isn't printed; use null.
- If a number is blurry or cut off, put your best reading in the field AND name that field in "unreadable".
- Payments and adjustments are positive numbers.
- If this is not a hospital or medical bill, return empty lines and say so in "unreadable"."""

S, N, NS, NN = {"type": "string"}, {"type": "number"}, {"type": ["string", "null"]}, {"type": ["number", "null"]}


def obj(props: dict) -> dict:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


LINE = obj({"date": NS, "code": NS, "revCode": NS, "description": S, "quantity": N, "charge": N})
PARSED_BILL = obj({
    "hospitalName": NS, "hospitalWebsite": NS, "billingPhone": NS, "accountNumber": NS,
    "patientName": NS, "statementDate": NS, "serviceDate": NS, "insurancePayer": NS,
    "insurancePaid": N, "adjustments": N, "patientPaid": N, "totalCharges": NN, "amountDue": NN,
    "isItemized": {"type": "boolean"}, "lines": {"type": "array", "items": LINE},
    "unreadable": {"type": "array", "items": S},
})


def read_one(client: anthropic.Anthropic, path: Path) -> dict:
    data = base64.standard_b64encode(path.read_bytes()).decode()
    if path.suffix == ".pdf":
        media = {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": data}}
    else:
        media = {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": data}}
    res = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": PARSED_BILL}},
        messages=[{"role": "user", "content": [media, {"type": "text", "text": READ_PROMPT}]}],
    )
    if res.stop_reason == "refusal":
        raise RuntimeError("model declined to read this file")
    text = next(b.text for b in res.content if b.type == "text")
    return json.loads(text)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, default=HERE / "out")
    ap.add_argument("--dst", type=Path, default=HERE / "preds")
    ap.add_argument("--only", nargs="*", help="bill ids to read")
    ap.add_argument("--pdf", action="store_true", help="send the PDF instead of the PNG when a bill has one")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("-j", type=int, default=4, help="parallel requests")
    a = ap.parse_args()
    a.dst.mkdir(exist_ok=True)
    client = anthropic.Anthropic()

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
        jobs[0][2].write_text(json.dumps(read_one(client, jobs[0][1]), indent=1))
        print(f"{jobs[0][0]}: ok", flush=True)
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError, anthropic.BadRequestError) as e:
        raise SystemExit(f"first request failed, stopping: {e}")

    def run(job):
        bid, src, out = job
        t0 = time.time()
        try:
            out.write_text(json.dumps(read_one(client, src), indent=1))
            return True, f"{bid}: ok ({time.time() - t0:.0f}s)"
        except (anthropic.APIError, RuntimeError, json.JSONDecodeError) as e:
            return False, f"{bid}: FAILED {type(e).__name__}: {e}"

    ok = 1
    with ThreadPoolExecutor(a.j) as ex:
        for good, msg in ex.map(run, jobs[1:]):
            ok += good
            print(msg, flush=True)
    print(f"{ok}/{len(jobs)} bills read into {a.dst}")


if __name__ == "__main__":
    main()
