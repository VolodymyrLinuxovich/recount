"""Hospital Price & Charity Care Finder (Apify Actor).

Input:  {hospitalUrl, hospitalName?, mrfUrl?, codes?, maxMrfMB?, maxCrawlPages?, useHcaiRegistry?}
        or {hospitals: [{hospitalUrl, hospitalName?, mrfUrl?, key?}, ...], maxConcurrency?, ...shared settings}
Output: one dataset item per hospital with the hospital's published prices for the codes and
        its financial assistance (charity care) FPL thresholds, with evidence.
Never invents values: anything not found is null plus a warning.
"""

from __future__ import annotations

import asyncio
import re
import threading
import time
from urllib.parse import unquote, urlparse

from apify import Actor

from .docs import doc_text
from .fpl import extract_thresholds, find_phones
from .hcai import find_hospital, policy_documents
from .http import fetch_limited, make_client
from .locate import crawl_site, fetch_cms_txt, name_overlap, score_fap_doc, score_mrf_link
from .mrf import norm_code, scan_url

MAX_DOC_BYTES = 25 * 1024 * 1024
MAX_FAP_DOCS = 6


def _normalize_url(u: str) -> str:
    u = (u or '').strip()
    if not u:
        raise ValueError('hospitalUrl is required (or pass a list of hospitals)')
    if not re.match(r'^https?://', u, re.I):
        u = 'https://' + u
    if not urlparse(u).netloc:
        raise ValueError(f'invalid hospitalUrl: {u}')
    return u


def _clean_title(t: str | None) -> str | None:
    if not t:
        return None
    parts = [p.strip() for p in re.split(r'\s[|\-–—]\s', t) if p.strip()]
    parts = [p for p in parts if p.lower() not in ('home', 'homepage', 'welcome')]
    # "Page title | Site name": the site name is usually last.
    return parts[-1] if parts else None


