"""Turn candidate sentences into review packets, and review them.

A packet holds the rule, the law's own words, the candidate sentence, three sentences on
each side, the page, and the policy's effective date. The reviewer must return one verdict:

  conflict   the policy imposes what the law forbids
  likely     probably conflicts, but wording leaves some room
  ask        ambiguous; worth asking the hospital
  complies   mentions the topic but follows the law (or only applies outside California)

and must quote the exact words its verdict rests on. Anything it can't quote is dropped.

Usage:
  python3 -I audit/review.py packets            # build audit/review/packets.jsonl from the corpus
  python3 -I audit/review.py claude             # review packets with the Claude API (needs credit)
  python3 -I audit/review.py batches 40         # split packets into files for review agents
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from rules import RULES_BY_ID, candidates, split_sentences  # noqa: E402

CORPUS = Path(os.environ.get("AUDIT_CORPUS", HERE / "corpus"))
REVIEW_DIR = os.environ.get("AUDIT_REVIEW")
REVIEW = Path(REVIEW_DIR) if REVIEW_DIR else HERE / "review"
PACKETS = REVIEW / "packets.jsonl"
DECISIONS = REVIEW / "decisions"
CONTEXT = 3

INSTRUCTIONS = """You are checking one sentence from a California hospital's financial assistance or debt collection policy against California law.

Decide what the POLICY does, judged by the sentence in its surrounding context:
- "conflict": the policy imposes what the law forbids, for California patients.
- "likely": it probably does, but the wording leaves some room (e.g. "should", "best efforts").
- "ask": ambiguous; a patient should ask the hospital what it means.
- "complies": it mentions the topic but follows the law, forbids the practice, or the practice only applies outside California.

Be strict about false accusations: hospitals often state a prohibition ("will not report to credit agencies"), describe the hospital's own deadlines ("we will respond within 30 days"), or describe appeal or payment deadlines that are not application deadlines. Those are "complies".

Return JSON only: {"verdict": "...", "quote": "<exact words from the sentence or context that your verdict rests on>", "explanation": "<one or two plain sentences for a patient>"}"""


def packet_id(rule: str, sentence: str) -> str:
    norm = " ".join(sentence.lower().split())
    return hashlib.sha1(f"{rule}|{norm}".encode()).hexdigest()[:16]


def build_packets() -> int:
    hospitals = json.loads((CORPUS / "hospitals.json").read_text())
    seen: dict[str, dict] = {}
    for h in hospitals:
        for doc_type, doc in (h.get("docs") or {}).items():
            if not doc or not doc.get("text_path"):
                continue
            path = Path(doc["text_path"])
            if not path.is_absolute():
                path = HERE / path
            if not path.exists():
                continue
            pages = json.loads(path.read_text()).get("pages", [])
            # Sentences across the whole document, remembering the page each came from.
            sents: list[tuple[int, str]] = []
            for p in pages:
                sents += [(p.get("n"), s) for s in split_sentences(p.get("text") or "")]
            texts = [s for _, s in sents]
            for i, (page, s) in enumerate(sents):
                for c in candidates(s, doc_type):
                    pid = packet_id(c["rule"], s)
                    ref = {"hospital": h["key"], "name": h.get("name"), "docType": doc_type, "docUrl": doc.get("url"),
                           "effectiveDate": doc.get("effective_date"), "page": page}
                    if pid in seen:
                        seen[pid]["refs"].append(ref)  # same wording in another hospital's policy
                        continue
                    rule = RULES_BY_ID[c["rule"]]
                    seen[pid] = {
                        "id": pid,
                        "rule": rule.id,
                        "ruleTitle": rule.title,
                        "cite": rule.cite,
                        "lawQuote": rule.law_quote,
                        "question": rule.question,
                        "sentence": s,
                        "context": " ".join(texts[max(0, i - CONTEXT): i + CONTEXT + 1]),
                        "refs": [ref],
                    }
    REVIEW.mkdir(exist_ok=True)
    with PACKETS.open("w") as f:
        for p in seen.values():
            f.write(json.dumps(p) + "\n")
    return len(seen)


def load_packets() -> list[dict]:
    return [json.loads(line) for line in PACKETS.read_text().splitlines() if line.strip()]


def prompt_for(p: dict) -> str:
    return (
        f"{INSTRUCTIONS}\n\nRULE: {p['ruleTitle']} ({p['cite']})\nLAW SAYS: {p['lawQuote']}\nQUESTION: {p['question']}\n\n"
        f"SENTENCE:\n{p['sentence']}\n\nCONTEXT (surrounding text):\n{p['context']}"
    )


def valid(decision: dict, p: dict) -> bool:
    if decision.get("verdict") not in ("conflict", "likely", "ask", "complies"):
        return False
    q = " ".join((decision.get("quote") or "").split()).lower()
    hay = " ".join((p["sentence"] + " " + p["context"]).split()).lower()
    return bool(q) and q in hay  # the quote must really be in the policy text


def review_with_claude() -> None:
    import anthropic

    client = anthropic.Anthropic()
    DECISIONS.mkdir(parents=True, exist_ok=True)
    out = DECISIONS / "claude.jsonl"
    done = {json.loads(l)["id"] for l in out.read_text().splitlines()} if out.exists() else set()
    schema = {
        "type": "object",
        "properties": {
            "verdict": {"type": "string", "enum": ["conflict", "likely", "ask", "complies"]},
            "quote": {"type": "string"},
            "explanation": {"type": "string"},
        },
        "required": ["verdict", "quote", "explanation"],
        "additionalProperties": False,
    }
    with out.open("a") as f:
        for p in load_packets():
            if p["id"] in done:
                continue
            res = client.messages.create(
                model="claude-opus-5-5",
                max_tokens=2000,
                output_config={"effort": "medium", "format": {"type": "json_schema", "schema": schema}},
                messages=[{"role": "user", "content": prompt_for(p)}],
            )
            if res.stop_reason == "refusal":
                continue
            text = next((b.text for b in res.content if b.type == "text"), "")
            d = json.loads(text)
            d["id"] = p["id"]
            d["valid"] = valid(d, p)
            d["reviewer"] = "claude-opus-5-5"
            f.write(json.dumps(d) + "\n")
            f.flush()
            print(p["id"], d["verdict"], "ok" if d["valid"] else "QUOTE NOT FOUND")


def write_batches(size: int) -> None:
    packets = load_packets()
    bdir = REVIEW / "batches"
    bdir.mkdir(parents=True, exist_ok=True)
    for old in bdir.glob("*.jsonl"):
        old.unlink()
    for i in range(0, len(packets), size):
        with (bdir / f"batch_{i // size:03d}.jsonl").open("w") as f:
            for p in packets[i: i + size]:
                f.write(json.dumps({"id": p["id"], "prompt": prompt_for(p)}) + "\n")
    print(f"{len(packets)} packets -> {(len(packets) + size - 1) // size} batches in {bdir}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "packets"
    if cmd == "packets":
        print(build_packets(), "unique packets")
    elif cmd == "claude":
        review_with_claude()
    elif cmd == "batches":
        write_batches(int(sys.argv[2]) if len(sys.argv) > 2 else 40)
    else:
        sys.exit(__doc__)
