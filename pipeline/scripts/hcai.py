"""Scrape HCAI's public Hospital Fair Pricing Policy Lookup (no login needed).

- Search page: GET .../hospital-fair-pricing-policy-lookup/?hcai_search=<q>&hcai_page=<n>
- Detail page: GET https://hcai.ca.gov/affordability/hospital-billing-policies/<slug>/
- Each policy PDF: GET https://api.hdc.hcai.ca.gov/Public/Extract/Attachment?id=<uuid>

Writes out/hcai_policies.json and downloads each hospital's latest charity-care
policy PDF to raw/fap/<key>.pdf (+ .txt).
"""
import html
import json
import os
import re
import urllib.parse

from scripts.common import OUT, fetch, pdf_text, raw_path

LOOKUP = "https://hcai.ca.gov/affordability/hospital-fair-billing-program/hospital-fair-pricing-policy-lookup/"
DETAIL = "https://hcai.ca.gov/affordability/hospital-billing-policies/{slug}/"

HOSPITALS = {
    "zsfg": "priscilla-chan-mark-zuckerberg-san-francisco-general-hospital-trauma-center",
    "ucsf": "ucsf-medical-center",
    "ucsf_missionbay": "ucsf-medical-center-at-mission-bay",
    "cpmc_vanness": "california-pacific-medical-center-van-ness-campus",
    "stfrancis_hyde": "st-francis-memorial-hospital",
    "stmarys": "st-marys-medical-center",
    "kaiser_sf": "kaiser-foundation-hospital-san-francisco",
}

# Display names for the app. The HCAI name (all caps) is kept as hcai_name.
NAMES = {
    "zsfg": "Zuckerberg San Francisco General Hospital and Trauma Center",
    "ucsf": "UCSF Medical Center (Parnassus)",
    "ucsf_missionbay": "UCSF Medical Center at Mission Bay",
    "cpmc_vanness": "California Pacific Medical Center, Van Ness Campus",
    "stfrancis_hyde": "UCSF Health Hyde Hospital (formerly Saint Francis Memorial)",
    "stmarys": "UCSF Health St. Mary's Hospital",
    "kaiser_sf": "Kaiser Permanente San Francisco Medical Center",
}

GEOCODER = ("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
            "?benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json&address={q}")

# Addresses the Census geocoder can't match. Coordinates from OpenStreetMap (Nominatim),
# the same fallback audit/crawl.py uses for the statewide corpus.
GEOCODE_FALLBACK = {
    "1975 4TH STREET, SAN FRANCISCO, CA 94158": {
        "lat": 37.7647716, "lon": -122.3896641, "city": "San Francisco", "county": "San Francisco",
        "geocode_match": "nominatim: UCSF Medical Center at Mission Bay, 1975 4th Street"},
}


def geocode(address):
    """Lat/lon, city and county for an HCAI address, from the US Census geocoder."""
    r = json.loads(fetch(GEOCODER.format(q=urllib.parse.quote(address)), timeout=60))
    m = r["result"]["addressMatches"]
    if not m and address in GEOCODE_FALLBACK:
        return dict(GEOCODE_FALLBACK[address])
    if not m:
        raise ValueError(f"no geocoder match for {address!r}")
    m = m[0]
    county = m["geographies"]["Counties"][0]["BASENAME"]
    return {"lat": m["coordinates"]["y"], "lon": m["coordinates"]["x"],
            "city": m["addressComponents"]["city"].title(), "county": county,
            "geocode_match": m["matchedAddress"]}


def search(query):
    """Return [(name, slug)] for a lookup search, following pagination."""
    res, page = [], 1
    while True:
        url = f"{LOOKUP}?hcai_search={query.replace(' ', '+')}&hcai_page={page}"
        t = fetch(url).decode("utf-8", "replace")
        hits = re.findall(r'hospital-billing-policies/([a-z0-9-]+)/">([^<]+)</a>', t)
        new = [(html.unescape(n).strip(), s) for s, n in hits if (html.unescape(n).strip(), s) not in res]
        if not new:
            return res
        res += new
        page += 1


def parse_detail(t):
    """Extract policy documents from a detail page, grouped by section."""
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
    docs = []
    for m in re.finditer(r'<a[^>]*href="(https://api\.hdc\.hcai\.ca\.gov/Public/Extract/Attachment\?id=[0-9a-f-]+)"[^>]*>(.*?)</a>', t, re.S):
        label = html.unescape(re.sub(r"<[^>]+>|\s+", " ", m.group(2))).strip()
        before = re.sub(r"<[^>]+>|\s+", " ", t[max(0, m.start() - 400):m.start()])
        dates = re.findall(r"(\d\d/\d\d/\d{4})", before)
        d = dates[-1] if dates else None
        iso = f"{d[6:]}-{d[:2]}-{d[3:5]}" if d else None
        docs.append({"label": label, "effective_date": iso, "url": m.group(1)})
    head = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t)))
    name = re.search(r"<title>(.*?)(?:\s+-\s+HCAI)?</title>", t, re.S)
    hcai_id = re.search(r"HCAI ID:\s*(\d+)", head)
    lic = re.search(r"License #:\s*(\d+)", head)
    addr = re.search(r"Address:\s*(.+?)\s+(?:Hospital Aliases|License #)", head)
    return {"hcai_name": html.unescape(re.sub(r"<[^>]+>|\s+", " ", name.group(1))).strip() if name else None,
            "hcai_id": hcai_id.group(1) if hcai_id else None,
            "license": lic.group(1) if lic else None, "address": addr.group(1) if addr else None, "documents": docs}


def latest(docs, label):
    c = [d for d in docs if d["label"] == label and d["effective_date"]]
    return max(c, key=lambda d: d["effective_date"]) if c else None


def build(download_pdfs=True):
    out = {"source": LOOKUP, "login_required": False, "hospitals": {}}
    out["sf_search_results"] = [{"name": n, "slug": s, "detail_url": DETAIL.format(slug=s)} for n, s in search("san francisco")]
    for key, slug in HOSPITALS.items():
        url = DETAIL.format(slug=slug)
        info = parse_detail(fetch(url).decode("utf-8", "replace"))
        info["detail_url"] = url
        info["name"] = NAMES[key]
        if info["address"]:
            info.update(geocode(info["address"]))
        info["latest_charity_care_policy"] = latest(info["documents"], "Charity Care Policy")
        info["latest_discount_payment_policy"] = latest(info["documents"], "Discount Payment Policy")
        info["latest_debt_collection_policy"] = latest(info["documents"], "Debt Collection Policy")
        info["latest_application"] = latest(info["documents"], "Application for Charity Care")
        out["hospitals"][key] = info
        pol = info["latest_charity_care_policy"]
        if download_pdfs and pol:
            pdf = raw_path("fap", f"{key}.pdf")
            if not os.path.exists(pdf):
                fetch(pol["url"], pdf)
            with open(raw_path("fap", f"{key}.txt"), "w") as f:
                f.write(pdf_text(pdf))
    with open(os.path.join(OUT, "hcai_policies.json"), "w") as f:
        json.dump(out, f, indent=1)
    return out
