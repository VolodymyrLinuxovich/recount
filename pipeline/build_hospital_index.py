"""Build the statewide hospital index the app matches bills against.

Input:  audit/corpus/hospitals.json and the policy text extracted from every California
        hospital's filings with HCAI (see audit/crawl.py, audit/extract.py).
Output: convex/lib/hospitalIndex.json, one compact record per hospital:
        names to match on, city/county, the financial assistance policy URL and date,
        the free-care and discount income cutoffs WITH the exact sentence each came
        from, and a billing phone if the policy prints one.

Cutoffs are read by the same conservative extractor the Apify Actor uses
(actor/src/fpl.py): a number is only kept when a sentence ties it to the poverty
level, history and restated law are ignored, and every number keeps its sentence.
Anything not found stays null; the app then falls back to the state's 400% floor.

Usage: python3 -I pipeline/build_hospital_index.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "actor"))
from src.fpl import extract_thresholds, find_phones  # noqa: E402

CORPUS = ROOT / "audit" / "corpus"
OUT = ROOT / "convex" / "lib" / "hospitalIndex.json"

STOP = {"the", "of", "and", "inc", "llc", "hospital", "hospitals", "medical", "center", "centre", "health",
        "healthcare", "care", "campus", "regional", "community", "california", "ca"}


def tokens(name: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", name.lower().replace("&", " and ").replace("’", "'").replace("'", ""))
    return [w for w in words if w not in STOP]


def doc_text(doc: dict | None) -> str:
    if not doc or not doc.get("text_path") or doc.get("needs_ocr"):
        return ""
    path = Path(doc["text_path"])
    if not path.is_absolute():
        path = ROOT / "audit" / path
    if not path.exists():
        return ""
    pages = json.loads(path.read_text()).get("pages", [])
    return "\n".join(p.get("text") or "" for p in pages)


def title_case(name: str) -> str:
    small = {"of", "and", "the", "at", "for", "de", "del", "la"}
    out = []
    for i, w in enumerate(name.lower().split()):
        if w.upper() in {"UCSF", "UCLA", "UCI", "UC", "UCSD", "PIH", "CPMC", "VA", "AHMC", "USC", "LAC", "LA"}:
            out.append(w.upper())
        elif i and w in small:
            out.append(w)
        else:
            out.append(w[:1].upper() + w[1:])
    return " ".join(out)


def main() -> None:
    hospitals = json.loads((CORPUS / "hospitals.json").read_text())
    index = []
    found = {"free": 0, "discount": 0, "phone": 0}
    for h in hospitals:
        docs = h.get("docs") or {}
        cc = docs.get("charity_care") or {}
        dp = docs.get("discount_payment") or {}
        text = doc_text(cc)
        if dp and dp.get("sha256") != cc.get("sha256"):
            text += "\n" + doc_text(dp)
        th = extract_thresholds(text) if text else {"freeCareMaxFplPct": None, "discountMaxFplPct": None, "discountHasNoFplCap": False, "quotes": []}
        quote = {q["kind"]: q["text"] for q in th["quotes"]}
        phones = find_phones(text) if text else []
        phone = phones[0][1] if phones else None
        found["free"] += th["freeCareMaxFplPct"] is not None
        found["discount"] += th["discountMaxFplPct"] is not None or th["discountHasNoFplCap"]
        found["phone"] += phone is not None
        # HCAI aliases look like "OLD NAME, 123 STREET, CITY, CA 90000; OTHER NAME, ..."
        raw = h.get("aliases") or ""
        aliases = [a.split(",")[0].strip() for a in (raw.split(";") if isinstance(raw, str) else raw) if a.strip()]
        names = [h.get("name") or h["key"]] + aliases
        index.append({
            "key": h["key"],
            "name": title_case(h.get("name") or h["key"]),
            "match": sorted({" ".join(tokens(n)) for n in names if tokens(n)}),
            "names": sorted({title_case(n) for n in names}),
            "city": h.get("city"),
            "county": h.get("county"),
            "address": h.get("address"),
            "detailUrl": h.get("detail_url"),
            "fap": {
                "url": cc.get("url"),
                "effectiveDate": cc.get("effective_date"),
                "applicationUrl": (docs.get("application") or {}).get("url"),
                "freeCareMaxFplPct": th["freeCareMaxFplPct"],
                "discountMaxFplPct": th["discountMaxFplPct"],
                "discountNoCap": th["discountHasNoFplCap"],
                "freeQuote": quote.get("freeCare"),
                "discountQuote": quote.get("discount") or quote.get("discountNoCap"),
                "phone": phone,
                "readable": bool(text),
            },
        })
    OUT.write_text(json.dumps({"source": "HCAI Hospital Fair Pricing Policy Lookup", "hospitals": index}, separators=(",", ":")))
    n = len(index)
    print(f"{n} hospitals -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
    print(f"free-care cutoff found for {found['free']}, discount cutoff for {found['discount']}, phone for {found['phone']}")


if __name__ == "__main__":
    main()