def run(inp: dict, log) -> dict:
    t0 = time.time()
    warnings: list[str] = []
    source_urls: list[str] = []

    def src(u: str | None):
        if u and u not in source_urls:
            source_urls.append(u)

    hospital_url = _normalize_url(inp.get('hospitalUrl', ''))
    given_name = (inp.get('hospitalName') or '').strip() or None
    codes = [norm_code(c) for c in (inp.get('codes') or []) if norm_code(c)]
    max_mb = float(inp.get('maxMrfMB') or 300)
    max_pages = int(inp.get('maxCrawlPages') or 30)
    use_hcai = inp.get('useHcaiRegistry', True) is not False
    given_mrf = (inp.get('mrfUrl') or '').strip() or None
    if given_mrf:
        # The price file is known, so the crawl only looks for assistance pages and a phone number.
        max_pages = min(max_pages, 10)

    client = make_client()

    # 1. CMS txt file + site crawl (in parallel)
    log.info(f'Looking for cms-hpt.txt and crawling {hospital_url} (max {max_pages} pages)')
    txt_box: dict = {}
    t_txt = threading.Thread(target=lambda: txt_box.update(r=fetch_cms_txt(client, hospital_url)))
    t_txt.start()
    crawl = crawl_site(client, hospital_url, max_pages=max_pages)
    t_txt.join()
    txt = txt_box.get('r')
    log.info(f'Crawled {len(crawl.visited)} pages; {len(crawl.mrf_links)} price links, '
             f'{len(crawl.fap_docs)} assistance documents, txt file: {"yes" if txt else "no"}')

    home_title = _clean_title(crawl.titles.get(next(iter(crawl.titles), ''), None)) if crawl.titles else None
    names = [n for n in [given_name, home_title] if n]

    # 2. Choose the machine-readable file
    mrf_url = None
    mrf_found_on = None
    if given_mrf:
        mrf_url = given_mrf
        mrf_found_on = 'input'
    elif txt:
        txt_url, entries = txt
        src(txt_url)
        best = max(entries, key=lambda e: name_overlap(given_name or home_title, e.get('location-name')))
        if len(entries) > 1 and not given_name:
            warnings.append(f'The CMS txt file lists {len(entries)} locations; picked "{best.get("location-name")}". '
                            'Pass hospitalName to choose another.')
        mrf_url = best['mrf-url']
        mrf_found_on = best.get('source-page-url')
        if best.get('location-name'):
            names.append(best['location-name'])
    else:
        warnings.append('No /cms-hpt.txt file found on the hospital domain '
                        '(CMS requires it); fell back to crawling the site.')
        scored = sorted(((score_mrf_link(l.url, l.text, given_name or home_title, hospital_url), l) for l in crawl.mrf_links),
                        key=lambda t: -t[0])
        scored = [(s, l) for s, l in scored if s > 0]
        if scored:
            mrf_url, mrf_found_on = scored[0][1].url, scored[0][1].found_on
            names.append(scored[0][1].text)
            def label(l):
                tail = unquote(urlparse(l.url).path.rsplit('/', 1)[-1])
                return f'"{l.text}"' + (f' ({tail})' if re.search(r'\.(json|csv|zip|gz)$', tail, re.I) else '')
            others = [label(l) for s, l in scored[1:4] if l.url != mrf_url]
            if others:
                warnings.append(f'Several price files were linked; used {label(scored[0][1])}. '
                                'Pass hospitalName to choose another. Others: ' + '; '.join(others))
    src(mrf_found_on)

    # 3. Scan the MRF and research the FAP in parallel. HCAI lookup prefers the official
    #    hospital name from the price file header, so it waits briefly for it.
    header_ready = threading.Event()
    header_box: dict = {}

    def on_header(res):
        header_box['name'] = res.hospitalNameInFile
        header_ready.set()

    mrf_box: dict = {}

    def do_mrf():
        try:
            if not mrf_url:
                return
            if not codes:
                warnings.append('No codes given; price file located but not scanned.')
                return
            log.info(f'Streaming price file {mrf_url} for codes {codes} (limit {max_mb:g} MB)')
            mrf_box['r'] = scan_url(client, mrf_url, codes, max_mb, on_header=on_header)
        except Exception as e:  # never fail the whole run on one source
            warnings.append(f'Price file scan failed: {type(e).__name__}: {e}')
        finally:
            header_ready.set()

    fap_box: dict = {}

    def do_fap():
        header_ready.wait(timeout=45)
        fap_names = [given_name, header_box.get('name')] + names
        fap_box['r'] = research_fap(client, crawl, [n for n in fap_names if n], use_hcai, log)

    th_m = threading.Thread(target=do_mrf)
    th_f = threading.Thread(target=do_fap)
    th_m.start(); th_f.start()
    th_m.join(); th_f.join()

    mrf_res = mrf_box.get('r')
    if mrf_res:
        warnings.extend(mrf_res.pop('_warnings', []))
        src(mrf_res['url'])
        for code, p in mrf_res['prices'].items():
            if p and p['min'] is None and p['max'] is None:
                warnings.append(f'Code {code}: the file lists no minimum/maximum negotiated charge for this item.')
            if p and p['discountedCash'] is None:
                warnings.append(f'Code {code}: the file lists no discounted cash price for this item.')
    elif not mrf_url:
        if crawl.price_pages:
            pages = ', '.join(dict.fromkeys(crawl.price_pages))
            warnings.append('Found the price transparency page(s) but no direct link to a machine-readable '
                            f'standard charges file (the page may load it with JavaScript): {pages}')
            for u in list(dict.fromkeys(crawl.price_pages))[:3]:
                src(u)
        else:
            warnings.append('Could not find the hospital\'s machine-readable standard charges file.')

    fap = fap_box.get('r') or {}
    warnings.extend(fap.pop('_warnings', []))
    for u in fap.pop('_sources', []):
        src(u)

    hospital_name = (given_name or fap.get('hcaiHospitalName') or (mrf_res or {}).get('hospitalNameInFile')
                     or home_title)
    item = {
        'hospitalName': hospital_name,
        'hospitalUrl': hospital_url,
        'sourceUrls': source_urls,
        'mrf': {
            'url': mrf_url,
            'foundOn': mrf_found_on,
            'lastUpdated': (mrf_res or {}).get('lastUpdated'),
            'format': (mrf_res or {}).get('format'),
            'schemaVersion': (mrf_res or {}).get('schemaVersion'),
            'hospitalNameInFile': (mrf_res or {}).get('hospitalNameInFile'),
            'prices': (mrf_res or {}).get('prices') or {c: None for c in codes},
            'scan': (mrf_res or {}).get('scan'),
        },
        'fap': fap,
        'warnings': warnings,
        'run': {'pagesCrawled': len(crawl.visited), 'totalSeconds': round(time.time() - t0, 1)},
    }
    client.close()
    return item


