"""Second review: try to clear every flagged sentence before we publish it.

Takes each packet that a first reviewer called "conflict" or "likely" and builds an
adversarial prompt: the verifier's job is to find the reading most favorable to the
hospital. Its verdict is written to decisions/ like any other review; report.py keeps
the milder of the two verdicts, so a flag survives only if both reviewers agree it's real.

Usage:
  python3 -I audit/verify.py batches 40                  # packets a first reviewer flagged
  python3 -I audit/verify.py current likely 25 [RULE,..] [prefix]
                        # packets whose merged verdict is "likely" (optionally only, or with -RULE
                        # without, these rules), written as verify_batches/<prefix>_NNN.jsonl
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
- the law quoted doesn't actually cover what the sentence does, or covers only some patients (e.g. the lien ban protects only patients eligible for charity care or discounts) and the sentence is limited to the others;
- ELSEWHERE IN THE SAME DOCUMENT shows a California addendum or California section that controls and follows the law on this topic, or another passage that forbids the practice for the patients the law protects. Search it before keeping any flag. If the two parts plainly contradict each other, use "ask".

Keep "conflict" only if the policy plainly imposes the forbidden practice on California patients who would otherwise qualify. Use "likely" if it probably does but you can construct a reasonable compliant reading. Use "ask" if it's genuinely unclear.

Return JSON only: {"verdict": "conflict|likely|ask|complies", "quote": "<exact words copied verbatim from the SENTENCE, CONTEXT or ELSEWHERE text>", "explanation": "<one or two plain sentences>"}"""


def prompt(p: dict, first: str) -> str:
    return (
        f"{VERIFY}\n\nRULE: {p['ruleTitle']} ({p['cite']})\nLAW SAYS: {p['lawQuote']}\nQUESTION: {p['question']}\n"
        f"FIRST REVIEWER SAID: {first}\n\nSENTENCE:\n{p['sentence']}\n\nCONTEXT:\n{p['context']}"
        f"\n\nELSEWHERE IN THE SAME DOCUMENT (California addendum, controlling language, other statements on this topic):\n"
        f"{p.get('elsewhere') or '(none found)'}"
    )


def write(out: Path, prefix: str, items: list[tuple[dict, str]], size: int) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob(f"{prefix}_*.jsonl"):
        old.unlink()
    for i in range(0, len(items), size):
        with (out / f"{prefix}_{i // size:03d}.jsonl").open("w") as fh:
            for p, first in items[i: i + size]:
                fh.write(json.dumps({"id": p["id"], "prompt": prompt(p, first)}) + "\n")
    print(f"{len(items)} packets -> {(len(items) + size - 1) // size} batches in {out}")


def current(verdicts: set[str], size: int, rules: str = "", prefix: str = "current") -> None:
    """Second pass over packets by their merged verdict, e.g. every remaining "likely"."""
    from report import load_decisions

    packets = {p["id"]: p for p in load_packets()}
    merged = load_decisions(packets)
    want = {r for r in rules.split(",") if r and not r.startswith("-")}
    skip = {r[1:] for r in rules.split(",") if r.startswith("-")}
    items = [(packets[pid], d.get("explanation", "")) for pid, d in sorted(merged.items())
             if d["verdict"] in verdicts and (not want or packets[pid]["rule"] in want) and packets[pid]["rule"] not in skip]
    write(REVIEW / "verify_batches", prefix, items, size)


def main(size: int) -> None:
    packets = {p["id"]: p for p in load_packets()}
    flagged: dict[str, str] = {}
    for f in sorted(DECISIONS.glob("agent_*.jsonl")):
        for line in f.read_text().splitlines():
            if line.strip():
                d = json.loads(line)
                if d.get("verdict") in ("conflict", "likely") and d["id"] in packets:
                    flagged[d["id"]] = d.get("explanation", "")
    write(REVIEW / "verify_batches", "verify", [(packets[pid], flagged[pid]) for pid in sorted(flagged)], size)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "current":
        current(set(sys.argv[2].split(",")), int(sys.argv[3]) if len(sys.argv) > 3 else 25, sys.argv[4] if len(sys.argv) > 4 else "",
                sys.argv[5] if len(sys.argv) > 5 else "current")
    else:
        main(int(sys.argv[2]) if len(sys.argv) > 2 else 40)
