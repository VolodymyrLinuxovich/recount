"""Build audit/corpus/ from raw/crawl.json + downloaded PDFs (run crawl.py first).

- corpus/text/<slug>__<doctype>.json : {"pages": [{"n": 1, "text": ...}, ...]}
- corpus/hospitals.json              : one record per hospital with doc metadata
- corpus/README.md                   : counts + how to rerun

PDFs with (almost) no text layer are marked needs_ocr (no OCR is attempted).
Usage:  .venv/bin/python -I extract.py [--force]
"""
import argparse
import json
import logging
import os
import re
import sys
import time
import warnings
from concurrent.futures import ProcessPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
CORPUS = os.path.join(HERE, "corpus")
TEXT = os.path.join(CORPUS, "text")
OUT_TYPES = ["charity_care", "discount_payment", "debt_collection", "application", "application_discount"]
MIN_CHARS_PER_PAGE = 50  # below this on average -> treat as scanned


def extract(args):
    pdf, dest = args
    logging.disable(logging.CRITICAL)
    warnings.filterwarnings("ignore")
    import pypdf
    try:
        reader = pypdf.PdfReader(pdf)
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                pass
        pages = []
        for i, p in enumerate(reader.pages, 1):
            try:
                t = p.extract_text() or ""
            except Exception as e:
                t = ""
            t = t.replace("\x00", "")
            pages.append({"n": i, "text": t})
        with open(dest + ".part", "w") as f:
            json.dump({"pages": pages}, f, ensure_ascii=False)
        os.replace(dest + ".part", dest)
        return {"error": None}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}


def stats(path):
    pages = json.load(open(path))["pages"]
    chars = sum(len(re.sub(r"\s", "", p["text"])) for p in pages)
    n = len(pages)
    return n, chars, (n == 0 or chars / n < MIN_CHARS_PER_PAGE)


