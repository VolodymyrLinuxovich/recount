"""Finding things on a hospital website: the CMS price transparency TXT file,
machine-readable price files, and financial assistance documents."""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from urllib.parse import unquote, urljoin, urldefrag, urlparse

import httpx
from bs4 import BeautifulSoup

from .docs import html_text, html_title
from .http import root_variants, same_site

STOP = {'the', 'and', 'of', 'hospital', 'medical', 'center', 'centre', 'health', 'campus', 'inc', 'llc',
        'at', 'a', 'trauma', 'general', 'home', 'welcome', 'to', 'for'}


def name_tokens(s: str | None) -> list[str]:
    if not s:
        return []
    return [t for t in re.sub(r'[^a-z0-9 ]+', ' ', s.lower()).split() if len(t) > 1 and t not in STOP]


def name_overlap(want: str | None, have: str | None) -> float:
    w = name_tokens(want)
    if not w:
        return 0.0
    h = set(name_tokens(have))
    return sum(t in h for t in w) / len(w)


# ---------------------------------------------------------------- CMS TXT file

def parse_cms_txt(text: str) -> list[dict]:
    """Parse /cms-hpt.txt: blocks of `key: value` lines (location-name,
    source-page-url, mrf-url, contact-name, contact-email)."""
    entries: list[dict] = []
    cur: dict = {}

    def flush():
        nonlocal cur
        if cur.get('mrf-url'):
            entries.append(cur)
        cur = {}

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            flush()
            continue
        m = re.match(r'^([A-Za-z-]+)\s*:\s*(.+)$', line)
        if not m:
            continue
        key, val = m.group(1).lower(), m.group(2).strip()
        if key == 'location-name' and cur.get('mrf-url'):
            flush()
        cur[key] = val
    flush()
    return entries


def fetch_cms_txt(client: httpx.Client, hospital_url: str) -> tuple[str, list[dict]] | None:
    # /cms-hpt.txt is the name CMS requires (45 CFR 180.50(d)(6)); the longer one is from the proposed rule.
    for root in root_variants(hospital_url):
        for name in ('cms-hpt.txt', 'cms-hhs-pricetransparency.txt'):
            url = f'{root}/{name}'
            try:
                r = client.get(url, timeout=20)
            except httpx.HTTPError:
                continue
            if r.status_code != 200 or 'html' in r.headers.get('content-type', '').lower():
                continue
            body = r.content
            text = body.decode('utf-16', 'replace') if body[:2] in (b'\xff\xfe', b'\xfe\xff') else r.text
            entries = parse_cms_txt(text)
            if entries:
                return str(r.url), entries
    return None


# ---------------------------------------------------------------- link scoring

# Download endpoints that name the format in the query (apps.para-hcfs.com/...Reports.aspx?fileType=CSV).
FILE_QUERY_RE = re.compile(r'(?:file_?type|format|filetype)=(?:csv|json)\b', re.I)
FILE_EXT_RE = re.compile(r'\.(pdf|csv|json|zip|gz|xlsx?|docx?|txt|mp3|mp4|jpg|jpeg|png|gif)(?:\?|$)', re.I)
PRICE_PAGE_RE = re.compile(r'price[\s_-]*transparen|standard[\s_-]*charges?|machine[\s_-]*readable|chargemaster|'
                           r'pricing[\s_-]*transparen|hospital[\s_-]*prices?|price[\s_-]*estimat|shoppable', re.I)
FAP_PAGE_RE = re.compile(r'financial[\s_-]*assist|charity|discount[\s_-]*payment|help[\s_-]*paying|'
                         r'pay(?:ing)?[\s_-]*(?:your|my|a)?[\s_-]*bill|billing|financial[\s_-]*(?:aid|help|counsel)|'
                         r'uninsured|self[\s_-]*pay|patients?[\s_-]*(?:and|&)?[\s_-]*visitors|insurance', re.I)


