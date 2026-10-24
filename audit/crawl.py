"""Crawl HCAI's public Hospital Fair Pricing Policy Lookup for every CA hospital.

Phases (each resume-safe; cached pages/PDFs under audit/raw/ are reused):
  1. list   : walk the empty-query search (16/page) -> raw/index.json
  2. detail : fetch each hospital's detail page -> raw/detail/<slug>.html
  3. pdfs   : download the latest doc per type -> raw/pdf/<slug>__<doctype>.pdf
  4. geocode (optional, --geocode): US Census one-line geocoder, cached in raw/geocode.json

Writes raw/crawl.json (hospital metadata + chosen docs + download status).
Then run extract.py to build corpus/.

Usage:  .venv/bin/python -I crawl.py [--limit N] [--geocode] [--refresh-list]
Downloaded files are untrusted data: they are only parsed, never executed.
"""
import argparse
import hashlib
import html
import json
import os
import random
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import certifi  # python.org macOS builds lack a CA bundle

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
LOOKUP = "https://hcai.ca.gov/affordability/hospital-fair-billing-program/hospital-fair-pricing-policy-lookup/"
DETAIL = "https://hcai.ca.gov/affordability/hospital-billing-policies/{slug}/"
GEOCODER = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
UA = ("recount-audit/0.1 (UC Berkeley student research project, Cal Hacks 13.0; "
      "auditing public hospital billing policies; contact volodymyr_borysenko@berkeley.edu)")
WORKERS = 4

_ctx = ssl.create_default_context(cafile=certifi.where())

# (section h2 title, subsection) -> doc type key
SECTION_TYPES = {
    ("charity care policy", "policies"): "charity_care",
    ("charity care policy", "application"): "application",
    ("discount payment policy", "policies"): "discount_payment",
    ("discount payment policy", "application"): "application_discount",
    ("debt collection policy", "policies"): "debt_collection",
    ("debt collection policy", "application"): "application_debt",
}
DOC_TYPES = ["charity_care", "discount_payment", "debt_collection", "application", "application_discount"]


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, file=sys.stderr, flush=True)


def fetch(url, dest=None, tries=5, timeout=120):
    """GET with retries + exponential backoff. Returns bytes, or dest path when streaming to a file."""
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, context=_ctx, timeout=timeout) as r:
                if dest is None:
                    return r.read()
                ctype = r.headers.get("Content-Type", "")
                tmp = dest + ".part"
                with open(tmp, "wb") as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
                os.replace(tmp, dest)
                return ctype
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 401, 403, 404, 410):
                raise
        except Exception as e:  # network errors, timeouts
            last = e
        time.sleep(min(60, 2 ** i + random.random()))
    raise last


def clean(s):
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


# ---------------------------------------------------------------- phase 1
def list_hospitals(refresh=False):
    path = os.path.join(RAW, "index.json")
    if os.path.exists(path) and not refresh:
        return json.load(open(path))
    seen, out, page = set(), [], 1
    while page < 200:
        t = fetch(f"{LOOKUP}?hcai_search=&hcai_page={page}").decode("utf-8", "replace")
        hits = re.findall(r'hospital-billing-policies/([a-z0-9-]+)/">([^<]+)</a>', t)
        new = [(s, clean(n)) for s, n in hits if s not in seen]
        if not new:
            break
        for s, n in new:
            seen.add(s)
            out.append({"slug": s, "name": n})
        log(f"list page {page}: +{len(new)} (total {len(out)})")
        page += 1
        time.sleep(0.3)
    json.dump(out, open(path, "w"), indent=1)
    return out


# ---------------------------------------------------------------- phase 2
def field(text, label, stop):
    m = re.search(re.escape(label) + r"\s*(.+?)\s+(?:" + stop + ")", text)
    return m.group(1).strip() if m else None


def parse_detail(t):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
    flat = clean(t)
    stops = r"Address:|Hospital Aliases:|License #:|HCAI ID:|License Type:|File a Complaint"
    info = {
        "name": clean(m.group(1)) if (m := re.search(r"<h1[^>]*>(.*?)</h1>", t, re.S)) else None,
        "address": field(flat, "Address:", stops),
        "aliases": field(flat, "Hospital Aliases:", stops),
        "license": field(flat, "License #:", stops),
        "hcai_id": field(flat, "HCAI ID:", stops),
        "license_type": field(flat, "License Type:", stops),
    }
    archive = re.search(r'href="([^"]+)"[^>]*>\s*View Archive', t)
    info["archive_url"] = html.unescape(archive.group(1)) if archive else None
    docs = []
    # split into <h2 class="policy-section__title"> sections
    parts = re.split(r'<h2 class="policy-section__title">', t)
    for part in parts[1:]:
        section = clean(part[:part.find("</h2>")]).lower()
        # subsections start with <h3 class="policy-links__header">Policies|Application</h3>
        subs = re.split(r'<h3 class="policy-links__header">', part)
        for sub in subs[1:]:
            subname = clean(sub[:sub.find("</h3>")]).lower()
            for li in re.findall(r"<li>(.*?)</li>", sub, re.S):
                a = re.search(r'href="(https://api\.hdc\.hcai\.ca\.gov/Public/Extract/Attachment\?id=([0-9a-fA-F-]+))"[^>]*>(.*?)</a>', li, re.S)
                if not a:
                    continue
                d = re.search(r'class="date">\s*([0-9]{1,2})/([0-9]{1,2})/([0-9]{4})', li)
                iso = f"{d.group(3)}-{int(d.group(1)):02d}-{int(d.group(2)):02d}" if d else None
                docs.append({
                    "section": section, "subsection": subname, "label": clean(a.group(3)),
                    "type": SECTION_TYPES.get((section, subname)),
                    "effective_date": iso, "url": a.group(1), "id": a.group(2).lower(),
                })
    info["documents"] = docs
    info["sections"] = sorted({d["section"] for d in docs})
    return info