def county_lookup():
    """Optional zip->county map if raw/zip_county.json exists (not required)."""
    p = os.path.join(RAW, "zip_county.json")
    return json.load(open(p)) if os.path.exists(p) else {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    t0 = time.time()
    os.makedirs(TEXT, exist_ok=True)
    crawl = json.load(open(os.path.join(RAW, "crawl.json")))
    hospitals = crawl["hospitals"]
    zc = county_lookup()

    jobs = []
    for h in hospitals:
        for t, d in h["latest"].items():
            dl = (d or {}).get("download") or {}
            if d and not dl.get("error"):
                pdf = os.path.join(RAW, "pdf", f"{h['slug']}__{t}.pdf")
                txt = os.path.join(TEXT, f"{h['slug']}__{t}.json")
                stale = os.path.exists(txt) and os.path.getmtime(txt) < os.path.getmtime(pdf)
                if os.path.exists(pdf) and dl.get("is_pdf") and (a.force or stale or not os.path.exists(txt)):
                    jobs.append((pdf, txt))
    print(f"extracting {len(jobs)} PDFs", file=sys.stderr)
    errs = {}
    with ProcessPoolExecutor(6) as ex:
        for (pdf, txt), r in zip(jobs, ex.map(extract, jobs, chunksize=4)):
            if r["error"]:
                errs[txt] = r["error"]

    out, failures = [], list(crawl["errors"])
    counts = {"hospitals": len(hospitals), "docs_found": 0, "docs_downloaded": 0, "docs_text": 0,
              "needs_ocr": 0, "extract_failed": 0, "not_pdf": 0, "by_type": {}}
    for h in hospitals:
        docs = {}
        for t in OUT_TYPES:
            d = h["latest"].get(t)
            if not d:
                docs[t] = None
                continue
            counts["docs_found"] += 1
            bt = counts["by_type"].setdefault(t, {"found": 0, "text": 0, "needs_ocr": 0})
            bt["found"] += 1
            dl = d.get("download") or {}
            pdf = os.path.join(RAW, "pdf", f"{h['slug']}__{t}.pdf")
            txt = os.path.join(TEXT, f"{h['slug']}__{t}.json")
            rec = {"url": d["url"], "label": d["label"], "effective_date": d["effective_date"],
                   "pdf_path": os.path.relpath(pdf, HERE) if os.path.exists(pdf) else None,
                   "text_path": None, "pages": None, "chars": None, "needs_ocr": None,
                   "error": dl.get("error")}
            if not dl.get("error") and os.path.exists(pdf):
                counts["docs_downloaded"] += 1
                if not dl.get("is_pdf"):
                    rec["error"] = f"not a PDF (content-type {dl.get('content_type')})"
                    counts["not_pdf"] += 1
                    failures.append({"slug": h["slug"], "stage": "extract", "type": t, "error": rec["error"]})
                elif txt in errs or not os.path.exists(txt):
                    rec["error"] = errs.get(txt, "no text output")
                    counts["extract_failed"] += 1
                    failures.append({"slug": h["slug"], "stage": "extract", "type": t, "error": rec["error"]})
                else:
                    n, chars, ocr = stats(txt)
                    rec.update(text_path=os.path.relpath(txt, HERE), pages=n, chars=chars, needs_ocr=ocr)
                    counts["docs_text"] += 1
                    bt["text"] += 1
                    if ocr:
                        counts["needs_ocr"] += 1
                        bt["needs_ocr"] += 1
            docs[t] = rec
        out.append({
            "key": h["slug"], "name": h.get("name") or h["list_name"], "license": h.get("license"),
            "hcai_id": h.get("hcai_id"), "license_type": h.get("license_type"),
            "address": h.get("address"), "street": h.get("street"), "city": h.get("city"),
            "zip": h.get("zip"), "county": zc.get(h.get("zip") or ""),
            "lat": h.get("lat"), "lon": h.get("lon"),
            "aliases": h.get("aliases"), "detail_url": h["detail_url"], "archive_url": h.get("archive_url"),
            "n_documents_listed": len(h["documents"]), "docs": docs,
        })
    json.dump(out, open(os.path.join(CORPUS, "hospitals.json"), "w"), indent=1, ensure_ascii=False)
    json.dump({"counts": counts, "failures": failures}, open(os.path.join(CORPUS, "summary.json"), "w"), indent=1)

    no_docs = [o["key"] for o in out if not any(o["docs"].values())]
    missing = {t: sum(1 for o in out if not o["docs"][t]) for t in OUT_TYPES}
    geocoded = sum(1 for o in out if o["lat"] is not None)
    lines = [
        "# HCAI hospital policy corpus", "",
        f"Source: {crawl['source']} (public, no login). Crawled {crawl['crawled_at']}; "
        f"crawl took {crawl['seconds']:.0f}s, extraction {time.time() - t0:.0f}s.", "",
        "## Counts", "",
        f"- hospitals listed: {crawl['listed']}; detail pages parsed: {len(hospitals)}",
        f"- latest documents found: {counts['docs_found']}; downloaded: {counts['docs_downloaded']}; "
        f"text extracted: {counts['docs_text']}",
        f"- needs_ocr (no usable text layer, < {MIN_CHARS_PER_PAGE} non-space chars/page): {counts['needs_ocr']}",
        f"- failures: {len(failures)} (download/extract/detail; see summary.json)",
        f"- hospitals with no documents at all: {len(no_docs)}",
        f"- geocoded (Census): {geocoded}", "",
        "| doc type | found | text | needs_ocr | hospitals missing |", "|---|---|---|---|---|",
    ]
    for t in OUT_TYPES:
        bt = counts["by_type"].get(t, {"found": 0, "text": 0, "needs_ocr": 0})
        lines.append(f"| {t} | {bt['found']} | {bt['text']} | {bt['needs_ocr']} | {missing[t]} |")
    lines += [
        "", "Doc types come from the detail page sections: `Charity Care Policy` > Policies (charity_care) / "
        "Application (application = \"Application for Charity Care\"), `Discount Payment Policy` > Policies "
        "(discount_payment) / Application (application_discount), `Debt Collection Policy` > Policies "
        "(debt_collection). For each type the newest effective date is kept.", "",
        "## Files", "",
        "- `hospitals.json`: one record per hospital (key = HCAI slug), docs keyed by type.",
        "- `text/<slug>__<type>.json`: `{pages: [{n, text}]}` from pypdf.",
        "- `summary.json`: counts + failure list.",
        "- PDFs and cached pages live in `../raw/` (gitignored).", "",
        "## Rerun", "", "```",
        "cd audit && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt",
        ".venv/bin/python -I crawl.py --geocode   # resume-safe; --limit N for a dry run, --refresh-list to re-list",
        ".venv/bin/python -I extract.py           # --force to re-extract all",
        "```",
    ]
    if failures:
        lines += ["", "## Failures", ""] + [
            f"- {f['slug']} [{f['stage']}{'/' + f['type'] if f.get('type') else ''}]: {f['error'][:160]}" for f in failures]
    open(os.path.join(CORPUS, "README.md"), "w").write("\n".join(lines) + "\n")
    print(json.dumps(counts, indent=1), file=sys.stderr)


if __name__ == "__main__":
    main()