def score_mrf_link(href: str, text: str, hospital_name: str | None, site_url: str | None = None) -> float:
    h, t = href.lower(), text.lower()
    file_query = bool(FILE_QUERY_RE.search(h))
    if re.search(r'\.(xlsx?|pdf|docx?|html?|aspx?|php)(?:\?|$)', h) and 'box_download' not in h and not file_query:
        return 0
    s = 0.0
    if re.search(r'machine[\s-]*readable', t):
        s += 6
    if re.search(r'standard\s*charges?|standardcharges', t + ' ' + h):
        s += 4
    if re.search(r'\bmrf\b', t):
        s += 3
    if re.search(r'\.(json|csv|zip|gz)(?:\?|$)', h) or file_query:
        s += 4
    if re.search(r'box\.com|boxcloud|blob\.core|s3\.amazonaws|cloudfront|download|attachment|file_id', h):
        s += 2
    if re.search(r'price|transparen', t):
        s += 1
    if s < 5:
        return 0
    if hospital_name:
        s += 3 * name_overlap(hospital_name, text + ' ' + unquote(href))
        # Vendors pack the name into one code (dbAHCLCLEARLAKECA, ..._adventist_lodi_memorial_...).
        flat = re.sub(r'[^a-z0-9]', '', unquote(h))
        s += 2 * min(2, sum(1 for t in name_tokens(hospital_name) if len(t) >= 4 and t in flat))
    if site_url:
        # Words of the link text that appear in the hospital's domain ("ucsf" in ucsfhealth.org).
        label = urlparse(site_url).netloc.lower().removeprefix('www.').split('.')[0]
        s += 1.5 * sum(1 for t in name_tokens(text) if len(t) >= 3 and t in label)
    return s


def score_fap_doc(href: str, text: str) -> float:
    t = f'{text} {unquote(href)}'.lower()
    s = 0.0
    if re.search(r'financial[\s_-]*assistance[\s_-]*polic|charity[\s_-]*care[\s_-]*(?:and[\s_-]*discount[\s_-]*payment[\s_-]*)?polic|'
                 r'\bfap\b|discount[\s_-]*payment[\s_-]*polic|financial[\s_-]*assistance[\s_-]*program', t):
        s += 8
    elif re.search(r'charity|financial[\s_-]*assistance', t):
        s += 4
    if 'polic' in t:
        s += 2
    if re.search(r'plain[\s_-]*language|summary', t):
        s += 0.5
    if re.search(r'application|\bform\b', t):
        s -= 4
    if re.search(r'debt|collection|wall|posting|notice|discharge|statement|privacy|hipaa|mp3|audio|self[\s_-]*pay[\s_-]*discount', t):
        s -= 6
    return s


def is_application_link(href: str, text: str) -> bool:
    t = f'{text} {unquote(href)}'.lower()
    return 'application' in t and bool(re.search(r'financial|charity|assistance|discount', t)) and not re.search(r'mp3|audio', t)


# ---------------------------------------------------------------- crawl

@dataclass
class Link:
    url: str
    text: str
    found_on: str


@dataclass
class CrawlResult:
    pages: dict[str, str] = field(default_factory=dict)  # url -> visible text (only relevant pages)
    titles: dict[str, str] = field(default_factory=dict)
    mrf_links: list[Link] = field(default_factory=list)
    fap_docs: list[Link] = field(default_factory=list)
    app_links: list[Link] = field(default_factory=list)
    visited: list[str] = field(default_factory=list)
    price_pages: list[str] = field(default_factory=list)  # pages reached via "price transparency" links
    errors: list[str] = field(default_factory=list)


def _extract_links(html: str, base: str) -> list[tuple[str, str]]:
    soup = BeautifulSoup(html, 'html.parser')
    out = []
    for a in soup.find_all('a', href=True):
        href = str(a['href']).strip()
        if href.startswith(('mailto:', 'tel:', 'javascript:', '#')):
            continue
        url, _ = urldefrag(urljoin(base, href))
        if not url.startswith('http'):
            continue
        text = re.sub(r'\s+', ' ', a.get_text(' ', strip=True) or a.get('title') or a.get('aria-label') or '')
        out.append((url, text[:200]))
    return out


MAX_PAGE_BYTES = 5 * 1024 * 1024