def research_fap(client, crawl, names: list[str], use_hcai: bool, log) -> dict:
    warnings: list[str] = []
    sources: list[str] = []
    out: dict = {
        'url': None, 'freeCareMaxFplPct': None, 'discountMaxFplPct': None, 'discountHasNoFplCap': False,
        'quotes': [], 'phone': None, 'applicationUrl': None, 'policyEffectiveDate': None,
        'hcaiPageUrl': None, 'hcaiHospitalName': None, 'documentsChecked': [],
    }
    docs: list[tuple[str, str]] = []  # (url, origin)
    hcai_docs = None
    if use_hcai:
        try:
            hit = find_hospital(client, names)
            if hit:
                log.info(f'HCAI registry match: {hit[1]} ({hit[0]})')
                hcai_docs = policy_documents(client, hit[0])
                out['hcaiPageUrl'], out['hcaiHospitalName'] = hcai_docs['pageUrl'], hit[1]
                sources.append(hcai_docs['pageUrl'])
                if hcai_docs['charityCarePolicy']:
                    docs.append((hcai_docs['charityCarePolicy'], 'hcai:charity'))
                if hcai_docs['discountPaymentPolicy'] and hcai_docs['discountPaymentPolicy'] != hcai_docs['charityCarePolicy']:
                    docs.append((hcai_docs['discountPaymentPolicy'], 'hcai:discount'))
            else:
                warnings.append('Hospital not found in the California HCAI policy registry '
                                f'(searched: {", ".join(dict.fromkeys(names))[:200]}).')
        except Exception as e:
            warnings.append(f'HCAI registry lookup failed: {type(e).__name__}')

    site_docs = sorted(crawl.fap_docs, key=lambda l: -score_fap_doc(l.url, l.text))
    for l in site_docs[:4]:
        docs.append((l.url, f'site:{l.text[:60]}'))

    texts: list[tuple[str, str]] = []  # (url, text) in priority order, for phone search
    for url, origin in docs[:MAX_FAP_DOCS]:
        if out['freeCareMaxFplPct'] is not None and (out['discountMaxFplPct'] is not None or out['discountHasNoFplCap']):
            break
        try:
            r, body, truncated = fetch_limited(client, url, MAX_DOC_BYTES)
            if r.status_code >= 400:
                out['documentsChecked'].append({'url': url, 'origin': origin, 'result': f'HTTP {r.status_code}'})
                continue
            kind, text = doc_text(body, r.headers.get('content-type', ''))
        except Exception as e:
            out['documentsChecked'].append({'url': url, 'origin': origin, 'result': f'error {type(e).__name__}'})
            continue
        if len(text.strip()) < 200:
            out['documentsChecked'].append({'url': url, 'origin': origin, 'result': 'no extractable text (scanned image?)'})
            continue
        texts.append((url, text))
        ex = extract_thresholds(text)
        used = False
        for q in ex['quotes']:
            q['sourceUrl'] = url
        if out['freeCareMaxFplPct'] is None and ex['freeCareMaxFplPct'] is not None:
            out['freeCareMaxFplPct'] = ex['freeCareMaxFplPct']
            out['url'] = out['url'] or url
            out['quotes'] += [q for q in ex['quotes'] if q['kind'] == 'freeCare']
            used = True
        if out['discountMaxFplPct'] is None and not out['discountHasNoFplCap'] and (
                ex['discountMaxFplPct'] is not None or ex['discountHasNoFplCap']):
            out['discountMaxFplPct'] = ex['discountMaxFplPct']
            out['discountHasNoFplCap'] = ex['discountHasNoFplCap']
            out['url'] = out['url'] or url
            out['quotes'] += [q for q in ex['quotes'] if q['kind'] != 'freeCare']
            used = True
        if used:
            sources.append(url)
            if hcai_docs and origin.startswith('hcai:'):
                out['policyEffectiveDate'] = hcai_docs.get('charityCareEffectiveDate') if origin == 'hcai:charity' \
                    else hcai_docs.get('discountPaymentEffectiveDate')
        out['documentsChecked'].append({'url': url, 'origin': origin, 'result': 'thresholds found' if used else 'no thresholds found'})

    if out['url'] is None and docs:
        out['url'] = docs[0][0]
    if not docs:
        warnings.append('No financial assistance / charity care policy document found.')
    if out['freeCareMaxFplPct'] is None:
        warnings.append('Could not find a free (full charity) care income limit as a % of FPL in the policy text.')
    if out['discountMaxFplPct'] is None and not out['discountHasNoFplCap']:
        warnings.append('Could not find a discounted care income limit as a % of FPL in the policy text.')

    # Phone: crawled billing/assistance pages first (they are kept current), then the policy text.
    page_texts = [(u, t) for u, t in crawl.pages.items()]
    best_phone = None
    for prio, (u, t) in enumerate(page_texts + texts):
        for score, phone, ctx in find_phones(t)[:3]:
            key = (score, -prio)
            if best_phone is None or key > best_phone[0]:
                best_phone = (key, phone, u, ctx)
    if best_phone:
        out['phone'] = best_phone[1]
        out['phoneContext'] = best_phone[3]
        out['phoneSourceUrl'] = best_phone[2]
    else:
        warnings.append('No billing / financial assistance phone number found.')

    if hcai_docs and hcai_docs.get('charityCareApplication'):
        out['applicationUrl'] = hcai_docs['charityCareApplication']
    elif crawl.app_links:
        out['applicationUrl'] = crawl.app_links[0].url
    else:
        warnings.append('No financial assistance application link found.')
    out['_warnings'] = warnings
    out['_sources'] = sources
    return out


