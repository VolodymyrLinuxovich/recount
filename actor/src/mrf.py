"""Streaming parser for CMS hospital price transparency machine-readable files (MRFs).

Supports the CMS v2/v3 JSON schema (standard_charge_information[] with
code_information[] and standard_charges[]) and the CSV "tall" and "wide"
templates. Files can be hundreds of MB, so nothing is loaded into memory:
JSON is streamed with ijson, CSV row by row, and the scan stops early once
every requested code has been seen (plus a grace window so later lines for
the same code are still collected).
"""

from __future__ import annotations

import csv
import io
import re
import time
from dataclasses import dataclass, field
from decimal import Decimal
from typing import IO, Any, Callable

import httpx
import ijson

MAX_LINES_PER_CODE = 12
GRACE_JSON_ITEMS = 3000
GRACE_CSV_ROWS = 60000
# Chargemaster line numbers and revenue codes are not billing codes a patient sees as CPT/HCPCS.
EXCLUDED_CODE_TYPES = {'CDM', 'RC', 'LOCAL'}

csv.field_size_limit(1 << 30)


def parse_money(v: Any) -> float | None:
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float, Decimal)):
        f = float(v)
        return f if f == f else None
    s = re.sub(r'[$,\s]', '', str(v))
    if not s or not re.fullmatch(r'-?\d*\.?\d+', s):
        return None
    return float(s)


def norm_code(c: Any) -> str:
    return str(c if c is not None else '').strip().upper()


@dataclass
class _Line:
    code: str
    codeType: str | None
    description: str | None
    setting: str | None
    grossCharge: float | None = None
    discountedCash: float | None = None
    min: float | None = None
    max: float | None = None
    negotiated: list[float] = field(default_factory=list)

    def to_dict(self) -> dict:
        neg = self.negotiated
        return {
            'code': self.code,
            'codeType': self.codeType,
            'description': self.description,
            'setting': self.setting,
            'grossCharge': self.grossCharge,
            'discountedCash': self.discountedCash,
            'min': self.min,
            'max': self.max,
            'payerRateLow': min(neg) if neg else None,
            'payerRateHigh': max(neg) if neg else None,
            'payerRateCount': len(neg),
        }


class Collector:
    def __init__(self, codes: list[str]):
        self.wanted = {norm_code(c) for c in codes if norm_code(c)}
        self.found: dict[str, dict[tuple, _Line]] = {}
        self.last_new_match_at = 0

    def all_found(self) -> bool:
        """True when every code has both a line with a gross charge and a line with negotiated
        rates (some files, e.g. UCSF, list those in separate items far apart)."""
        if not self.wanted:
            return False
        for c in self.wanted:
            lines = self.found.get(c)
            if not lines:
                return False
            vals = lines.values()
            if not any(l.grossCharge is not None for l in vals):
                return False
            if not any(l.min is not None or l.max is not None or l.negotiated for l in vals):
                return False
        return True

    def add(self, record_no: int, code: str, code_type: str | None, description: str | None,
            setting: str | None, gross: float | None, cash: float | None,
            mn: float | None, mx: float | None, negotiated: list[float]) -> None:
        by_key = self.found.get(code)
        if by_key is None:
            by_key = self.found[code] = {}
            self.last_new_match_at = record_no
        key = (setting or '', description or '')
        line = by_key.get(key)
        if line is None:
            line = by_key[key] = _Line(code, code_type, description, setting)
        if (gross is not None and line.grossCharge is None) or ((mn is not None or mx is not None or negotiated)
                                                                and line.min is None and line.max is None
                                                                and not line.negotiated):
            self.last_new_match_at = record_no
        if line.grossCharge is None:
            line.grossCharge = gross
        if line.discountedCash is None:
            line.discountedCash = cash
        if mn is not None:
            line.min = mn if line.min is None else min(line.min, mn)
        if mx is not None:
            line.max = mx if line.max is None else max(line.max, mx)
        line.negotiated.extend(negotiated)

    def result(self) -> dict[str, dict | None]:
        out: dict[str, dict | None] = {}
        rank_setting = {'outpatient': 0, 'both': 1, 'inpatient': 2}
        for code in sorted(self.wanted):
            by_key = self.found.get(code)
            if not by_key:
                out[code] = None
                continue
            lines = [l.to_dict() for l in by_key.values()]
            # Primary line: outpatient first (ER / clinic bills), then "both", then inpatient;
            # prefer lines that actually carry a gross charge. Stable sort keeps file order otherwise.
            lines.sort(key=lambda l: (l['grossCharge'] is None, rank_setting.get(l['setting'] or '', 3)))
            primary = dict(lines[0])
            primary['minMaxSetting'] = primary['setting'] if (primary['min'] is not None or primary['max'] is not None) else None
            if primary['min'] is None and primary['max'] is None:
                # Negotiated min/max may be published on a separate line (e.g. professional/outpatient rate).
                with_rates = [l for l in lines if l['min'] is not None or l['max'] is not None]
                with_rates.sort(key=lambda l: (l['setting'] != primary['setting'], rank_setting.get(l['setting'] or '', 3)))
                if with_rates:
                    src = with_rates[0]
                    primary['min'], primary['max'] = src['min'], src['max']
                    primary['minMaxSetting'] = src['setting']
            if primary['payerRateCount'] == 0:
                with_payers = [l for l in lines if l['payerRateCount']]
                if with_payers:
                    src = with_payers[0]
                    for k in ('payerRateLow', 'payerRateHigh', 'payerRateCount'):
                        primary[k] = src[k]
            primary['lines'] = lines[:MAX_LINES_PER_CODE]
            primary['totalLines'] = len(lines)
            out[code] = primary
        return out


