"""Load hospital price rows for the generator.

Real rows come from ~/Code/recount-data/out/prices_<hospital>.json (copied from each
hospital's CMS machine-readable file). Those files are downloaded data, so we only ever
parse them as JSON and never execute anything from them.

Two shapes are accepted:
  * the extractor output: {"items": [{code, description, setting, gross_charge,
    discounted_cash_price, file_min_negotiated, file_max_negotiated, ...}, ...]}
  * a flat map: {code: {description, grossCharge, discountedCash, min, max}}

Codes missing from the file fall back to PLACEHOLDER_PRICES. Every row carries a
`source` field ("mrf" or "placeholder") so nobody mistakes a placeholder for a real price.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

DATA_DIR = Path(os.environ.get("RECOUNT_DATA_DIR", Path.home() / "Code/recount-data/out"))

# San Francisco hospitals the generator can bill from. Prices for a hospital are real only
# when DATA_DIR has prices_<key>.json for it.
HOSPITALS = {
    "zsfg": {
        "name": "Zuckerberg San Francisco General Hospital and Trauma Center",
        "short": "Zuckerberg San Francisco General",
        "address": "1001 Potrero Avenue, San Francisco, CA 94110",
        "phone": "(628) 206-8448",
        "website": None,
    },
    "ucsf": {
        "name": "UCSF Helen Diller Medical Center at Parnassus Heights",
        "short": "UCSF Health",
        "address": "505 Parnassus Avenue, San Francisco, CA 94143",
        "phone": "(415) 353-1888",
        "website": "ucsfhealth.org",
    },
    "cpmc": {
        "name": "CPMC Van Ness Campus",
        "short": "Sutter CPMC",
        "address": "1101 Van Ness Avenue, San Francisco, CA 94109",
        "phone": "(855) 398-1633",
        "website": "sutterhealth.org",
        "files": ["cpmc_vanness"],
    },
    "stfrancis": {
        "name": "Saint Francis Memorial Hospital",
        "short": "Saint Francis Memorial",
        "address": "900 Hyde Street, San Francisco, CA 94109",
        "phone": "(415) 353-6000",
        "website": None,
        "files": ["stfrancis_hyde"],
    },
}

# PLACEHOLDER prices: round numbers in the range SF hospitals publish. Not from any
# hospital's file. Used only when a code is missing from the real data.
PLACEHOLDER_PRICES = {
    "99283": ("ER VISIT LEVEL 3", 3500.0),
    "99284": ("ER VISIT LEVEL 4", 6000.0),
    "99285": ("ER VISIT LEVEL 5", 12000.0),
    "96374": ("IV PUSH SINGLE/INITIAL DRUG", 420.0),
    "96375": ("IV PUSH EA ADDL DRUG", 220.0),
    "96360": ("IV HYDRATION INIT 1HR", 450.0),
    "71046": ("XR CHEST 2 VIEWS", 400.0),
    "70450": ("CT HEAD/BRAIN W/O CONTRAST", 4400.0),
    "74177": ("CT ABD/PELVIS W/ CONTRAST", 3600.0),
    "80053": ("COMPREHENSIVE METABOLIC PANEL", 530.0),
    "85025": ("CBC W/ AUTO DIFF", 270.0),
    "81001": ("URINALYSIS AUTO W/ MICRO", 150.0),
    "93005": ("ECG TRACING ONLY", 290.0),
    "12002": ("SIMPLE REPAIR 2.6-7.5 CM", 890.0),
    "36415": ("VENIPUNCTURE ROUTINE", 45.0),
    "J2405": ("ONDANSETRON HCL INJ 1 MG", 28.0),
    "J7050": ("NORMAL SALINE SOLUTION 250 CC", 95.0),
    "J7030": ("NORMAL SALINE SOLUTION 1000 CC", 140.0),
    "J1885": ("KETOROLAC TROMETHAMINE INJ 15 MG", 36.0),
}

# Revenue code printed next to each CPT/HCPCS code on a UB-style statement.
REV_CODES = {
    "99283": "0450", "99284": "0450", "99285": "0450",
    "96374": "0260", "96375": "0260", "96360": "0260",
    "71046": "0320", "70450": "0351", "74177": "0352",
    "80053": "0301", "85025": "0305", "81001": "0307",
    "93005": "0730", "12002": "0450", "36415": "0300",
    "J2405": "0636", "J7050": "0258", "J7030": "0258", "J1885": "0636",
}


def _norm(code: str | None) -> str | None:
    """Same rule as normalizeCode in convex/lib/hospital.ts."""
    if not code:
        return None
    c = re.sub(r"[^A-Z0-9]", "", code.strip().upper())
    return c if len(c) >= 4 else None


def _pick(rows: list[dict]) -> dict:
    """Several rows can share a code (ER vs psych crisis, inpatient vs outpatient).
    An ER bill wants the outpatient emergency-room row."""
    def score(r: dict) -> tuple:
        desc = (r.get("description") or "").upper()
        return (
            r.get("gross_charge") is not None,
            r.get("setting") in ("outpatient", "both"),
            r.get("billing_class") in (None, "", "facility"),
            bool(re.search(r"\bER\b|\bED\b|EMERG", desc)),
            "PSYCH" not in desc and "TRAUMA" not in desc,
        )
    return max(rows, key=score)


def _num(x) -> float | None:
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def load_mrf(path: Path) -> dict:
    """Return {code: price row} for one prices_<key>.json file."""
    raw = json.loads(path.read_text())
    out: dict[str, dict] = {}
    if isinstance(raw, dict) and isinstance(raw.get("items"), list):
        by_code: dict[str, list[dict]] = {}
        for it in raw["items"]:
            if isinstance(it, dict) and _norm(it.get("code")):
                by_code.setdefault(_norm(it["code"]), []).append(it)
        for code, rows in by_code.items():
            r = _pick(rows)
            out[code] = {
                "description": str(r.get("description") or "")[:80],
                "grossCharge": _num(r.get("gross_charge")),
                "discountedCash": _num(r.get("discounted_cash_price")),
                "min": _num(r.get("file_min_negotiated")),
                "max": _num(r.get("file_max_negotiated")),
                "source": "mrf",
            }
        meta = {
            "url": str(raw.get("source_url") or ""),
            "lastUpdated": raw.get("mrf_last_updated_on"),
        }
    elif isinstance(raw, dict):
        src = raw.get("prices", raw)
        for code, r in src.items():
            if _norm(code) and isinstance(r, dict):
                out[_norm(code)] = {
                    "description": str(r.get("description") or "")[:80],
                    "grossCharge": _num(r.get("grossCharge")),
                    "discountedCash": _num(r.get("discountedCash")),
                    "min": _num(r.get("min")),
                    "max": _num(r.get("max")),
                    "source": "mrf",
                }
        meta = {"url": str(raw.get("url") or path.name), "lastUpdated": raw.get("lastUpdated")}
    else:
        raise ValueError(f"{path}: unexpected price file shape")
    return {"prices": out, **meta}


def load_all() -> dict[str, dict]:
    """{hospital_key: {"prices": {...}, "url": ..., "lastUpdated": ...}} for every real file."""
    found = {}
    for key, h in HOSPITALS.items():
        for name in [key, *h.get("files", [])]:
            p = DATA_DIR / f"prices_{name}.json"
            if p.exists():
                found[key] = load_mrf(p)
                break
    return found


def price_for(code: str, mrf: dict | None) -> dict:
    """Real row if the hospital publishes this code with a gross charge, else the placeholder."""
    if mrf:
        row = mrf["prices"].get(code)
        if row and row.get("grossCharge") is not None:
            return row
    desc, gross = PLACEHOLDER_PRICES[code]
    return {"description": desc, "grossCharge": gross, "discountedCash": None,
            "min": None, "max": None, "source": "placeholder"}


def hospital_ref(key: str, mrf: dict | None) -> dict:
    """A HospitalRef-shaped dict (convex/lib/hospital.ts) the checks can run against.
    Only real rows go in: placeholder prices are never presented as published."""
    h = HOSPITALS[key]
    return {
        "key": key,
        "name": h["short"],
        "source": "snapshot",
        "fetchedAt": "",
        "mrf": None if not mrf else {
            "url": mrf["url"],
            "lastUpdated": mrf["lastUpdated"],
            "prices": {c: {k: v for k, v in r.items() if k != "source"} for c, r in mrf["prices"].items()},
        },
        "fap": None,
        "warnings": [] if mrf else ["no price file for this hospital"],
    }