def crawl_site(client: httpx.Client, start_url: str, max_pages: int = 30, max_depth: int = 3) -> CrawlResult:
    """Small best-first crawl of the hospital site that only follows links about prices,
    billing and financial assistance, and records candidate files/documents."""
    res = CrawlResult()
    seen: set[str] = set()
    # queue entries: (priority, depth, url); lower priority first
    queue: list[tuple[float, int, str]] = []
    for u in dict.fromkeys([start_url.rstrip('/') + '/', root_variants(start_url)[0] + '/']):
        queue.append((0, 0, u))
        seen.add(u)
    mrf_seen, fap_seen, app_seen = set(), set(), set()
    # Hosts allowed besides the hospital site: price transparency vendors linked from it
    # (many hospitals host their price page on a vendor domain). Only followed one level.
    vendor_hosts: set[str] = set()
    price_urls: set[str] = set()

    def fetch(url: str) -> tuple[str, httpx.Response | None, str | None, str]:
        # Stream, and read the body only for HTML pages (capped). A link without a file
        # extension can still serve a 500 MB price file; reading that whole would exhaust memory.
        try:
            with client.stream('GET', url, timeout=25) as r:
                ctype = r.headers.get('content-type', '').lower()
                if r.status_code >= 400 or 'html' not in ctype:
                    return url, r, None, ''
                buf = bytearray()
                for chunk in r.iter_bytes():
                    buf += chunk
                    if len(buf) > MAX_PAGE_BYTES:
                        break
                return url, r, None, bytes(buf).decode(r.encoding or 'utf-8', errors='replace')
        except httpx.HTTPError as e:
            return url, None, f'{type(e).__name__}', ''

    with ThreadPoolExecutor(max_workers=6) as pool:
        while queue and len(res.visited) < max_pages:
            queue.sort(key=lambda q: q[0])
            batch = []
            while queue and len(batch) < 6 and len(res.visited) + len(batch) < max_pages:
                batch.append(queue.pop(0))
            depth_of = {u: d for _, d, u in batch}
            for url, r, err, html in pool.map(lambda q: fetch(q[2]), batch):
                res.visited.append(url)
                if err or r is None:
                    res.errors.append(f'{url}: {err}')
                    continue
                ctype = r.headers.get('content-type', '').lower()
                if r.status_code >= 400 or 'html' not in ctype or not html:
                    continue
                final = str(r.url)
                title = html_title(html) or ''
                res.titles[final] = title
                page_text = html_text(html)
                if FAP_PAGE_RE.search(title + ' ' + final) or PRICE_PAGE_RE.search(title + ' ' + final):
                    res.pages[final] = page_text
                depth = depth_of.get(url, 0)
                if url in price_urls or PRICE_PAGE_RE.search(final):
                    res.price_pages.append(final)
                on_vendor = urlparse(final).netloc in vendor_hosts
                for link, text in _extract_links(html, final):
                    on_site = same_site(link, start_url)
                    is_file = bool(FILE_EXT_RE.search(link) or FILE_QUERY_RE.search(link)) or re.search(r'download|attachment|file_id|box\.com', link, re.I)
                    if link not in mrf_seen and (PRICE_PAGE_RE.search(text) or PRICE_PAGE_RE.search(link)
                                                 or re.search(r'\.(json|csv)(?:\?|$)', link, re.I) or FILE_QUERY_RE.search(link)):
                        mrf_seen.add(link)
                        res.mrf_links.append(Link(link, text, final))
                    if link not in app_seen and is_application_link(link, text):
                        app_seen.add(link)
                        res.app_links.append(Link(link, text, final))
                    if link not in fap_seen and score_fap_doc(link, text) >= 4:
                        fap_seen.add(link)
                        res.fap_docs.append(Link(link, text, final))
                    if is_file or link in seen or depth + 1 > max_depth:
                        continue
                    if not on_site:
                        host = urlparse(link).netloc
                        price_link = bool(PRICE_PAGE_RE.search(text))
                        if price_link and not on_vendor and not re.search(r'cms\.gov|hhs\.gov|chhs\.ca\.gov|hcai\.ca\.gov|facebook|twitter|youtube|linkedin', host):
                            vendor_hosts.add(host)
                            price_urls.add(link)
                            seen.add(link)
                            queue.append((0.5 + depth, depth + 1, link))
                        continue
                    if on_vendor:
                        continue
                    pri = None
                    if PRICE_PAGE_RE.search(text) or PRICE_PAGE_RE.search(urlparse(link).path):
                        pri = 1.0
                    if FAP_PAGE_RE.search(text) or FAP_PAGE_RE.search(urlparse(link).path):
                        pri = 1.0 if re.search(r'financial|charity|help|price|transparen', text + link, re.I) else 2.0
                    if pri is None:
                        continue
                    if pri == 1.0 and PRICE_PAGE_RE.search(text):
                        price_urls.add(link)
                    seen.add(link)
                    queue.append((pri + depth, depth + 1, link))
    return res