@dataclass
class ScanResult:
    format: str | None = None
    version: str | None = None
    hospitalNameInFile: str | None = None
    lastUpdated: str | None = None
    prices: dict = field(default_factory=dict)
    records: int = 0
    stopped_early: bool = False
    error: str | None = None


def _sniff(head: bytes) -> str:
    text = head.decode('utf-8', 'replace').lstrip('﻿ \t\r\n')
    if head[:2] == b'PK':
        return 'zip'
    if text.startswith('<'):
        return 'html'
    if text.startswith('{') or text.startswith('['):
        return 'json'
    return 'csv'


def scan_stream(stream: IO[bytes], codes: list[str], head: bytes | None = None,
                on_header: Callable[[ScanResult], None] | None = None) -> ScanResult:
    """Scan an already-open binary stream. `head` is the first bytes (for sniffing),
    which must still be readable from `stream` (use a peekable stream)."""
    res = ScanResult()
    collector = Collector(codes)
    if head is None:
        if hasattr(stream, 'peek_bytes'):
            head = stream.peek_bytes()  # type: ignore[attr-defined]
        else:
            data = stream.read()
            head = data[:65536]
            stream = io.BytesIO(data)
    kind = _sniff(head)
    if kind == 'zip':
        res.error = 'price file is a ZIP archive; ZIP files are not supported yet'
        return res
    if kind == 'html':
        res.error = 'URL returned an HTML page, not a machine-readable file'
        return res
    try:
        if kind == 'json':
            res.format = 'json'
            text = head.decode('utf-8', 'replace')
            for k, attr in (('hospital_name', 'hospitalNameInFile'), ('last_updated_on', 'lastUpdated'), ('version', 'version')):
                m = re.search(r'"%s"\s*:\s*"([^"]*)"' % k, text)
                if m:
                    setattr(res, attr, m.group(1).strip())
            if on_header:
                on_header(res)
            _scan_json(stream, collector, res)
        else:
            _scan_csv(stream, collector, res, on_header)
    except Exception as e:  # truncated / malformed file: keep what we have
        res.error = f'{type(e).__name__}: {e}'
    res.prices = collector.result()
    return res


def _scan_json(stream: IO[bytes], collector: Collector, res: ScanResult) -> None:
    n = 0
    for item in ijson.items(stream, 'standard_charge_information.item', use_float=True):
        n += 1
        codes = []
        for ci in item.get('code_information') or []:
            code = norm_code(ci.get('code'))
            ctype = str(ci.get('type')).upper() if ci.get('type') else None
            if code in collector.wanted and (ctype or '') not in EXCLUDED_CODE_TYPES:
                codes.append((code, ctype))
        if codes:
            desc = str(item['description']) if item.get('description') else None
            for sc in item.get('standard_charges') or []:
                negotiated = [d for d in (parse_money(p.get('standard_charge_dollar'))
                                          for p in sc.get('payers_information') or []) if d is not None]
                for code, ctype in codes:
                    collector.add(n, code, ctype, desc,
                                  str(sc['setting']).lower() if sc.get('setting') else None,
                                  parse_money(sc.get('gross_charge')), parse_money(sc.get('discounted_cash')),
                                  parse_money(sc.get('minimum')), parse_money(sc.get('maximum')), negotiated)
        if collector.all_found() and n - collector.last_new_match_at > GRACE_JSON_ITEMS:
            res.stopped_early = True
            break
    res.records = n


def _norm_header(h: str) -> str:
    return re.sub(r'\s+', '', str(h or '')).lower()