def parse_address(addr):
    """'2615 CHESTER AVENUE, BAKERSFIELD, CA 93301' -> street, city, zip."""
    if not addr:
        return {}
    m = re.match(r"^(.*),\s*([^,]+?),\s*CA\.?\s*(\d{5})(?:-\d{4})?\s*$", addr, re.I)
    if not m:
        return {}
    return {"street": m.group(1).strip(), "city": m.group(2).strip().title(), "zip": m.group(3)}


def latest(docs, typ):
    c = [d for d in docs if d["type"] == typ]
    if not c:
        return None
    # newest effective date; undated sorts last; ties keep page order (first listed)
    return sorted(c, key=lambda d: d["effective_date"] or "", reverse=True)[0]


def get_detail(h):
    slug = h["slug"]
    path = os.path.join(RAW, "detail", slug + ".html")
    if not os.path.exists(path):
        body = fetch(DETAIL.format(slug=slug))
        with open(path + ".part", "wb") as f:
            f.write(body)
        os.replace(path + ".part", path)
    info = parse_detail(open(path, encoding="utf-8", errors="replace").read())
    info["slug"] = slug
    info["list_name"] = h["name"]
    info["detail_url"] = DETAIL.format(slug=slug)
    info.update(parse_address(info["address"]))
    info["latest"] = {t: latest(info["documents"], t) for t in DOC_TYPES}
    return info


# ---------------------------------------------------------------- phase 3
def get_pdf(doc_id):
    """Download one attachment by its uuid (many hospitals in a system share one file)."""
    url = f"https://api.hdc.hcai.ca.gov/Public/Extract/Attachment?id={doc_id}"
    dest = os.path.join(RAW, "pdf", f"{doc_id}.pdf")
    meta = dest + ".meta.json"
    if os.path.exists(dest) and os.path.exists(meta):
        m = json.load(open(meta))
        if "sha256" not in m:
            m["sha256"] = hashlib.sha256(open(dest, "rb").read()).hexdigest()
            json.dump(m, open(meta, "w"))
        return doc_id, m
    try:
        ctype = fetch(url, dest)
        with open(dest, "rb") as f:
            head = f.read(1024)
        sha = hashlib.sha256(open(dest, "rb").read()).hexdigest()
        m = {"id": doc_id, "content_type": ctype, "bytes": os.path.getsize(dest), "sha256": sha,
             "is_pdf": b"%PDF" in head, "error": None}
    except Exception as e:
        if os.path.exists(dest):
            os.remove(dest)
        return doc_id, {"id": doc_id, "error": f"{type(e).__name__}: {e}"}  # failures not cached
    json.dump(m, open(meta, "w"))
    return doc_id, m


