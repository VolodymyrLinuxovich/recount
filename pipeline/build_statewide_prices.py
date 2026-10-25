"""Turn statewide Actor batch results into price data the app can check bills against.

Input:  folders of per-hospital results from our Apify Actor (one JSON per hospital: {key, site, runId,
        finishedAt, item}); a later folder wins for the same hospital and file. Plus
        pipeline/out/price_files.json from find_price_files.py: the one file verified as each hospital's own.
Output: convex/lib/statewidePrices.json  {generatedAt, codes, hospitals: {key: {...}}, skipped: {key: {reason, detail}}}

Rules, all chosen so a price check never accuses a hospital of overcharging by mistake:
- Only the verified file counts. It must state the hospital's CA license, or name the hospital and state
  no other California hospital's license (find_price_files.py). The wrong campus's file is worse than none.
- Per code, prefer outpatient rows with a list price, then emergency-room rows, then the HIGHEST
  list price among them. Billed above that means billed above every matching row.
- Drop prices that can't be real (zero, negative, over $1M) and cash prices above the list price.
- Every hospital without prices gets a reason the app can show: notFound, notNamed, unreadable, noCodes.

Usage: python pipeline/build_statewide_prices.py <results_dir> [<newer_results_dir> ...]
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "convex/lib/hospitalIndex.json"
OUT = ROOT / "convex/lib/statewidePrices.json"
FILES = ROOT / "pipeline/out/price_files.json"
# Hospitals the app already prices from hand-checked snapshots.
HAND_CHECKED = {"priscilla-chan-mark-zuckerberg-san-francisco-general-hospital-trauma-center", "ucsf-medical-center",
                "california-pacific-medical-center-van-ness-campus", "st-francis-memorial-hospital"}

# Why a hospital has no line-by-line price check. The app shows these in plain words (i18n bill.noPrice.*).
NOT_FOUND, NOT_NAMED, UNREADABLE, NO_CODES = "notFound", "notNamed", "unreadable", "noCodes"


def is_er(desc: str | None) -> bool:
    d = f" {(desc or '').upper()} "
    return any(w in d for w in (" ER ", " ED ", "EMERG", "ER EX"))


def ok_price(x) -> bool:
    return isinstance(x, (int, float)) and 0 < x < 1_000_000


def pick_row(p: dict) -> dict | None:
    lines = [l for l in (p.get("lines") or [p]) if ok_price(l.get("grossCharge"))]
    if not lines:
        return None
    outp = [l for l in lines if (l.get("setting") or "").lower() in ("outpatient", "both")] or lines
    pool = [l for l in outp if is_er(l.get("description"))] or outp
    top = max(pool, key=lambda l: l["grossCharge"])
    cash = top.get("discountedCash")
    if not ok_price(cash) or cash > top["grossCharge"] * 1.01:
        cash = None
    return {
        "description": top.get("description"),
        "grossCharge": round(float(top["grossCharge"]), 2),
        "discountedCash": round(float(cash), 2) if cash is not None else None,
        "min": p.get("min") if ok_price(p.get("min")) else None,
        "max": p.get("max") if ok_price(p.get("max")) else None,
        "setting": top.get("setting"),
    }


def load_results(dirs: list[str]) -> dict[str, list[dict]]:
    """Every Actor record per hospital, newest folder first."""
    out: dict[str, list[dict]] = {}
    for d in reversed(dirs):
        for f in sorted(Path(d).glob("*.json")):
            rec = json.loads(f.read_text())
            if not rec.get("finishedAt"):
                rec["finishedAt"] = datetime.fromtimestamp(f.stat().st_mtime, timezone.utc).isoformat()
            out.setdefault(rec["key"], []).append(rec)
    return out


def gap_reason(rejected: list[dict]) -> tuple[str, str]:
    if not rejected:
        return NOT_FOUND, "no price file found on the hospital's site or in a cms-hpt.txt index"
    refused = [r for r in rejected if r["why"].startswith("download refused") and "not identified" not in r["why"]]
    if refused:
        return UNREADABLE, f"{refused[0]['why']}: {refused[0]['url'][:160]}"
    return NOT_NAMED, f"{len(rejected)} candidate file(s), none is this hospital's; first: {rejected[0]['why']}"


def main(dirs: list[str]) -> None:
    index = {h["key"]: h for h in json.loads(INDEX.read_text())["hospitals"]}
    verified = json.loads(FILES.read_text())
    results = load_results(dirs)
    hospitals: dict[str, dict] = {}
    skipped: dict[str, dict] = {}
    codes: set[str] = set()
    for key in index:
        if key in HAND_CHECKED:
            continue
        pick = verified["chosen"].get(key)
        if not pick:
            r, why = gap_reason(verified["rejected"].get(key, []))
            skipped[key] = {"reason": r, "detail": why}
            continue
        recs = [r for r in results.get(key, []) if ((r.get("item") or {}).get("mrf") or {}).get("url") == pick["url"]]
        if not recs:
            skipped[key] = {"reason": UNREADABLE, "detail": f"verified file not read yet: {pick['url'][:160]}"}
            continue
        rec = recs[0]
        item = rec["item"]
        mrf = item["mrf"]
        if (mrf.get("scan") or {}).get("stoppedBecause") == "size-limit":
            # Rows past the limit could hold a higher price, and a lower "highest" price could flag a fair charge.
            skipped[key] = {"reason": UNREADABLE, "detail": f"file too large to read to the end: {pick['url'][:160]}"}
            continue
        prices = {}
        for code, p in (mrf.get("prices") or {}).items():
            codes.add(code)
            row = pick_row(p) if p else None
            if row:
                prices[code] = row
        if not prices:
            scan = mrf.get("scan") or {}
            if item.get("error") or (not scan.get("complete") and scan.get("stoppedBecause") != "all-codes-found"):
                why = item.get("error") or f"read stopped ({scan.get('stoppedBecause')}) after {scan.get('recordsScanned')} records"
                skipped[key] = {"reason": UNREADABLE, "detail": f"{why}: {pick['url'][:160]}"}
            else:
                skipped[key] = {"reason": NO_CODES,
                                "detail": f"read all {scan.get('recordsScanned')} records; none has the ER codes we look up"}
            continue
        hospitals[key] = {
            "url": mrf["url"],
            "lastUpdated": mrf.get("lastUpdated"),
            "fetchedAt": rec["finishedAt"][:19] + "Z",
            "runId": rec.get("runId"),
            "verifiedBy": pick["verifiedBy"],
            "prices": prices,
        }
    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat()[:19] + "Z",
        "source": "Apify Actor NXiKTRZKK6p6qCSXk; each file verified as the hospital's own by pipeline/find_price_files.py",
        "codes": sorted(codes),
        "hospitals": hospitals,
        "skipped": skipped,
    }
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    n_codes = sum(len(v["prices"]) for v in hospitals.values())
    print(f"{len(hospitals)} hospitals priced ({n_codes} code prices); {len(skipped)} skipped -> {OUT.relative_to(ROOT)}")
    reasons: dict[str, int] = {}
    for r in skipped.values():
        reasons[r["reason"]] = reasons.get(r["reason"], 0) + 1
    for r, n in sorted(reasons.items(), key=lambda t: -t[1]):
        print(f"  skipped, {r}: {n}")


if __name__ == "__main__":
    main(sys.argv[1:])
