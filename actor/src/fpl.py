"""Extract Federal Poverty Level (FPL) thresholds from a financial assistance /
charity care policy text, with the exact sentences used as evidence.

This is deliberately conservative: a threshold is only reported when a
sentence ties a percentage to the FPL, and every reported number comes with
the sentence it was read from. History sections ("in 2019 the limit was
increased to 500%") and restatements of the law ("hospitals are required by
law to ... 400%") are recognised and not used as the hospital's own limit.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

PCT_RE = re.compile(r'(?<![\d.])(\d{2,3}(?:\.\d+)?)\s*(?:%|percent\b|per cent\b)', re.I)
FPL_RE = re.compile(r'\bFPL\b|\bFPG\b|poverty', re.I)
FPL_AFTER_RE = re.compile(
    r'^\s*(?:%|percent|per cent)?\s*(?:\)|,)?\s*(?:or\s+(?:less|below|lower)\s+)?(?:of\s+)?(?:the\s+)?'
    r'(?:current\s+|applicable\s+|annual\s+|federal\s+|U\.?S\.?\s+)*'
    r'(?:\(?FPL\)?|\(?FPG\)?|poverty)', re.I)
FPL_BEFORE_RE = re.compile(r'(?:FPL|FPG|poverty\s+(?:level|guidelines?|line))\W{0,3}(?:\w+\W+){0,4}$', re.I)

FREE_RE = re.compile(
    r'charity\s+care|free\s+care|full\s+charity|free\s+of\s+charge|at\s+no\s+cost|no\s+charge|'
    r'100\s*(?:%|percent)\s+(?:discount|write|charity|financial|reduction|of\s+(?:the\s+)?(?:patient|charges|balance|bill))|'
    r'full\s+(?:write|discount|financial\s+assistance)|free\b', re.I)
DISC_RE = re.compile(
    r'discount(?:ed)?\s+payment|discount(?:ed)?\s+care|partial|sliding|reduced|discount', re.I)
NO_CAP_RE = re.compile(
    r'no\s+(?:FPL|income|upper|maximum)\s+(?:limit|cap|ceiling|threshold)|'
    r'regardless\s+of\s+(?:their\s+)?(?:income|FPL)|all\s+FPL\s+levels|without\s+regard\s+to\s+income', re.I)
HISTORY_LEGAL_RE = re.compile(
    r'\bhistory\b|was\s+(?:increased|changed|amended|raised|revised|previously)|previously|'
    r'resolution\s+no|health\s+(?:and|&)\s+safety\s+code|section\s+127\d{3}|required\s+by\s+law|'
    r'\bAB\s?1020\b|\bAB\s?774\b|\bAB\s?532\b|\bSB\s?1276\b|shall\s+not\s+be\s+construed|'
    r'effective\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d',
    re.I)
UPPER_WORDS_RE = re.compile(
    r'at\s+or\s+below|up\s+to|not\s+(?:to\s+)?exceed|does\s+not\s+exceed|less\s+than|or\s+less|or\s+below|'
    r'below|under|between|through|to|equal\s+to|within|≤|<=|<', re.I)
LOWER_BEFORE_RE = re.compile(
    r'(?:(?<!not )(?<!not to )\bexceed(?:s|ing)?|above|greater\s+than|more\s+than|over|at\s+or\s+above|'
    r'higher\s+than|from|>=|≥|>)\s*(?:the\s+)?$', re.I)
ELIG_RE = re.compile(r'eligib|qualif|income|household|family\s+size', re.I)

SENT_SPLIT_RE = re.compile(r'(?<=[.;:!?])\s+(?=[A-Z0-9(•\-])|\s+(?=(?:[A-Z]|\d{1,2}|[ivx]{1,4})\.\s+[A-Z])|\s*[•▪●]\s*')


@dataclass
class Candidate:
    kind: str  # 'freeCare' | 'discount'
    value: float  # upper bound, % of FPL
    score: float
    sentence: str
    start: int
    excluded: bool


def _sentences(text: str) -> list[tuple[int, str]]:
    out = []
    pos = 0
    for m in SENT_SPLIT_RE.finditer(text):
        s = text[pos:m.start()].strip()
        if s:
            out.append((pos, s))
        pos = m.end()
    tail = text[pos:].strip()
    if tail:
        out.append((pos, tail))
    return out


def _fpl_percents(sentence: str) -> list[tuple[float, str]]:
    """Percentages in the sentence that refer to the FPL, each tagged 'upper' or 'lower'."""
    found: list[tuple[float, str, int]] = []
    for m in PCT_RE.finditer(sentence):
        after = sentence[m.end():m.end() + 60]
        before = sentence[max(0, m.start() - 60):m.start()]
        val = float(m.group(1))
        # Range "201% - 400% FPL" / "201% to 400% of FPL": the first number borrows the FPL tag of the second.
        range_next = re.match(r'^\s*(?:%|percent)?\s*(?:-|–|to|and|through)\s*(\d{2,3}(?:\.\d+)?)\s*(?:%|percent)', after, re.I)
        is_fpl = bool(FPL_AFTER_RE.match(after)) or bool(FPL_BEFORE_RE.search(before))
        if not is_fpl and range_next:
            rest = after[range_next.end():]
            is_fpl = bool(FPL_AFTER_RE.match(rest))
        if not is_fpl:
            continue
        if not 50 <= val <= 1000:
            continue
        bound = 'lower' if LOWER_BEFORE_RE.search(before) and not re.search(r'not\s+(?:to\s+)?exceed\s*$', before, re.I) else 'upper'
        if range_next:
            bound = 'lower'  # first number of a range is its lower end
        found.append((val, bound, m.start()))
    return [(v, b) for v, b, _ in found]


def _kind_for(text: str, start: int, sentence: str) -> str | None:
    """Program the sentence is about: from the sentence itself, else the nearest heading/keyword before it."""
    f = [m.start() for m in FREE_RE.finditer(sentence)]
    d = [m.start() for m in DISC_RE.finditer(sentence)]
    if f and not d:
        return 'freeCare'
    if d and not f:
        return 'discount'
    if f and d:
        # e.g. "Charity Care and Discount Payment programs ... 350%": ambiguous unless the sentence
        # says 100% / free explicitly.
        if re.search(r'free|100\s*(?:%|percent)|full', sentence, re.I):
            return 'freeCare'
        return None
    ctx = text[max(0, start - 600):start]
    lf = max((m.end() for m in FREE_RE.finditer(ctx)), default=-1)
    ld = max((m.end() for m in DISC_RE.finditer(ctx)), default=-1)
    if lf < 0 and ld < 0:
        return None
    return 'freeCare' if lf > ld else 'discount'


def extract_thresholds(text: str) -> dict:
    """Returns {freeCareMaxFplPct, discountMaxFplPct, discountHasNoFplCap, quotes, candidates}."""
    text = re.sub(r'\s+', ' ', text or '')
    cands: list[Candidate] = []
    no_cap_quote: str | None = None
    for start, sent in _sentences(text):
        if len(sent) > 1200:
            continue
        excluded = bool(HISTORY_LEGAL_RE.search(sent))
        if NO_CAP_RE.search(sent) and not excluded and no_cap_quote is None:
            k = _kind_for(text, start, sent)
            if k in ('discount', None):
                no_cap_quote = sent
        if not FPL_RE.search(sent):
            continue
        pcts = _fpl_percents(sent)
        if not pcts:
            continue
        kind = _kind_for(text, start, sent)
        if kind is None:
            continue
        uppers = [v for v, b in pcts if b == 'upper']
        if not uppers:
            continue
        # For free care the cap is the highest upper bound in the sentence (e.g. "0% to 200%");
        # same for discount ranges ("201% to 400%").
        value = max(uppers)
        score = 0.0
        if ELIG_RE.search(sent):
            score += 2
        if UPPER_WORDS_RE.search(sent):
            score += 1
        if excluded:
            score -= 10
        if re.search(r'expected\s+payment|medicare', sent, re.I):
            score -= 1  # payment-cap wording; eligibility wording is a better source
        cands.append(Candidate(kind, value, score, sent, start, excluded))

    def best(kind: str) -> Candidate | None:
        pool = [c for c in cands if c.kind == kind and not c.excluded]
        if not pool:
            return None
        return sorted(pool, key=lambda c: (-c.score, c.start))[0]

    free = best('freeCare')
    disc = best('discount')
    if disc and free and disc.value < free.value:
        # A "discount" number at or below the free-care cap is almost always a mis-attributed line.
        higher = [c for c in cands if c.kind == 'discount' and not c.excluded and c.value >= free.value]
        disc = sorted(higher, key=lambda c: (-c.score, c.start))[0] if higher else None
    no_cap = bool(no_cap_quote)
    other_disc = None
    if no_cap and disc:
        # The policy explicitly says discount eligibility has no FPL ceiling; a numeric figure
        # elsewhere is then usually the expected-payment limit, which we still show as evidence.
        other_disc, disc = disc, None
    quotes = []
    if free:
        quotes.append({'kind': 'freeCare', 'fplPct': free.value, 'text': free.sentence})
    if disc:
        quotes.append({'kind': 'discount', 'fplPct': disc.value, 'text': disc.sentence})
    if no_cap:
        quotes.append({'kind': 'discountNoCap', 'fplPct': None, 'text': no_cap_quote})
    if other_disc:
        quotes.append({'kind': 'discountOther', 'fplPct': other_disc.value, 'text': other_disc.sentence})
    return {
        'freeCareMaxFplPct': free.value if free else None,
        'discountMaxFplPct': disc.value if disc else None,
        'discountHasNoFplCap': no_cap,
        'quotes': quotes,
        'candidates': [
            {'kind': c.kind, 'fplPct': c.value, 'ignored': c.excluded, 'text': c.sentence[:400]}
            for c in cands
        ][:12],
    }


PHONE_RE = re.compile(r'(?<!\d)(?:\+?1[\s.-]?)?(?:\((\d{3})\)\s*|(\d{3})[\s.-])(\d{3})[\s.-](\d{4})(?!\d)')
PHONE_CTX_STRONG = re.compile(r'financial\s+(?:assistance|counsel)|charity|patient\s+financial|eligibility|financial\s+aid', re.I)
PHONE_CTX_WEAK = re.compile(r'billing|customer\s+service|patient\s+account|questions?|call', re.I)


def find_phones(text: str) -> list[tuple[int, str, str]]:
    """(score, phone, context) for phone numbers near billing / assistance wording. Fax numbers skipped."""
    text = re.sub(r'\s+', ' ', text or '')
    out = []
    prev_end = 0
    for i, m in enumerate(PHONE_RE.finditer(text)):
        # Context is the text since the previous phone number (max 110 chars), so a heading
        # like "Patient Financial Assistance" is not credited to every number listed under it.
        before = text[max(prev_end, m.start() - 110):m.start()]
        prev_end = m.end()
        if re.search(r'fax\W{0,12}$', before, re.I) or re.search(r'TTY|TDD', before[-20:], re.I):
            continue
        area = m.group(1) or m.group(2)
        phone = f'({area}) {m.group(3)}-{m.group(4)}'
        score = 0
        if PHONE_CTX_STRONG.search(before):
            score += 3
        if PHONE_CTX_WEAK.search(before):
            score += 1
        if re.search(r'medi-?cal|member\s+services|consumer|alliance|ombuds|department\s+of|county|social\s+security', before, re.I):
            score -= 2
        if score > 0:
            out.append((score, i, phone, (before[-100:] + m.group(0)).strip()))
    out.sort(key=lambda t: (-t[0], t[1]))
    return [(sc, ph, ctx) for sc, _, ph, ctx in out]
