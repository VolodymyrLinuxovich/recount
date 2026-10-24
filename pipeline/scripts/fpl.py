"""Build out/fpl.json from the HHS poverty-guidelines Federal Register notice.

Parses the "48 CONTIGUOUS STATES" table out of the official PDF so the numbers
come straight from the source document.
"""
import json
import os
import re

from scripts.common import OUT, fetch, pdf_text, raw_path

YEAR = 2026
FR_PDF = "https://www.govinfo.gov/content/pkg/FR-2026-01-15/pdf/2026-00755.pdf"
ASPE = "https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines"


def parse_table(text):
    i = text.find("POVERTY GUIDELINES FOR THE")
    seg = text[i:i + 1500]
    seg = seg[: seg.find("ALASKA")]
    sizes = {}
    for n, amt in re.findall(r"\b([1-8])\s*\.{3,}\s*\$?([\d,]+)", seg):
        sizes[n] = int(amt.replace(",", ""))
    m = re.search(r"add \$([\d,]+) for each\s+additional person", seg)
    extra = int(m.group(1).replace(",", "")) if m else None
    if len(sizes) != 8 or extra is None:
        raise ValueError("could not parse 48-state table from FR notice")
    # sanity: the table is linear in household size
    for n in range(2, 9):
        assert sizes[str(n)] - sizes[str(n - 1)] == extra, "table not linear; check parse"
    return sizes, extra


def build():
    pdf = raw_path("fpl", "fr2026.pdf")
    if not os.path.exists(pdf):
        fetch(FR_PDF, pdf)
    sizes, extra = parse_table(pdf_text(pdf))
    out = {
        "year": YEAR,
        "region": "48 contiguous states and the District of Columbia",
        "unit": "USD annual income",
        "by_household_size": sizes,
        "per_additional_person_over_8": extra,
        "formula": f"guideline(n) = {sizes['1']} + {extra}*(n-1)",
        "effective": "Federal Register notice published 2026-01-15 (doc 2026-00755)",
        "sources": [
            {"url": FR_PDF, "what": "Federal Register notice, Annual Update of the HHS Poverty Guidelines (2026)",
             "verified": "downloaded and parsed by scripts/fpl.py"},
            {"url": ASPE, "what": "ASPE poverty guidelines page (same table)", "verified": "opened 2026-10-24"},
        ],
        "ca_note": "CA HSC 127400(b) defines 'federal poverty level' as the HHS poverty guidelines updated in the Federal Register.",
    }
    with open(os.path.join(OUT, "fpl.json"), "w") as f:
        json.dump(out, f, indent=2)
    return out
