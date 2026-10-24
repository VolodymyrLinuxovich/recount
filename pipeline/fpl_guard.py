"""Guard for free-care cutoffs: a number is kept only if the quote ties it to FREE care.

Policies often state their tiers in one table-like sentence:
  "200% or less of the FPL  Zero (Full Charity)  201%-300%  50% of the AGB (Discount) ... 351%-400% ..."
Taking the largest percentage there gives 400% "free care", which is wrong and would tell a patient
at 300% they owe nothing. So we read the tiers: each poverty-level bound (100%+) owns the text up to
the next bound, plus a few characters before it ("100% FREE care (income 0-200%"). The free-care
cutoff is the highest bound whose own tier text says free / full charity / no charge / a 100% write-off.
"""

from __future__ import annotations

import re

FREE = re.compile(
    r"full\s+charity|zero\s*\(full|free\s+care|\bfree\b|no\s+charge|pay\s+nothing|100\s*%\s*(?:discount|write[- ]?off|free|charity|of\s+(?:the\s+)?(?:charges|balance|bill))|full\s+write[- ]?off",
    re.I,
)
PCT = re.compile(r"(?<![\d.])(\d{2,3})(?:\.\d+)?\s*%")
# Percentages that size a discount or a payment, not an income bound.
MAGNITUDE_AFTER = re.compile(r"^\s*(?:discount|write|of\s+(?:the\s+)?(?:AGB|charges|remaining|gross|amount|bill|balance)|off\b|free|reduction|of\s+medicare)", re.I)


def income_bounds(text: str) -> list[tuple[int, int, int]]:
    """(value, start, end) for each percentage that looks like an income bound (>= 100% of FPL)."""
    out = []
    for m in PCT.finditer(text):
        v = int(m.group(1))
        if v < 100 or v > 1000:
            continue
        if MAGNITUDE_AFTER.match(text[m.end(): m.end() + 30]):
            continue
        out.append((v, m.start(), m.end()))
    return out


def free_cutoff(quote: str | None) -> int | None:
    """Highest income bound whose tier is labelled free care, or None."""
    if not quote:
        return None
    text = re.sub(r"\s+", " ", quote)
    bounds = income_bounds(text)
    best = None
    for i, (v, start, end) in enumerate(bounds):
        nxt = bounds[i + 1][1] if i + 1 < len(bounds) else len(text)
        after = text[end: min(nxt, end + 90)]
        before = text[max(0, start - 28): start]
        # A range's lower end ("201% - 300%") belongs to the next tier, not this one.
        if re.match(r"^\s*(?:-|–|to)\s*\d", text[end: end + 8]):
            continue
        if FREE.search(after) or (FREE.search(before) and re.search(r"(?:income|up\s+to|0\s*[-–]|below|less\s+than|<)\s*$", before, re.I)):
            best = max(best or 0, v)
    return best


def checked_free(value: float | None, quote: str | None) -> float | None:
    """Keep a free-care cutoff only if its own quote shows that exact free tier."""
    if value is None:
        return None
    tier = free_cutoff(quote)
    if tier is None:
        return None
    return float(tier)
