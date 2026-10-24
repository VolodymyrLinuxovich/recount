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
  python3 -I audit/review.py rereview LIENS likely,ask,conflict 25
                                                # batch packets of one rule whose current verdict is listed,
                                                # e.g. after the rule's law text was corrected
"""

from __future__ import annotations

import hashlib
import json
import os
import re
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
EXTRA_CHARS = 1500

# Language that can override a sentence from elsewhere in the same PDF: multistate systems
# often attach a California addendum that controls over the general policy.
CA_RE = re.compile(r"California|addendum|shall control|127400|127405|127425", re.I)
CA_SECTION_RE = re.compile(r"California\b.{0,60}\baddendum|\baddendum\b.{0,60}\bCalifornia|California[- ]specific", re.I)
CONTROLS_RE = re.compile(r"shall control|controls?\b.{0,40}\b(conflict|inconsisten)|in conflict with|supersede", re.I)
BOILERPLATE_RE = re.compile(r"copyright|©|page \d+ of \d+|retrieved \d", re.I)
TOPIC = {
    "ASSETS": r"assets?\b|savings|bank|net worth",
    "LIENS": r"\bliens?\b|real property|residence|garnish|foreclos",
    "CREDIT_REPORTING": r"credit",
    "DEADLINE": r"time limit|deadline|at any time|\bdays\b",
    "INCOME_PROOF": r"pay ?stubs?|tax returns?|documentation|document",
    "MEDICAL_FIRST": r"medi-?cal|medicare|apply for|coverage",
}

INSTRUCTIONS = """You are checking one sentence from a California hospital's financial assistance or debt collection policy against California law.

Decide what the POLICY does, judged by the sentence in its surrounding context and by what the same document says elsewhere:
- "conflict": the policy imposes what the law forbids, for California patients.
- "likely": it probably does, but the wording leaves some room (e.g. "should", "best efforts").
- "ask": ambiguous; a patient should ask the hospital what it means.
- "complies": it mentions the topic but follows the law, forbids the practice, or the practice only applies outside California.

Be strict about false accusations: hospitals often state a prohibition ("will not report to credit agencies"), describe the hospital's own deadlines ("we will respond within 30 days"), or describe appeal or payment deadlines that are not application deadlines. Those are "complies".

California addenda: many hospital systems publish one multistate policy with a California addendum or California-specific section in the same PDF. If the document has a California section that controls (e.g. "this Addendum shall control") and it addresses the topic, judge the policy by the California section, not the general text. Before calling "conflict" or "likely", read ELSEWHERE IN THE SAME DOCUMENT, which lists the document's California, addendum and controlling language plus other statements on the same topic. If that text forbids or limits the practice in a way that makes the policy follow the law, the answer is "complies" (or "ask" if the two parts truly contradict each other).

Read the law precisely: a practice the law bans only for some patients (e.g. liens only for patients eligible for charity care or discounts) is lawful for the others. Federal lists of "extraordinary collection actions" are definitions, not statements that the hospital does them.

Return JSON only: {"verdict": "...", "quote": "<exact words from the sentence, context or elsewhere text that your verdict rests on>", "explanation": "<one or two plain sentences for a patient>"}"""


def document_extra(rule_id: str, texts: list[str], i: int) -> str:
    """Sentences from elsewhere in the document a reviewer must see before accusing:
    controlling language, the California addendum's lines on this topic, and the
    document's other statements on the topic that read as compliance."""
    rule = RULES_BY_ID[rule_id]
    topic = re.compile(TOPIC.get(rule_id, r"$^"), re.I)
    near = set(range(max(0, i - CONTEXT), i + CONTEXT + 1))
    in_ca = False
    scored: list[tuple[int, int, str]] = []
    seen: set[str] = set()
    for j, s in enumerate(texts):
        if CA_SECTION_RE.search(s):
            in_ca = True
        if j in near or s in seen or (BOILERPLATE_RE.search(s) and len(s) < 160):
            continue
        seen.add(s)
        on_topic = bool(topic.search(s))
        ca = bool(CA_RE.search(s))
        if CONTROLS_RE.search(s) and ca:
            score = 4
        elif on_topic and (ca or in_ca):
            score = 3
        elif on_topic and any(o.search(s) for o in rule._ok):
            score = 2  # the document states compliance with this rule somewhere else
        elif ca:
            score = 1
        else:
            continue
        scored.append((score, j, s if len(s) <= 600 else s[:600] + " ..."))
    out, used = [], 0
    for score, j, s in sorted(scored, key=lambda t: (-t[0], t[1])):
        if used + len(s) > EXTRA_CHARS:
            continue
        out.append((j, s))
        used += len(s) + 3
    return " | ".join(s for _, s in sorted(out))


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
                        "elsewhere": document_extra(rule.id, texts, i),
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
        f"\n\nELSEWHERE IN THE SAME DOCUMENT (California addendum, controlling language, other statements on this topic):\n{p.get('elsewhere') or '(none found)'}"
    )


def valid(decision: dict, p: dict) -> bool:
    if decision.get("verdict") not in ("conflict", "likely", "ask", "complies"):
        return False
    q = " ".join((decision.get("quote") or "").split()).lower()
    hay = " ".join((p["sentence"] + " " + p["context"] + " " + (p.get("elsewhere") or "")).split()).lower()
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


def write_rereview(rule: str, verdicts: set[str], size: int) -> None:
    from report import load_decisions

    packets = {p["id"]: p for p in load_packets()}
    current = load_decisions(packets)
    ids = sorted(pid for pid, p in packets.items()
                 if p["rule"] == rule and (current[pid]["verdict"] if pid in current else "unreviewed") in verdicts)
    bdir = REVIEW / "rereview_batches"
    bdir.mkdir(parents=True, exist_ok=True)
    for old in bdir.glob("*.jsonl"):
        old.unlink()
    for i in range(0, len(ids), size):
        with (bdir / f"{rule.lower()}_{i // size:03d}.jsonl").open("w") as f:
            for pid in ids[i: i + size]:
                f.write(json.dumps({"id": pid, "prompt": prompt_for(packets[pid])}) + "\n")
    print(f"{len(ids)} {rule} packets -> {(len(ids) + size - 1) // size} batches in {bdir}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "packets"
    if cmd == "packets":
        print(build_packets(), "unique packets")
    elif cmd == "claude":
        review_with_claude()
    elif cmd == "batches":
        write_batches(int(sys.argv[2]) if len(sys.argv) > 2 else 40)
    elif cmd == "rereview":
        write_rereview(sys.argv[2], set(sys.argv[3].split(",")), int(sys.argv[4]) if len(sys.argv) > 4 else 25)
    else:
        sys.exit(__doc__)
