"""Fill in income cutoffs the rule-based extractor missed, using Claude with a quote check.

For each hospital in convex/lib/hospitalIndex.json with no free-care cutoff, collect the
policy sentences that mention the poverty level, ask Claude which ones state the hospital's
own free-care and discount limits, and keep a number ONLY if:
  - the quote Claude returns appears word for word in the policy text, and
  - the number appears in that quote followed by "%" or "percent".
Otherwise the field stays null and the app uses the state's 400% floor, saying so.
Every filled value is marked "method": "claude" so the app can show where it came from.

Usage: python3 -I pipeline/extract_cutoffs_claude.py   (needs ANTHROPIC_API_KEY)
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
from build_hospital_index import doc_text  # noqa: E402
from fpl_guard import free_cutoff  # noqa: E402

INDEX = ROOT / "convex" / "lib" / "hospitalIndex.json"
CORPUS = ROOT / "audit" / "corpus" / "hospitals.json"
CACHE = ROOT / "pipeline" / "out" / "cutoffs_claude.json"

SCHEMA = {
    "type": "object",
    "properties": {
        "freeCareMaxFplPct": {"type": ["number", "null"]},
        "freeQuote": {"type": ["string", "null"]},
        "discountMaxFplPct": {"type": ["number", "null"]},
        "discountNoCap": {"type": "boolean"},
        "discountQuote": {"type": ["string", "null"]},
    },
    "required": ["freeCareMaxFplPct", "freeQuote", "discountMaxFplPct", "discountNoCap", "discountQuote"],
    "additionalProperties": False,
}

PROMPT = """Below are sentences from a California hospital's financial assistance (charity care) policy that mention the federal poverty level (FPL).
Find the hospital's OWN income limits:
- freeCareMaxFplPct: the highest income (as % of FPL) that still gets FREE care (100% charity / full write-off).
- discountMaxFplPct: the highest income (as % of FPL) that gets a DISCOUNT (partial charity / discount payment). If the policy says there is no upper limit for discounts, set discountNoCap true and discountMaxFplPct null.
Ignore restatements of the law, history ("was increased"), Medicare payment caps, and other programs. If a limit isn't stated, use null. Copy each quote EXACTLY, character for character, from the sentences given.

SENTENCES:
"""


def sentences_with_fpl(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text)
    parts = re.split(r"(?<=[.;:])\s+(?=[A-Z(•\d])", text)
    return [p.strip() for p in parts if re.search(r"poverty|FPL|FPG", p, re.I) and re.search(r"\d\s*(%|percent)", p, re.I)][:40]


def quote_ok(quote: str | None, value: float | None, text: str) -> bool:
    if not quote or value is None:
        return False
    norm = lambda s: re.sub(r"\s+", " ", s).strip().lower()  # noqa: E731
    if norm(quote) not in norm(text):
        return False
    v = int(value) if float(value).is_integer() else value
    return bool(re.search(rf"(?<!\d){re.escape(str(v))}\s*(%|percent)", quote, re.I))


def apply_overrides(data: dict) -> None:
    """Hand-checked corrections (pipeline/cutoff_overrides.json), each backed by a verbatim quote."""
    path = ROOT / "pipeline" / "cutoff_overrides.json"
    if not path.exists():
        return
    fixes = json.loads(path.read_text())["hospitals"]
    for h in data["hospitals"]:
        fix = fixes.get(h["key"])
        if not fix:
            continue
        for k in ("freeCareMaxFplPct", "freeQuote", "discountMaxFplPct", "discountQuote"):
            if k in fix:
                h["fap"][k] = fix[k]
        h["fap"]["method"] = "manual"


def main() -> None:
    import anthropic

    client = anthropic.Anthropic()
    data = json.loads(INDEX.read_text())
    corpus = {h["key"]: h for h in json.loads(CORPUS.read_text())}
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    filled = 0
    for h in data["hospitals"]:
        fap = h["fap"]
        if fap["freeCareMaxFplPct"] is not None or not fap["readable"]:
            continue
        docs = corpus.get(h["key"], {}).get("docs") or {}
        text = doc_text(docs.get("charity_care")) + "\n" + doc_text(docs.get("discount_payment"))
        sents = sentences_with_fpl(text)
        if not sents:
            continue
        if h["key"] not in cache:
            res = client.messages.create(
                model="claude-opus-5-5",
                max_tokens=4000,
                output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
                messages=[{"role": "user", "content": PROMPT + "\n".join(f"- {s}" for s in sents)}],
            )
            if res.stop_reason == "refusal":
                continue
            cache[h["key"]] = json.loads(next(b.text for b in res.content if b.type == "text"))
            CACHE.write_text(json.dumps(cache, indent=1))
        r = cache[h["key"]]
        changed = False
        # "full or partial" doesn't prove FREE care at that income; don't promise it.
        ambiguous = bool(r["freeQuote"] and re.search(r"full or partial|partial or full", r["freeQuote"], re.I))
        # The quote must also show that exact number as the FREE tier (not a discount tier).
        tier_ok = free_cutoff(r["freeQuote"]) == (int(r["freeCareMaxFplPct"]) if r["freeCareMaxFplPct"] is not None else None)
        if quote_ok(r["freeQuote"], r["freeCareMaxFplPct"], text) and not ambiguous and tier_ok:
            fap["freeCareMaxFplPct"], fap["freeQuote"] = r["freeCareMaxFplPct"], r["freeQuote"]
            changed = True
        if fap["discountMaxFplPct"] is None and not fap["discountNoCap"]:
            if r["discountNoCap"] and r["discountQuote"] and r["discountQuote"].lower() in text.lower():
                fap["discountNoCap"], fap["discountQuote"] = True, r["discountQuote"]
                changed = True
            elif quote_ok(r["discountQuote"], r["discountMaxFplPct"], text):
                fap["discountMaxFplPct"], fap["discountQuote"] = r["discountMaxFplPct"], r["discountQuote"]
                changed = True
        if changed:
            fap["method"] = "claude"
            filled += 1
            print(f"{h['name']}: free <= {fap['freeCareMaxFplPct']}, discount <= {fap['discountMaxFplPct']}{' (no cap)' if fap['discountNoCap'] else ''}")
    apply_overrides(data)
    INDEX.write_text(json.dumps(data, separators=(",", ":")))
    have = sum(h["fap"]["freeCareMaxFplPct"] is not None for h in data["hospitals"])
    print(f"filled {filled}; free-care cutoff now known for {have} of {len(data['hospitals'])}")


if __name__ == "__main__":
    main()
