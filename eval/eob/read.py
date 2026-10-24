"""Read EOB images into ParsedEob JSON with the same model, prompt, schema and settings as the app
(readEobFile in convex/agent.ts), so score.py can measure reading without running Convex.

  python -I read.py                          # every out/pair-*.eob.png -> preds/<id>.eob.json
  python -I read.py --only pair-001 pair-002
  python -I read.py --provider azure --env ~/Code/recount/.env.azure --dst preds-azure

The prompt is EOB_PROMPT, taken from convex/agent.ts each run, so it can't drift. If that file
can't be read, the copy below (FALLBACK_PROMPT) is used and a warning is printed. The schema is
a copy of ParsedEob in convex/lib/eob.ts: keep it in sync. The request itself (model, effort,
fallbacks, Azure adapter) is ../read.py's `ask`, the same one the bill eval uses.

Needs ANTHROPIC_API_KEY in the environment (or --env-file with it). Pairs already read are
skipped unless --force.
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_HERE = _Path(__file__).resolve().parent
_sys.path[:0] = [str(_HERE.parent), str(_HERE)]  # -I leaves the script dir off sys.path; bill eval first

import argparse
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic

import read as bill_read  # ../read.py: ask(), Azure, MODEL

HERE = _HERE
AGENT_TS = HERE.parent.parent / "convex" / "agent.ts"
MAX_TOKENS = 12000  # readEobFile maxTokens

# Copy of EOB_PROMPT in convex/agent.ts (2026-10-24). Used only if agent.ts can't be read.
FALLBACK_PROMPT = """This is an insurance Explanation of Benefits (EOB) a patient photographed or uploaded: the insurer's statement for a hospital claim. It is not a bill. Transcribe it into the schema.
Rules:
- If this is not an EOB (for example a hospital bill, a receipt or a letter), set isEob to false and leave the rest empty or null.
- Copy names, codes, dates and amounts exactly as printed. Never guess a code, a date or an amount that isn't printed; use null.
- "patientOwes" and "totalPatientOwes" are what the EOB says the patient may owe the provider (often called "your responsibility", "you may owe" or "patient responsibility"). Copy them as printed; never compute them.
- "notCovered" is the amount the plan denied or did not cover on that line, 0 if none. Copy each remark or denial code with its text as printed.
- network: "in" only if the provider is marked in-network or participating, "out" only if marked out-of-network or non-participating, else "unknown".
- claimStatus: "pending" if the claim is still in process, "denied" if the whole claim was denied, "partly_denied" if some lines were denied, "processed" if it was paid or processed, else "unknown".
- Amounts are positive numbers in dollars.
- If a number is blurry or cut off, put your best reading in the field AND add a short plain note to "unreadable" that a patient can understand (e.g. "The amount you owe is blurry"). Never use field names in the notes."""


def eob_prompt() -> tuple[str, str]:
    """(prompt, where it came from). Reads the EOB_PROMPT template literal out of convex/agent.ts."""
    try:
        src = AGENT_TS.read_text()
    except OSError:
        return FALLBACK_PROMPT, "copy in read.py (convex/agent.ts not found)"
    m = re.search(r"const EOB_PROMPT\s*=\s*`((?:[^`\\]|\\.)*)`", src)
    if not m or "${" in m.group(1):
        return FALLBACK_PROMPT, "copy in read.py (EOB_PROMPT not found as a plain template literal in convex/agent.ts)"
    return m.group(1).replace("\\`", "`").replace("\\\\", "\\"), "convex/agent.ts"


f, obj, NS, NN = bill_read.f, bill_read.obj, bill_read.NS, bill_read.NN
# Same fields, order and descriptions as convex/lib/eob.ts (EobLine, ParsedEob).
EOB_LINE = obj({
    "date": f(NS, "Service date YYYY-MM-DD, or null if not printed"),
    "code": f(NS, "CPT/HCPCS or revenue code exactly as printed, or null"),
    "description": f("string", "Service description as printed"),
    "billed": f(NN, "Amount the provider billed for this line"),
    "allowed": f(NN, "Amount the plan allowed (also called approved, eligible or negotiated amount)"),
    "planPaid": f(NN, "Amount the plan paid for this line"),
    "patientOwes": f(NN, "Patient responsibility for this line: deductible + copay + coinsurance + not covered"),
    "notCovered": f(NN, "Amount the plan did not cover or denied for this line, 0 if none"),
    "remark": f(NS, "Denial or remark code and its text as printed (e.g. 'CO-50 not medically necessary'), else null"),
})
PARSED_EOB = obj({
    "isEob": f("boolean", "False if this is not an insurance Explanation of Benefits (e.g. a hospital bill or a receipt)"),
    "payer": f(NS, "Insurance company or plan name"),
    "planType": f(NS, "HMO, PPO, EPO, Medi-Cal, Medicare, etc. if printed"),
    "memberName": f(NS),
    "memberId": f(NS),
    "claimNumber": f(NS),
    "providerName": f(NS, "The hospital or provider the claim is for, as printed"),
    "serviceDateFrom": f(NS, "YYYY-MM-DD"),
    "serviceDateTo": f(NS, "YYYY-MM-DD"),
    "network": {"type": "string", "enum": ["in", "out", "unknown"],
                "description": "in if the provider is marked in-network/participating, out if out-of-network/non-participating, else unknown"},
    "emergency": f(["boolean", "null"], "True if the claim is marked as emergency/ER care, null if not shown"),
    "claimStatus": {"type": "string", "enum": ["processed", "denied", "partly_denied", "pending", "unknown"]},
    "totalBilled": f(NN),
    "totalAllowed": f(NN),
    "totalPlanPaid": f(NN),
    "totalPatientOwes": f(NN, "What the EOB says the patient may owe the provider in total"),
    "appealDeadline": f(NS, "Appeal deadline or time limit exactly as printed, else null"),
    "appealAddress": f(NS, "Where to send an appeal or grievance, as printed"),
    "insurerPhone": f(NS),
    "lines": {"type": "array", "items": EOB_LINE},
    "unreadable": {"type": "array", "items": {"type": "string"}, "description": "Parts you could not read with confidence"},
})


def load_env(path: Path, names: list[str]) -> None:
    """Set the named variables from a KEY=value file if they aren't set already. Values are never printed."""
    for line in path.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            k = k.strip().removeprefix("export ").strip()
            if k in names and not os.environ.get(k):
                os.environ[k] = v.strip().strip('"').strip("'")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, default=HERE / "out")
    ap.add_argument("--dst", type=Path, default=HERE / "preds")
    ap.add_argument("--only", nargs="*", help="pair ids to read")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("-j", type=int, default=4, help="parallel requests")
    ap.add_argument("--provider", choices=["anthropic", "azure"], default="anthropic")
    ap.add_argument("--env", type=Path, help="env file with the Azure keys (for --provider azure)")
    ap.add_argument("--env-file", type=Path, help="env file to take ANTHROPIC_API_KEY from (e.g. ../../.env.local)")
    a = ap.parse_args()
    if a.provider == "azure" and not a.env:
        raise SystemExit("--provider azure needs --env <file with AZURE_OPENAI_* keys>")
    if a.env_file:
        load_env(a.env_file, ["ANTHROPIC_API_KEY"])
    prompt, where = eob_prompt()
    print(f"prompt: EOB_PROMPT from {where}")
    if where != "convex/agent.ts":
        print("WARNING: using the copy of the prompt; it may be out of date", file=_sys.stderr)
    client = bill_read.Azure(a.env) if a.provider == "azure" else anthropic.Anthropic()
    a.dst.mkdir(exist_ok=True)

    jobs = []
    for tp in sorted(a.src.glob("pair-*.truth.json")):
        t = json.loads(tp.read_text())
        if a.only and t["id"] not in a.only:
            continue
        out = a.dst / f"{t['id']}.eob.json"
        if out.exists() and not a.force:
            continue
        img = a.src / t["files"]["eob"]
        if not img.exists():
            raise SystemExit(f"{img} missing; run render.py first")
        jobs.append((t["id"], img, out))
    if not jobs:
        print("nothing to read")
        return

    def one(job) -> tuple[bool, str]:
        pid, img, out = job
        t0 = time.time()
        try:
            eob = bill_read.ask(client, img, prompt, PARSED_EOB, MAX_TOKENS)
        except (anthropic.APIError, RuntimeError, json.JSONDecodeError, StopIteration) as e:
            return False, f"{pid}: FAILED {type(e).__name__}: {e}"
        out.write_text(json.dumps(eob, indent=1))
        return True, f"{pid}: ok ({time.time() - t0:.0f}s)"

    # One request first: a bad key or an empty balance fails every pair the same way.
    good, msg = one(jobs[0])
    print(msg, flush=True)
    if not good:
        raise SystemExit("first request failed, stopping")
    ok = 1
    with ThreadPoolExecutor(a.j) as ex:
        for good, msg in ex.map(one, jobs[1:]):
            ok += good
            print(msg, flush=True)
    print(f"{ok}/{len(jobs)} EOBs read into {a.dst}")


if __name__ == "__main__":
    main()