def _status(item: dict) -> str:
    f = item.get('fap') or {}
    prices = (item.get('mrf') or {}).get('prices') or {}
    found = sum(1 for p in prices.values() if p)
    return (f'{item.get("hospitalName")}: {found}/{len(prices)} codes priced; '
            f'free care <= {f.get("freeCareMaxFplPct")}% FPL; {len(item.get("warnings") or [])} warnings')


def _jobs(inp: dict) -> list[dict]:
    """One job per hospital. A batch is a list of hospitals sharing the top-level settings."""
    shared = {k: v for k, v in inp.items() if k != 'hospitals'}
    batch = inp.get('hospitals') or []
    if not batch:
        return [shared]
    jobs = []
    for h in batch:
        if isinstance(h, str):
            h = {'hospitalUrl': h}
        jobs.append({**shared, **{k: v for k, v in h.items() if v not in (None, '', [])}})
    return jobs


async def main() -> None:
    async with Actor:
        inp = await Actor.get_input() or {}
        jobs = _jobs(inp)
        if len(jobs) == 1:
            try:
                item = await asyncio.to_thread(run, jobs[0], Actor.log)
            except ValueError as e:
                await Actor.fail(status_message=str(e))
                return
            await Actor.push_data(item)
            await Actor.set_value('OUTPUT', item)
            await Actor.set_status_message(_status(item))
            return

        # Batch: several hospitals at once. One bad site never fails the run; it gets an error item.
        limit = asyncio.Semaphore(max(1, min(int(inp.get('maxConcurrency') or 4), 16)))
        done = {'n': 0, 'priced': 0}

        async def one(job: dict) -> None:
            async with limit:
                try:
                    item = await asyncio.to_thread(run, job, Actor.log)
                except Exception as e:
                    item = {'hospitalName': job.get('hospitalName'), 'hospitalUrl': job.get('hospitalUrl'),
                            'error': f'{type(e).__name__}: {e}'[:300], 'mrf': None, 'fap': None, 'warnings': []}
                if job.get('key'):
                    item['key'] = job['key']
                await Actor.push_data(item)
                done['n'] += 1
                if any((item.get('mrf') or {}).get('prices', {}).values()):
                    done['priced'] += 1
                await Actor.set_status_message(f'{done["n"]}/{len(jobs)} hospitals done, {done["priced"]} with prices. Last: {_status(item)}')

        await asyncio.gather(*(one(j) for j in jobs))
