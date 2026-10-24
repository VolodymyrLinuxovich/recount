"""HTTP helpers. Browser-like headers: several hospital sites sit behind
Cloudflare / WP Engine and block obvious bot clients."""

from __future__ import annotations

import io
import zlib
from typing import Iterator
from urllib.parse import urlparse

import httpx

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}


def make_client(timeout: float = 30.0) -> httpx.Client:
    return httpx.Client(
        headers=HEADERS,
        follow_redirects=True,
        timeout=httpx.Timeout(timeout, connect=20.0),
        max_redirects=10,
    )


def root_variants(url: str) -> list[str]:
    host = urlparse(url).netloc
    bare = host.removeprefix('www.')
    out: list[str] = []
    for h in (host, bare, f'www.{bare}'):
        u = f'https://{h}'
        if u not in out:
            out.append(u)
    return out


def site_key(url: str) -> str:
    """Registrable-ish domain used to decide whether a link stays on the hospital site."""
    host = urlparse(url).netloc.lower().split(':')[0].removeprefix('www.')
    parts = host.split('.')
    return '.'.join(parts[-2:]) if len(parts) >= 2 else host


def same_site(a: str, b: str) -> bool:
    try:
        return site_key(a) == site_key(b)
    except Exception:
        return False


def fetch_limited(client: httpx.Client, url: str, max_bytes: int) -> tuple[httpx.Response, bytes, bool]:
    """GET with a hard cap on body size. Returns (response, body, truncated)."""
    with client.stream('GET', url) as r:
        buf = bytearray()
        truncated = False
        for chunk in r.iter_bytes():
            buf += chunk
            if len(buf) > max_bytes:
                truncated = True
                break
        return r, bytes(buf), truncated


class ByteStream(io.RawIOBase):
    """File-like wrapper over a byte iterator with a byte cap, gzip sniffing and
    an external stop flag. Counts bytes as received from the network."""

    def __init__(self, chunks: Iterator[bytes], max_bytes: int):
        self._it = chunks
        self._buf = b''
        self.max_bytes = max_bytes
        self.bytes_read = 0
        self.capped = False
        self._gunzip: zlib._Decompress | None = None
        self._first = True
        self._eof = False
        self._bom_checked = False

    def readable(self) -> bool:
        return True

    def _next_raw(self) -> bytes:
        data = self._next_decoded()
        if not self._bom_checked and data:
            self._bom_checked = True
            if data.startswith(b'\xef\xbb\xbf'):  # UTF-8 BOM (common in MRFs) breaks JSON parsers
                data = data[3:]
        return data

    def _next_decoded(self) -> bytes:
        if self._eof:
            return b''
        if self.bytes_read >= self.max_bytes:
            self.capped = True
            self._eof = True
            return b''
        try:
            chunk = next(self._it)
        except StopIteration:
            self._eof = True
            if self._gunzip is not None:
                return self._gunzip.flush()
            return b''
        self.bytes_read += len(chunk)
        if self._first and chunk:
            self._first = False
            if chunk[:2] == b'\x1f\x8b':
                self._gunzip = zlib.decompressobj(16 + zlib.MAX_WBITS)
        if self._gunzip is not None:
            return self._gunzip.decompress(chunk)
        return chunk

    def peek_bytes(self, n: int = 65536) -> bytes:
        while len(self._buf) < n and not self._eof:
            self._buf += self._next_raw()
        return self._buf[:n]

    def readinto(self, b) -> int:  # type: ignore[override]
        while not self._buf and not self._eof:
            self._buf = self._next_raw()
        if not self._buf:
            return 0
        n = min(len(b), len(self._buf))
        b[:n] = self._buf[:n]
        self._buf = self._buf[n:]
        return n

    def read(self, size: int = -1) -> bytes:  # used directly by ijson
        if size is None or size < 0:
            out = bytearray()
            while True:
                part = self.read(1 << 16)
                if not part:
                    return bytes(out)
                out += part
        ba = bytearray(size)
        n = self.readinto(ba)
        return bytes(ba[:n])
