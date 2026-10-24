"""Shared helpers: paths, HTTP download, PDF text extraction.

All paths are relative to the project root (the parent of scripts/).
Downloaded files are untrusted data and only ever parsed, never executed.
"""
import http.cookiejar
import logging
import os
import ssl
import urllib.request
import warnings

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
OUT = os.path.join(ROOT, "out")
CURATED = os.path.join(ROOT, "scripts", "curated")

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/17.0 Safari/605.1.15")

try:  # python.org macOS builds ship without a CA bundle; certifi fixes that
    import certifi
    _ctx = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _ctx = ssl.create_default_context()

_jar = http.cookiejar.CookieJar()
_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_jar),
                                      urllib.request.HTTPSHandler(context=_ctx))


def raw_path(*parts):
    p = os.path.join(RAW, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def fetch(url, dest=None, warmup=None, timeout=300):
    """GET url (browser UA, shared cookie jar). If dest is given, stream to that
    file and return its path; otherwise return the body as bytes.
    `warmup` is an optional page fetched first to collect cookies (Kaiser)."""
    if warmup:
        _opener.open(urllib.request.Request(warmup, headers={"User-Agent": UA}), timeout=60).read()
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with _opener.open(req, timeout=timeout) as r:
        if dest is None:
            return r.read()
        tmp = dest + ".part"
        with open(tmp, "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                f.write(b)
        os.replace(tmp, dest)
        return dest


def pdf_text(path):
    """Extract plain text from a PDF with pypdf (warnings silenced)."""
    import pypdf
    logging.disable(logging.CRITICAL)
    warnings.filterwarnings("ignore")
    reader = pypdf.PdfReader(path)
    return "\n".join((p.extract_text() or "") for p in reader.pages)
