"""Turn statewide Actor batch results into price data the app can check bills against.

Input:  a folder of per-hospital results from running our Apify Actor once per California
        hospital (one JSON per hospital: {key, site, runId, item}).
Output: convex/lib/statewidePrices.json  {generatedAt, codes, hospitals: {key: {...}}, skipped: {key: reason}}

Rules, all chosen so a price check never accuses a hospital of overcharging by mistake:
- The price file must name this hospital (file name, header name or site domain). Health systems
  publish one file per hospital, and the wrong campus's file is worse than none.
- Per code, prefer outpatient rows with a list price, then emergency-room rows, then the HIGHEST
  list price among them. Billed above that means billed above every matching row.
- Drop prices that can't be real (zero, negative, over $1M) and cash prices above the list price.

Usage: python pipeline/build_statewide_prices.py <results_dir>
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "convex/lib/hospitalIndex.json"
OUT = ROOT / "convex/lib/statewidePrices.json"
# Hospitals the app already prices from hand-checked snapshots.
HAND_CHECKED = {"priscilla-chan-mark-zuckerberg-san-francisco-general-hospital-trauma-center", "ucsf-medical-center",
                "california-pacific-medical-center-van-ness-campus", "st-francis-memorial-hospital"}

STOP = {"the", "of", "and", "inc", "llc", "hospital", "hospitals", "medical", "center", "centre", "health", "healthcare",
        "care", "campus", "regional", "community", "california", "ca", "memorial", "standardcharges", "standard",
        "charges", "csv", "json", "zip", "machine", "readable", "file", "www", "com", "org", "net", "https", "http"}


def tokens(s: str | None) -> set[str]:
    s = unquote(s or "").lower().replace("&", " and ")
    return {w for w in re.findall(r"[a-z]+", s) if w not in STOP and len(w) > 2}


def names_file(h: dict, item: dict, site: str) -> bool:
    """Does the price file belong to this hospital?"""
    want = set()
    for n in [h["name"], *h.get("names", [])]:
        want |= tokens(n)
    mrf = item.get("mrf") or {}
    path = urlparse(mrf.get("url") or "").path
    got = tokens(path.rsplit("/", 1)[-1]) | tokens(mrf.get("hospitalNameInFile"))
    if want & got:
        return True
    # A hospital's own single-site domain (e.g. chinesehospital-sf.org) also counts, when the
    # file sits on that domain and the domain carries the hospital's name.
    site_dom = urlparse(site).netloc.lower()
    file_dom = urlparse(mrf.get("url") or "").netloc.lower()
    flat = site_dom.replace("-", "").replace(".", "")
    return file_dom.endswith(site_dom.removeprefix("www.")) and any(w in flat for w in want if len(w) > 4)


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


def main(results_dir: str) -> None:
    index = {h["key"]: h for h in json.loads(INDEX.read_text())["hospitals"]}
    hospitals: dict[str, dict] = {}
    skipped: dict[str, str] = {}
    codes: set[str] = set()
    for f in sorted(Path(results_dir).glob("*.json")):
        rec = json.loads(f.read_text())
        key, item = rec["key"], rec.get("item") or {}
        h = index.get(key)
        if not h or key in HAND_CHECKED:
            continue
        mrf = item.get("mrf") or {}
        if not mrf.get("url"):
            skipped[key] = "price file not found"
            continue
        if not names_file(h, item, rec.get("site", "")):
            skipped[key] = f"price file may belong to another hospital: {mrf['url'][:160]}"
            continue
        prices = {}
        for code, p in (mrf.get("prices") or {}).items():
            codes.add(code)
            row = pick_row(p) if p else None
            if row:
                prices[code] = row
        if not prices:
            skipped[key] = "price file has none of the ER codes we look up"
            continue
        hospitals[key] = {
            "url": mrf["url"],
            "lastUpdated": mrf.get("lastUpdated"),
            "fetchedAt": (rec.get("finishedAt") or datetime.fromtimestamp(f.stat().st_mtime, timezone.utc).isoformat())[:19] + "Z",
            "runId": rec.get("runId"),
            "prices": prices,
        }
    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat()[:19] + "Z",
        "source": "Apify Actor NXiKTRZKK6p6qCSXk, one run per hospital",
        "codes": sorted(codes),
        "hospitals": hospitals,
        "skipped": skipped,
    }
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    n_codes = sum(len(v["prices"]) for v in hospitals.values())
    print(f"{len(hospitals)} hospitals priced ({n_codes} code prices); {len(skipped)} skipped -> {OUT.relative_to(ROOT)}")
    reasons: dict[str, int] = {}
    for r in skipped.values():
        reasons[r.split(":")[0]] = reasons.get(r.split(":")[0], 0) + 1
    for r, n in sorted(reasons.items(), key=lambda t: -t[1]):
        print(f"  skipped, {r}: {n}")


if __name__ == "__main__":
    main(sys.argv[1])
