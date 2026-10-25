"""Find and verify each California hospital's own price file, using only what the file says about itself.

The statewide Actor run (results folder, one JSON per hospital) found a file for some hospitals, but it
looked for the old /cms-hhs-pricetransparency.txt name instead of the federal /cms-hpt.txt index, and
its "names the hospital" test was one shared word. This script:

  licenses  HCAI page of every hospital -> CA license number and aliases      (out/hcai_licenses.json)
  txt       /cms-hpt.txt (and the legacy name) at candidate domains           (out/cms_hpt.json)
  probe     first 3 MB of each candidate file -> the header facts it states   (out/price_file_headers.json)
  select    choose each hospital's file, with the reason for every rejection  (out/price_files.json)

A file is accepted for a hospital only when
  1. its header states the hospital's CA license number from HCAI, and, when several hospitals in the
     index share that license, the file also names this one; or
  2. it states no license that belongs to another California hospital, is not for a hospital in another
     state, and its header or file name carries every distinctive word of the hospital's own name,
     adding at most one word of its own.
A file that states another California hospital's license is never accepted. One hospital's prices are
never copied to another: a campus that shares its license with the main hospital needs a file that names it.

Usage: python -I pipeline/find_price_files.py <step> <results_dir> [extra domains file]
Uses curl for downloads (many hospital sites refuse non-browser TLS clients).
"""

from __future__ import annotations

import collections
import csv
import glob
import html
import io
import json
import re
import struct
import subprocess
import sys
import zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "convex/lib/hospitalIndex.json"
OUT = ROOT / "pipeline/out"
LIC = OUT / "hcai_licenses.json"
TXT = OUT / "cms_hpt.json"
HEADERS = OUT / "price_file_headers.json"
FILES = OUT / "price_files.json"
DOMAINS = ROOT / "pipeline/price_file_domains.txt"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/129.0.0.0 Safari/537.36")
HAND_CHECKED = {"priscilla-chan-mark-zuckerberg-san-francisco-general-hospital-trauma-center", "ucsf-medical-center",
                "california-pacific-medical-center-van-ness-campus", "st-francis-memorial-hospital"}
HEAD_BYTES = 3 * 1024 * 1024


def index() -> dict[str, dict]:
    return {h["key"]: h for h in json.loads(INDEX.read_text())["hospitals"]}


def curl(url: str, limit: int | None = None, timeout: int = 60) -> tuple[int, str, bytes, str]:
    """GET with curl, then httpx when curl is refused (sites differ in which client they let through).
    Returns (status, content type, body (up to limit bytes), final URL)."""
    res = _curl(url, limit, timeout)
    if res[0] == 0 and url.startswith("http://"):
        res = _curl("https://" + url[7:], limit, timeout)
    if res[0] in (0, 403, 429, 503):
        try:
            res2 = _httpx(url, limit, timeout)
            if res2[0] == 200:
                return res2
        except Exception:
            pass
    return res


def _httpx(url, limit, timeout):
    import httpx
    with httpx.Client(headers={"User-Agent": UA}, follow_redirects=True, timeout=timeout) as c, c.stream("GET", url) as r:
        buf = b""
        for ch in r.iter_bytes():
            buf += ch
            if limit is not None and len(buf) >= limit:
                break
        return r.status_code, r.headers.get("content-type", ""), buf, str(r.url)