# ---------------------------------------------------------------- phase 4
def geocode(hospitals):
    path = os.path.join(RAW, "geocode.json")
    cache = json.load(open(path)) if os.path.exists(path) else {}
    todo = [h["address"] for h in hospitals if h.get("address") and h["address"] not in cache]
    log(f"geocode: {len(todo)} to look up ({len(cache)} cached)")

    def one(addr):
        q = urllib.parse.urlencode({"address": addr, "benchmark": "Public_AR_Current", "format": "json"})
        try:
            r = json.loads(fetch(f"{GEOCODER}?{q}", tries=3, timeout=60))
            ms = r.get("result", {}).get("addressMatches", [])
            if ms:
                c = ms[0]["coordinates"]
                return addr, {"lat": c["y"], "lon": c["x"], "matched": ms[0].get("matchedAddress")}
            return addr, {"lat": None, "lon": None, "matched": None}
        except Exception as e:
            return addr, {"error": str(e)}

    with ThreadPoolExecutor(WORKERS) as ex:
        for i, (addr, res) in enumerate(ex.map(one, todo)):
            if "error" not in res:
                cache[addr] = res
            if i % 50 == 0:
                json.dump(cache, open(path, "w"), indent=0)
    json.dump(cache, open(path, "w"), indent=0)

    # Fallback for Census misses: OSM Nominatim, 1 request/second per its usage policy.
    misses = [a for a, g in cache.items() if g.get("lat") is None and not g.get("nominatim_tried")]
    log(f"geocode: {len(misses)} Census misses -> Nominatim")
    for addr in misses:
        street = re.sub(r"\s*-\d{4}$", "", addr)
        q = urllib.parse.urlencode({"q": street, "format": "json", "limit": 1, "countrycodes": "us"})
        try:
            r = json.loads(fetch(f"https://nominatim.openstreetmap.org/search?{q}", tries=2, timeout=30))
            if not r:  # retry with just city + zip
                m = re.search(r",\s*([^,]+),\s*CA\s*(\d{5})", street)
                if m:
                    time.sleep(1.1)
                    q = urllib.parse.urlencode({"q": f"{m.group(1)}, CA {m.group(2)}", "format": "json", "limit": 1})
                    r = json.loads(fetch(f"https://nominatim.openstreetmap.org/search?{q}", tries=2, timeout=30))
                    if r:
                        r[0]["display_name"] = "APPROX (city/zip): " + r[0]["display_name"]
            if r:
                cache[addr] = {"lat": float(r[0]["lat"]), "lon": float(r[0]["lon"]),
                               "matched": "nominatim: " + r[0]["display_name"]}
            else:
                cache[addr]["nominatim_tried"] = True
        except Exception as e:
            log(f"nominatim error {addr}: {e}")
        time.sleep(1.1)
    json.dump(cache, open(path, "w"), indent=0)
    for h in hospitals:
        g = cache.get(h.get("address") or "")
        if g:
            h["lat"], h["lon"], h["geocode_match"] = g["lat"], g["lon"], g["matched"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--geocode", action="store_true")
    ap.add_argument("--refresh-list", action="store_true")
    a = ap.parse_args()
    for d in ("detail", "pdf"):
        os.makedirs(os.path.join(RAW, d), exist_ok=True)
    t0 = time.time()

    idx = list_hospitals(a.refresh_list)
    if a.limit:
        idx = idx[: a.limit]
    log(f"{len(idx)} hospitals listed")

    hospitals, errors = [], []
    with ThreadPoolExecutor(WORKERS) as ex:
        futs = [(h, ex.submit(get_detail, h)) for h in idx]
        for i, (h, f) in enumerate(futs):
            try:
                hospitals.append(f.result())
            except Exception as e:
                errors.append({"slug": h["slug"], "stage": "detail", "error": f"{type(e).__name__}: {e}"})
            if i % 50 == 0:
                log(f"detail {i}/{len(idx)}")
    log(f"details done: {len(hospitals)} ok, {len(errors)} failed")

    ids = sorted({d["id"] for h in hospitals for d in h["latest"].values() if d})
    log(f"{len(ids)} unique attachments to fetch")
    status = {}
    with ThreadPoolExecutor(WORKERS) as ex:
        for i, (doc_id, m) in enumerate(ex.map(get_pdf, ids)):
            status[doc_id] = m
            if i % 100 == 0:
                log(f"pdf {i}/{len(ids)}")
    # If the newest version's attachment is gone (404), fall back to the next-newest of that type.
    for h in hospitals:
        for t, d in list(h["latest"].items()):
            if not d or not status[d["id"]].get("error"):
                continue
            cands = sorted([x for x in h["documents"] if x["type"] == t],
                           key=lambda x: x["effective_date"] or "", reverse=True)
            for alt in cands[1:4]:
                aid, m = get_pdf(alt["id"])
                status[aid] = m
                if not m.get("error"):
                    alt = dict(alt, fallback_from={"id": d["id"], "effective_date": d["effective_date"],
                                                   "error": status[d["id"]]["error"]})
                    h["latest"][t] = alt
                    log(f"fallback {h['slug']} {t}: {d['effective_date']} -> {alt['effective_date']}")
                    break
    users = {}
    for h in hospitals:
        for t, d in h["latest"].items():
            if d:
                users.setdefault(d["id"], set()).add(h["slug"])
    for h in hospitals:
        for t, d in h["latest"].items():
            if d:
                d["download"] = status.get(d["id"])
                d["shared_by_hospitals"] = len(users[d["id"]])
                if d["download"].get("error"):
                    errors.append({"slug": h["slug"], "stage": "pdf", "type": t, "error": d["download"]["error"]})
    log(f"pdfs done: {len(ids)} files, {sum(1 for e in errors if e['stage'] == 'pdf')} failed")

    if a.geocode:
        geocode(hospitals)
    else:  # still attach cached coordinates if available
        p = os.path.join(RAW, "geocode.json")
        if os.path.exists(p):
            cache = json.load(open(p))
            for h in hospitals:
                g = cache.get(h.get("address") or "")
                if g:
                    h["lat"], h["lon"], h["geocode_match"] = g["lat"], g["lon"], g["matched"]

    out = {"source": LOOKUP, "crawled_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
           "seconds": round(time.time() - t0, 1), "listed": len(idx),
           "hospitals": hospitals, "errors": errors}
    json.dump(out, open(os.path.join(RAW, "crawl.json"), "w"), indent=1)
    log(f"done in {out['seconds']}s")


if __name__ == "__main__":
    main()
