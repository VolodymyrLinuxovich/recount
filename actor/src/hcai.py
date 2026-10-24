"""California HCAI Hospital Fair Pricing Policy Lookup.

Every California general acute care hospital must file its charity care,
discount payment and debt collection policies (and application forms) with
the Department of Health Care Access and Information (HCAI). HCAI publishes
them at hcai.ca.gov/affordability/hospital-fair-billing-program/
hospital-fair-pricing-policy-lookup/. This is the most reliable public source
of a CA hospital's current policy, so we use it alongside the hospital site.
"""

from __future__ import annotations

import re
from urllib.parse import quote_plus, urljoin

import httpx
from bs4 import BeautifulSoup

from .locate import name_overlap, name_tokens

LOOKUP = 'https://hcai.ca.gov/affordability/hospital-fair-billing-program/hospital-fair-pricing-policy-lookup/'


def _search(client: httpx.Client, query: str) -> list[tuple[str, str]]:
    r = client.get(f'{LOOKUP}?hcai_search={quote_plus(query)}', timeout=30)
    if r.status_code != 200:
        return []
    soup = BeautifulSoup(r.text, 'html.parser')
    out: dict[str, str] = {}
    for a in soup.find_all('a', href=True):
        href = str(a['href'])
        text = a.get_text(' ', strip=True)
        if '/affordability/hospital-billing-policies/' in href and text and 'view all' not in text.lower():
            out.setdefault(href, text)
    return list(out.items())


def find_hospital(client: httpx.Client, names: list[str]) -> tuple[str, str, float] | None:
    """Best-matching HCAI policy page for any of the given names: (url, title, score)."""
    best: tuple[str, str, float] | None = None
    tried: set[str] = set()
    for name in names:
        if not name:
            continue
        toks = name_tokens(name)
        queries = [name]
        if len(toks) > 2:
            queries.append(' '.join(toks[:3]))
        # WordPress search can be strict; fall back to the most distinctive single words.
        queries += sorted((t for t in toks if len(t) >= 4), key=len, reverse=True)[:2]
        for q in queries:
            if q.lower() in tried:
                continue
            tried.add(q.lower())
            try:
                results = _search(client, q)
            except httpx.HTTPError:
                continue
            for url, title in results:
                # Symmetric overlap so "UCSF Medical Center" does not match every UCSF campus equally.
                score = (name_overlap(name, title) + name_overlap(title, name)) / 2
                if best is None or score > best[2]:
                    best = (url, title, score)
        if best and best[2] >= 0.99:
            break
    if best and best[2] >= 0.5:
        return best
    return None


def policy_documents(client: httpx.Client, page_url: str) -> dict:
    """Current (first-listed) policy and application links from an HCAI hospital page."""
    r = client.get(page_url, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, 'html.parser')
    main = soup.find('main') or soup
    docs: dict = {'pageUrl': str(r.url), 'charityCarePolicy': None, 'discountPaymentPolicy': None,
                  'charityCareApplication': None, 'discountPaymentApplication': None,
                  'charityCareEffectiveDate': None, 'discountPaymentEffectiveDate': None}
    for a in main.find_all('a', href=True):
        text = a.get_text(' ', strip=True)
        href = urljoin(str(r.url), str(a['href']))
        if 'Attachment' not in href and not href.lower().endswith('.pdf'):
            continue
        eff = None
        li = a.find_parent('li')
        date_el = li.find(class_='date') if li else None
        if date_el:
            m = re.search(r'(\d{1,2}/\d{1,2}/\d{4})', date_el.get_text())
            eff = m.group(1) if m else None
        low = text.lower()
        if low == 'charity care policy' and not docs['charityCarePolicy']:
            docs['charityCarePolicy'], docs['charityCareEffectiveDate'] = href, eff
        elif low == 'discount payment policy' and not docs['discountPaymentPolicy']:
            docs['discountPaymentPolicy'], docs['discountPaymentEffectiveDate'] = href, eff
        elif 'application' in low and 'charity' in low and not docs['charityCareApplication']:
            docs['charityCareApplication'] = href
        elif 'application' in low and 'discount' in low and not docs['discountPaymentApplication']:
            docs['discountPaymentApplication'] = href
    return docs
