"""Turn extracted hospital price files into the snapshots the app falls back to.

Input:  ../recount-data/out/prices_<hospital>.json  (rows copied from each hospital's
        CMS machine-readable file) and hospitals.json (financial assistance policy facts).
Output: convex/lib/snapshots/<key>.json in the HospitalRef shape (convex/lib/hospital.ts).

For each billing code we keep one row: the outpatient facility row (what an ER visit is
billed as), falling back to any facility row. We also record the lowest rate the hospital
accepts from a government program (Medi-Cal / Medicare), because California caps what a
discount-eligible patient pays at about what a government payer would pay.

Usage: python3 -I pipeline/build_snapshots.py [data_dir]
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "convex" / "lib" / "snapshots"

HOSPITALS = {
    "zsfg": ("prices_zsfg.json", "Zuckerberg San Francisco General"),
    "ucsf": ("prices_ucsf.json", "UCSF Medical Center"),
    "cpmc": ("prices_cpmc_vanness.json", "CPMC Van Ness Campus (Sutter)"),
    "saintfrancis": ("prices_stfrancis_hyde.json", "Saint Francis Memorial Hospital"),
}

GOV_WORDS = ("MEDI-CAL", "MEDICAL", "MEDICARE", "MEDICAID")


def is_gov(payer: str, plan: str | None) -> bool:
    text = f"{payer} {plan or ''}".upper()
    return any(w in text for w in GOV_WORDS)


def pick_row(rows: list[dict]) -> dict:
    """Prefer outpatient facility rows; among those, the most common gross charge."""
    def rank(r: dict) -> tuple[int, int]:
        setting = (r.get("setting") or "").lower()
        cls = (r.get("billing_class") or "").lower()
        return (0 if setting in ("outpatient", "both") else 1, 0 if cls == "facility" else 1)

    rows = sorted(rows, key=rank)
    best = [r for r in rows if rank(r) == rank(rows[0])]
    # One code can cover several services (e.g. 99284 = ER visit or psych crisis visit).
    # Prefer the emergency-room row; otherwise take the highest list price, so we never
    # call a charge "above list price" because we compared it to a cheaper variant.
    er = [r for r in best if any(w in (r.get("description") or "").upper() for w in (" ER ", "EMERG", "ER EX"))]
    pool = er or best
    return max(pool, key=lambda r: r.get("gross_charge") or 0)


def gov_rate(rows: list[dict]) -> tuple[float | None, str | None]:
    best: tuple[float | None, str | None] = (None, None)
    for r in rows:
        for p in r.get("payer_rates") or []:
            amt = p.get("negotiated_dollar")
            if amt is None or not is_gov(p.get("payer") or "", p.get("plan")):
                continue
            if best[0] is None or amt < best[0]:
                best = (float(amt), p.get("payer"))
    return best


def build(key: str, data_dir: Path, fap_by_key: dict) -> dict | None:
    fname, name = HOSPITALS[key]
    path = data_dir / fname
    if not path.exists():
        return None
    src = json.loads(path.read_text())
    by_code: dict[str, list[dict]] = {}
    for item in src.get("items", []):
        code = str(item.get("code") or "").strip().upper()
        if code:
            by_code.setdefault(code, []).append(item)

    prices = {}
    for code, rows in by_code.items():
        row = pick_row(rows)
        same_desc = [r for r in rows if r.get("description") == row.get("description")]
        g, payer = gov_rate(same_desc or rows)
        prices[code] = {
            "description": row.get("description"),
            "grossCharge": row.get("gross_charge"),
            "discountedCash": row.get("discounted_cash_price"),
            "min": row.get("file_min_negotiated"),
            "max": row.get("file_max_negotiated"),
            "setting": row.get("setting"),
            "govRate": g,
            "govPayer": payer,
        }

    fap = fap_by_key.get(key)
    return {
        "key": key,
        "name": name,
        "source": "snapshot",
        "fetchedAt": date.today().isoformat(),
        "mrf": {
            "url": src.get("source_url"),
            "lastUpdated": src.get("mrf_last_updated_on"),
            "prices": prices,
        },
        "fap": fap,
        "warnings": [f"Codes not in the price file: {', '.join(src.get('codes_not_found', []))}"]
        if src.get("codes_not_found")
        else [],
    }


def load_faps(data_dir: Path) -> dict:
    """Read financial assistance policy facts if the research file exists."""
    path = data_dir / "hospitals.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text())
    items = raw.get("hospitals", raw) if isinstance(raw, dict) else raw
    out = {}
    for h in items if isinstance(items, list) else []:
        key = h.get("key") or h.get("hospital_key")
        if not key:
            continue
        out[key] = {
            "url": h.get("fap_url"),
            "freeCareMaxFplPct": h.get("free_care_max_fpl_pct"),
            "discountMaxFplPct": h.get("discount_max_fpl_pct"),
            "quotes": h.get("fap_quotes", []),
            "phone": h.get("billing_phone"),
            "applicationUrl": h.get("application_url"),
        }
    return out


def main() -> None:
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "recount-data" / "out"
    OUT.mkdir(parents=True, exist_ok=True)
    faps = load_faps(data_dir)
    for key in HOSPITALS:
        snap = build(key, data_dir, faps)
        if snap is None:
            print(f"skip {key}: no price file")
            continue
        (OUT / f"{key}.json").write_text(json.dumps(snap, indent=1))
        print(f"{key}: {len(snap['mrf']['prices'])} codes, policy {'yes' if snap['fap'] else 'no'}")


if __name__ == "__main__":
    main()