def _scan_csv(stream: IO[bytes], collector: Collector, res: ScanResult,
              on_header: Callable[[ScanResult], None] | None) -> None:
    buffered = stream if isinstance(stream, io.BufferedIOBase) else io.BufferedReader(stream)  # type: ignore[arg-type]
    text = io.TextIOWrapper(buffered, encoding='utf-8-sig', errors='replace', newline='')
    reader = csv.reader(text)
    pre: list[list[str]] = []
    header: list[str] | None = None
    for row in reader:
        if not row or not any(c.strip() for c in row):
            continue
        norm = [_norm_header(c) for c in row]
        if 'description' in norm and any(re.fullmatch(r'code\|\d+', h) for h in norm):
            header = norm
            break
        pre.append(row)
        if len(pre) > 10:
            raise ValueError('could not find the CSV column header row (not a CMS template file?)')
    if header is None:
        raise ValueError('could not find the CSV column header row (not a CMS template file?)')

    if len(pre) >= 2:
        keys = [_norm_header(k) for k in pre[0]]
        vals = pre[1]
        def get(k: str) -> str | None:
            if k in keys:
                i = keys.index(k)
                if i < len(vals) and vals[i].strip():
                    return vals[i].strip()
            return None
        res.hospitalNameInFile = get('hospital_name')
        res.lastUpdated = get('last_updated_on')
        res.version = get('version')

    def find(pattern: str) -> int:
        for i, h in enumerate(header):  # type: ignore[arg-type]
            if re.fullmatch(pattern, h):
                return i
        return -1

    code_cols = []
    for i, h in enumerate(header):
        m = re.fullmatch(r'code\|(\d+)', h)
        if m:
            t = f'code|{m.group(1)}|type'
            code_cols.append((i, header.index(t) if t in header else -1))
    neg_wide = [i for i, h in enumerate(header) if re.fullmatch(r'standard_charge\|.+\|.+\|negotiated_dollar', h)]
    i_desc = header.index('description')
    i_setting = header.index('setting') if 'setting' in header else -1
    i_gross = find(r'standard_charge\|gross')
    i_cash = find(r'standard_charge\|discounted_cash')
    i_min = find(r'standard_charge\|min')
    i_max = find(r'standard_charge\|max')
    i_neg = find(r'standard_charge\|negotiated_dollar')
    res.format = 'csv-wide' if neg_wide and i_neg < 0 else 'csv-tall'
    if on_header:
        on_header(res)

    def cell(row: list[str], i: int) -> str | None:
        return row[i] if 0 <= i < len(row) else None

    n = 0
    for row in reader:
        n += 1
        for ci, ti in code_cols:
            code = norm_code(cell(row, ci))
            if not code or code not in collector.wanted:
                continue
            ctype = (cell(row, ti) or '').strip().upper() or None
            if (ctype or '') in EXCLUDED_CODE_TYPES:
                continue
            negotiated = []
            for i in ([i_neg] if i_neg >= 0 else []) + neg_wide:
                v = parse_money(cell(row, i))
                if v is not None:
                    negotiated.append(v)
            setting = cell(row, i_setting)
            collector.add(n, code, ctype, cell(row, i_desc) or None,
                          setting.strip().lower() if setting else None,
                          parse_money(cell(row, i_gross)), parse_money(cell(row, i_cash)),
                          parse_money(cell(row, i_min)), parse_money(cell(row, i_max)), negotiated)
        if collector.all_found() and n - collector.last_new_match_at > GRACE_CSV_ROWS:
            res.stopped_early = True
            break
    res.records = n


def scan_url(client, url: str, codes: list[str], max_mb: float,
             on_header: Callable[[ScanResult], None] | None = None) -> dict:
    """Download (streaming) and scan an MRF. Returns the `mrf` block for the dataset item."""
    from .http import ByteStream

    t0 = time.time()
    warnings: list[str] = []
    res = ScanResult()
    bs: ByteStream | None = None
    status = None
    try:
        with client.stream('GET', url, timeout=httpx.Timeout(120.0, connect=20.0)) as r:
            status = r.status_code
            if r.status_code >= 400:
                res.error = f'HTTP {r.status_code}'
            else:
                # iter_bytes() undoes Content-Encoding; a .gz *file* is detected by ByteStream's magic-byte sniffing.
                bs = ByteStream(r.iter_bytes(), int(max_mb * 1024 * 1024))
                head = bs.peek_bytes()
                res = scan_stream(bs, codes, head=head, on_header=on_header)
    except Exception as e:
        res.error = f'{type(e).__name__}: {e}'
    capped = bool(bs and bs.capped)
    complete = res.error is None and not res.stopped_early and not capped
    if res.error and not (capped and 'parse' in res.error.lower()):
        warnings.append(f'Price file could not be fully read: {res.error}')
    if capped:
        warnings.append(f'Stopped reading the price file at the {max_mb:g} MB limit (maxMrfMB); '
                        'codes not found so far may appear later in the file.')
    prices = res.prices or {norm_code(c): None for c in codes}
    for code, p in prices.items():
        if p is None:
            warnings.append(f'Code {code} was not found in the price file'
                            + ('' if complete else ' (the file was only partly read)') + '.')
    return {
        'url': url,
        'lastUpdated': res.lastUpdated,
        'format': res.format,
        'schemaVersion': res.version,
        'hospitalNameInFile': res.hospitalNameInFile,
        'prices': prices,
        'scan': {
            'bytesRead': bs.bytes_read if bs else 0,
            'recordsScanned': res.records,
            'complete': complete,
            'stoppedBecause': 'all-codes-found' if res.stopped_early else 'size-limit' if capped
            else 'error' if res.error else 'end-of-file',
            'seconds': round(time.time() - t0, 1),
            'httpStatus': status,
        },
        '_warnings': warnings,
    }

