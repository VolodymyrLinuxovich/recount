"""Second review: try to clear every flagged sentence before we publish it.

Takes each packet that a first reviewer called "conflict" or "likely" and builds an
adversarial prompt: the verifier's job is to find the reading most favorable to the
hospital. Its verdict is written to decisions/ like any other review; report.py keeps
the milder of the two verdicts, so a flag survives only if both reviewers agree it's real.

Usage: python3 -I audit/verify.py batches 40
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from review import DECISIONS, REVIEW, load_packets  # noqa: E402

VERIFY = """You are the hospital's advocate in a second review. A first reviewer says this policy sentence breaks California law. Your job: find the reading MOST favorable to the hospital, then decide honestly.

Clear it ("complies") if any of these is true:
- the text only defines a term or lists federal "extraordinary collection actions" without saying the hospital or its agents do them in California;
- the practice is stated as prohibited, or applies only outside California;
- it's a deadline for something other than applying (appeals, payments, the hospital's own response, supplying a missing document after which the patient can still reapply);
- it asks for information on an application form as optional, or uses assets only for a purpose the law allows (Medicare cost-sharing waivers, health savings accounts for payment plans, patients above 400% of the poverty level);
- the law quoted doesn't actually cover what the sentence does.

Keep "conflict" only if the policy plainly imposes the forbidden practice on California patients who would otherwise qualify. Use "likely" if it probably does but you can construct a reasonable compliant reading. Use "ask" if it's genuinely unclear.

Return JSON only: {"verdict": "conflict|likely|ask|complies", "quote": "<exact words copied verbatim from the SENTENCE or CONTEXT>", "explanation": "<one or two plain sentences>"}"""


def main(size: int) -> None:
    packets = {p["id"]: p for p in load_packets()}
    flagged: dict[str, str] = {}
    for f in sorted(DECISIONS.glob("agent_*.jsonl")):
        for line in f.read_text().splitlines():
            if line.strip():
                d = json.loads(line)
                if d.get("verdict") in ("conflict", "likely") and d["id"] in packets:
                    flagged[d["id"]] = d.get("explanation", "")
    out = REVIEW / "verify_batches"
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.jsonl"):
        old.unlink()
    ids = sorted(flagged)
    for i in range(0, len(ids), size):
        with (out / f"verify_{i // size:03d}.jsonl").open("w") as fh:
            for pid in ids[i: i + size]:
                p = packets[pid]
                prompt = (
                    f"{VERIFY}\n\nRULE: {p['ruleTitle']} ({p['cite']})\nLAW SAYS: {p['lawQuote']}\n"
                    f"FIRST REVIEWER SAID: {flagged[pid]}\n\nSENTENCE:\n{p['sentence']}\n\nCONTEXT:\n{p['context']}"
                )
                fh.write(json.dumps({"id": pid, "prompt": prompt}) + "\n")
    print(f"{len(ids)} flagged packets -> {(len(ids) + size - 1) // size} verify batches in {out}")


if __name__ == "__main__":
    main(int(sys.argv[2]) if len(sys.argv) > 2 else 40)
