"""Turn downloaded documents (PDF / HTML) into plain text. Documents are
untrusted input: we only extract text, never execute or render anything."""

from __future__ import annotations

import io
import logging
import re

from bs4 import BeautifulSoup
from pypdf import PdfReader

logging.getLogger('pypdf').setLevel(logging.ERROR)

MAX_PDF_PAGES = 80


def is_pdf(body: bytes, content_type: str = '') -> bool:
    return body[:5] == b'%PDF-' or 'application/pdf' in content_type.lower()


def pdf_text(body: bytes) -> str:
    reader = PdfReader(io.BytesIO(body), strict=False)
    parts = []
    for i, page in enumerate(reader.pages):
        if i >= MAX_PDF_PAGES:
            break
        try:
            parts.append(page.extract_text() or '')
        except Exception:
            parts.append('')
    return '\n'.join(parts)


def html_text(html: str) -> str:
    soup = BeautifulSoup(html, 'html.parser')
    for tag in soup(['script', 'style', 'noscript', 'svg', 'template']):
        tag.decompose()
    main = soup.find('main') or soup.body or soup
    return re.sub(r'\s+', ' ', main.get_text(' ', strip=True))


def doc_text(body: bytes, content_type: str = '') -> tuple[str, str]:
    """Returns (kind, text) where kind is 'pdf' or 'html'."""
    if is_pdf(body, content_type):
        return 'pdf', pdf_text(body)
    return 'html', html_text(body.decode('utf-8', 'replace'))


def html_title(html: str) -> str | None:
    soup = BeautifulSoup(html, 'html.parser')
    m = soup.select_one('meta[property="og:site_name"]')
    if m and m.get('content'):
        return str(m['content']).strip()
    if soup.title and soup.title.string:
        return soup.title.string.strip()
    m = soup.select_one('meta[property="og:title"]')
    if m and m.get('content'):
        return str(m['content']).strip()
    return None