def _curl(url, limit, timeout):
    p = subprocess.Popen(["curl", "-s", "-g", "-L", "-m", str(timeout), "-A", UA, "-D", "/dev/stderr",
                          "-w", "%{stderr}\n@@URL %{url_effective}\n", "-o", "-", url],
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    buf = b""
    while limit is None or len(buf) < limit:
        ch = p.stdout.read(65536)
        if not ch:
            break
        buf += ch
    if limit is not None and len(buf) >= limit:
        p.kill()
    _, err = p.communicate()
    hdr = err.decode("latin-1")
    codes = re.findall(r"^HTTP/\S+ (\d+)", hdr, re.M)
    cts = re.findall(r"^content-type:\s*(.*)$", hdr, re.M | re.I)
    m = re.search(r"^@@URL (\S+)", hdr, re.M)
    return (int(codes[-1]) if codes else 0), (cts[-1].strip() if cts else ""), buf, (m.group(1) if m else url)


# ------------------------------------------------------------------ licenses

def step_licenses(_results: str) -> None:
    idx = index()

    def one(h):
        t = ""
        for _ in range(3):
            st, _, body, _ = curl(h["detailUrl"], timeout=40)
            if st == 200:
                t = body.decode("utf-8", "replace")
                break
        s = re.sub(r"\s+", " ", html.unescape(re.sub("<[^>]+>", " ", t)))

        def g(p):
            m = re.search(p, s)
            return m.group(1).strip() if m else None
        return h["key"], {"license": g(r"License #:\s*([0-9A-Z]+)"), "hcaiId": g(r"HCAI ID:\s*([0-9]+)"),
                          "aliases": g(r"Hospital Aliases:\s*(.*?)\s*License #"),
                          "address": g(r"Address:\s*(.*?)\s*Hospital Aliases")}
    with ThreadPoolExecutor(10) as ex:
        res = dict(ex.map(one, idx.values()))
    LIC.write_text(json.dumps(res, indent=1) + "\n")
    print(f"{sum(1 for v in res.values() if v['license'])} of {len(res)} licenses -> {LIC.relative_to(ROOT)}")


# ------------------------------------------------------------------ cms-hpt.txt

def parse_txt(text: str) -> list[dict]:
    entries, cur = [], {}

    def flush():
        nonlocal cur
        if cur.get("mrf-url"):
            entries.append(cur)
        cur = {}
    for raw in text.splitlines():
        line = raw.strip().lstrip("﻿")
        if not line:
            flush()
            continue
        m = re.match(r"^([A-Za-z-]+)\s*:\s*(.+)$", line)
        if not m:
            continue
        k, v = m.group(1).lower(), m.group(2).strip()
        if k == "location-name" and cur.get("mrf-url"):
            flush()
        if k == "location-name" and cur.get("location-name"):
            cur[k] += " | " + v
        else:
            cur[k] = v
    flush()
    return entries


def fetch_txt(dom: str):
    roots = [dom] if dom.startswith("www.") else [dom, "www." + dom]
    for root in roots:
        for name in ("cms-hpt.txt", "cms-hhs-pricetransparency.txt"):
            st, _, body, final = curl(f"https://{root}/{name}", timeout=30)
            if st != 200:
                continue
            text = body.decode("utf-16", "replace") if body[:2] in (b"\xff\xfe", b"\xfe\xff") else body.decode("utf-8-sig", "replace")
            if text.lstrip()[:1] == "<":
                continue
            e = parse_txt(text)
            if e:
                return dom, {"url": final, "entries": e}
    return dom, None


def result_records(results: str) -> dict[str, dict]:
    out = {}
    for f in sorted(Path(results).glob("*.json")):
        rec = json.loads(f.read_text())
        out[rec["key"]] = rec
    return out


def step_txt(results: str) -> None:
    doms = set()
    for rec in result_records(results).values():
        for u in [rec.get("site"), ((rec.get("item") or {}).get("mrf") or {}).get("url")]:
            if u:
                doms.add(urlparse(u).netloc.lower())
    doms |= {l.strip().lower() for l in DOMAINS.read_text().splitlines() if l.strip() and not l.startswith("#")}
    doms = sorted({d.removeprefix("www.") for d in doms if d})
    with ThreadPoolExecutor(12) as ex:
        res = {d: v for d, v in ex.map(fetch_txt, doms) if v}
    # A site that timed out this time keeps the file it served last time.
    old = json.loads(TXT.read_text()) if TXT.exists() else {}
    res = {**{d: v for d, v in old.items() if d in doms}, **res}
    TXT.write_text(json.dumps(res, indent=1) + "\n")
    print(f"{len(doms)} domains; {len(res)} serve a cms-hpt.txt; {sum(len(v['entries']) for v in res.values())} entries")


# ------------------------------------------------------------------ name matching

GENERIC = {"the", "of", "and", "inc", "llc", "lp", "hospital", "hospitals", "medical", "center", "centre", "health", "healthcare",
           "care", "campus", "regional", "community", "california", "ca", "dba", "d", "b", "a", "p", "h", "aph", "s", "at", "for",
           "an", "system", "services", "district", "corporation", "corp", "co", "foundation", "facility"}
SYN = {"saint": "st", "mt": "mount", "ctr": "center", "hosp": "hospital", "med": "medical", "childrens": "children"}
FILE_WORDS = {"standardcharges", "standard", "charges", "csv", "json", "zip", "machine", "readable", "mrf", "en", "tall", "wide",
              "association", "fund", "district", "v3", "v2", "export"}


def toks(s) -> set[str]:
    s = unquote(str(s or "")).lower().replace("&", " and ").replace("'", "").replace("’", "")
    return {SYN.get(w, w) for w in re.findall(r"[a-z0-9]+", s) if SYN.get(w, w) not in GENERIC and not w.isdigit()}


def candidate_entries(idx, lic, txt) -> dict[str, list]:
    """cms-hpt.txt entries whose location name or file name shares words with the hospital's names."""
    loose = {"memorial", "st", "san"}
    pool = [(d, e) for d, v in txt.items() for e in v["entries"]]
    out = {}
    for k, h in idx.items():
        names = [h["name"], *h.get("names", [])] + re.split(r",\s*", (lic.get(k) or {}).get("aliases") or "")
        want = [toks(n) - loose for n in names if toks(n) - loose]
        cands = []
        for dom, e in pool:
            got = toks(e.get("location-name")) | toks(unquote(e["mrf-url"].rsplit("/", 1)[-1]))
            best = max((len(w & got) / len(w) for w in want), default=0)
            if best >= 0.3:
                cands.append((round(best, 2), dom, e.get("location-name"), e["mrf-url"]))
        cands.sort(key=lambda t: -t[0])
        out[k] = cands[:20]
    return out


# ------------------------------------------------------------------ header probe

def unpack(b: bytes) -> tuple[str, bytes]:
    if b[:2] == b"\x1f\x8b":
        return "gz", zlib.decompressobj(16 + zlib.MAX_WBITS).decompress(b, HEAD_BYTES)
    if b[:4] == b"PK\x03\x04":
        method = struct.unpack("<H", b[8:10])[0]
        n, m = struct.unpack("<HH", b[26:30])
        start = 30 + n + m
        body = zlib.decompressobj(-15).decompress(b[start:], HEAD_BYTES) if method == 8 else b[start:]
        return "zip", body
    return "plain", b


def header_json(t: str) -> dict:
    def grab(key):
        m = re.search(r'"' + key + r'"\s*:\s*("(?:[^"\\]|\\.)*"|\[[^\]]*\]|\{[^}]*\})', t[:400000])
        try:
            return json.loads(m.group(1)) if m else None
        except Exception:
            return None
    li = grab("license_information")
    if isinstance(li, dict):
        li = str(li.get("license_number") or li.get("license") or "") or None
    elif isinstance(li, list):
        li = ",".join(str(x.get("license_number")) for x in li if isinstance(x, dict))
    return {"hospital_name": grab("hospital_name"), "license": li, "location_names": grab("location_name") or grab("hospital_location"),
            "addresses": grab("hospital_address"), "npis": grab("type_2_npi"), "last_updated": grab("last_updated_on")}


def header_csv(t: str) -> dict:
    rows = list(csv.reader(io.StringIO(t[:200000])))[:2]
    if len(rows) < 2:
        return {}
    out = {}
    for i, h in enumerate(x.strip().lower() for x in rows[0]):
        v = rows[1][i].strip() if i < len(rows[1]) else ""
        key = {"hospital_name": "hospital_name", "location_name": "location_names", "hospital_location": "location_names",
               "hospital_address": "addresses", "type_2_npi": "npis", "last_updated_on": "last_updated"}.get(h)
        if h.startswith("license_number"):
            key = "license"
        if key:
            out[key] = v
    return out


def probe_one(url: str) -> tuple[str, dict]:
    try:
        st, ct, b, _ = curl(url, limit=HEAD_BYTES, timeout=90)
    except Exception as e:
        return url, {"status": None, "error": type(e).__name__}
    res = {"status": st, "contentType": ct[:60]}
    if st >= 400 or not b:
        return url, res
    try:
        kind, raw = unpack(b)
    except Exception as e:
        return url, {**res, "error": f"unpack {type(e).__name__}"}
    t = raw.decode("utf-8-sig", "replace")
    s = t.lstrip()
    if s[:1] in "{[":
        res.update(format="json", **header_json(t))
    elif s[:1] == "<" or "html" in ct.lower():
        res["format"] = "html"
    elif raw[:4] == b"PK\x03\x04" or "spreadsheet" in ct or "excel" in ct:
        res["format"] = "xlsx"
    else:
        res.update(format="csv", **header_csv(t))
    res["kind"] = kind
    return url, res


def all_candidates(idx, results, match) -> dict[str, list[str]]:
    out = {}
    for k in idx:
        if k in HAND_CHECKED:
            continue
        urls = []
        u = (((results.get(k) or {}).get("item") or {}).get("mrf") or {}).get("url")
        if u:
            urls.append(u)
        urls += [c[3] for c in match.get(k, [])]
        out[k] = list(dict.fromkeys(urls))
    return out


def step_probe(results: str) -> None:
    idx, lic, txt = index(), json.loads(LIC.read_text()), json.loads(TXT.read_text())
    cands = all_candidates(idx, result_records(results), candidate_entries(idx, lic, txt))
    have = json.loads(HEADERS.read_text()) if HEADERS.exists() else {}
    urls = sorted({u for v in cands.values() for u in v} - {u for u, v in have.items() if v.get("status") == 200})
    with ThreadPoolExecutor(10) as ex:
        have.update(dict(ex.map(probe_one, urls)))
    HEADERS.write_text(json.dumps(have, indent=1) + "\n")
    print(f"{len(urls)} files probed; {len(have)} on record")


# ------------------------------------------------------------------ select

def ca_lics(x) -> set[str]:
    return {n.zfill(9) for n in re.findall(r"\d{8,10}", str(x or "")) if len(n) <= 9}


def out_of_state(p: dict) -> str | None:
    for s in re.findall(r",\s*([A-Z]{2})\s+\d{5}", json.dumps(p.get("addresses") or "")):
        if s != "CA":
            return s
    return None


def step_select(results: str) -> None:
    idx, lic, txt = index(), json.loads(LIC.read_text()), json.loads(TXT.read_text())
    recs = result_records(results)
    match = candidate_entries(idx, lic, txt)
    cands = all_candidates(idx, recs, match)
    heads = json.loads(HEADERS.read_text())
    for rec in recs.values():
        m = ((rec.get("item") or {}).get("mrf") or {})
        if m.get("url") and m.get("hospitalNameInFile"):
            heads.setdefault(m["url"], {}).setdefault("actorName", m["hospitalNameInFile"])
    lic_count = collections.Counter((v["license"] or "").zfill(9) for v in lic.values())

    def aliases(k):
        h = idx[k]
        out = []
        for a in re.split(r",\s*", (lic.get(k) or {}).get("aliases") or ""):
            a = a.strip()
            if a and not re.match(r"^\d", a) and not re.search(r"\b(CA|BLVD|AVE|STREET|ST|ROAD|RD|DRIVE|DR)\b\.?$", a) \
                    and len(toks(a) - toks(h.get("city"))) >= 2:
                out.append(a)
        return out

    def names_it(k, url, p, strict, beyond_city=False):
        texts = [p.get("hospital_name"), p.get("actorName")]
        ln = p.get("location_names")
        texts += ln if isinstance(ln, list) else [ln]
        texts.append(unquote(url.split("?")[0].rsplit("/", 1)[-1]))
        city = toks(idx[k].get("city"))
        names = [idx[k]["name"], *idx[k].get("names", [])] + ([] if strict else aliases(k))
        for n in names:
            want = toks(n)
            if beyond_city and not want - city:
                continue
            for t in filter(None, texts):
                got = toks(t)
                if want and want <= got and (not strict or len(got - want - city - FILE_WORDS) <= 1):
                    return f"{n} ~ {str(t)[:80]}"
        return None

    def verdict(k, url):
        p = heads.get(url) or {}
        if p.get("status") not in (200, None) and not p.get("actorName"):
            # Says "this hospital's file couldn't be downloaded" only when the index entry or file name names it.
            mine = names_it(k, url, {"location_names": locs.get((k, url))}, strict=True, beyond_city=True)
            return None, f"download refused (HTTP {p.get('status')})" + ("" if mine else ", file not identified")
        want = (lic[k]["license"] or "").zfill(9)
        got = ca_lics(p.get("license"))
        if want in got:
            named = names_it(k, url, p, strict=False)
            if lic_count[want] > 1 and not named:
                return None, f"license {want} is shared by {lic_count[want]} hospitals and the file names another"
            return ("license", f"license {want}" + (f"; {named}" if named else "")), None
        if out_of_state(p):
            return None, f"file is for a hospital in {out_of_state(p)}"
        if got & set(lic_count):
            return None, f"file states license {sorted(got & set(lic_count))[0]}, another California hospital's"
        strict = names_it(k, url, p, strict=True)
        if strict:
            extra = f"; file license {sorted(got)[0]} is not on HCAI" if got else ""
            return ("name", strict + extra), None
        return None, "file does not name this hospital"

    locs = {(k, c[3]): c[2] for k, cs in match.items() for c in cs}
    chosen, rejected = {}, {}
    for k, urls in cands.items():
        why = []
        for url in urls:
            ok, bad = verdict(k, url)
            if ok:
                p = heads.get(url) or {}
                chosen[k] = {"url": url, "verifiedBy": ok[0], "evidence": ok[1], "licenseInFile": p.get("license"),
                             "nameInFile": p.get("hospital_name") or p.get("actorName")}
                break
            why.append({"url": url, "why": bad})
        else:
            rejected[k] = why
    FILES.write_text(json.dumps({"rule": __doc__.split("A file is accepted")[1].split("Usage")[0].strip(),
                                 "chosen": chosen, "rejected": rejected}, indent=1, ensure_ascii=False) + "\n")
    print(f"{len(chosen)} hospitals with a verified file "
          f"({collections.Counter(v['verifiedBy'] for v in chosen.values())}); {len(rejected)} without")


if __name__ == "__main__":
    {"licenses": step_licenses, "txt": step_txt, "probe": step_probe, "select": step_select}[sys.argv[1]](sys.argv[2])
