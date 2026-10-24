"""Python mirror of checkEob in convex/lib/eobChecks.ts (rules 1-7 in docs/EOB.md).

Used to (1) confirm every planted problem in the answer key is something the rules catch,
and (2) score findings from a predicted EOB. Keep it in sync with docs/EOB.md and eobChecks.ts:
same order, same stops, same amounts. Titles, text and evidence are left out.

A finding here is {"kind", "lines", "amount"}. `lines` index bill.lines.
"""

from __future__ import annotations

import re
from datetime import date, timedelta

STOP_WORDS = {"hospital", "medical", "center", "health", "the"}
EOB_KINDS = ["EOB_MISMATCH", "CLAIM_PENDING", "SURPRISE_BILL", "OWES_MORE_THAN_EOB",
             "INSURANCE_NOT_APPLIED", "NOT_ON_EOB", "DENIED_BY_PLAN"]


def cents(x: float) -> int:
    return round(float(x) * 100)


def r2(x: float) -> float:
    return cents(x) / 100


def more(a: float, b: float) -> bool:
    """"More than" in docs/EOB.md: more by at least $1.00, compared in cents."""
    return cents(a) - cents(b) >= 100


def norm_code(code: str | None) -> str | None:
    """normalizeCode in convex/lib/hospital.ts."""
    if not code:
        return None
    c = re.sub(r"[^A-Z0-9]", "", code.strip().upper())
    return c if len(c) >= 4 else None


def due_of(bill: dict) -> float | None:
    if bill.get("amountDue") is not None:
        return float(bill["amountDue"])
    if bill.get("totalCharges") is None:
        return None
    return (float(bill["totalCharges"]) - float(bill.get("insurancePaid") or 0)
            - float(bill.get("adjustments") or 0) - float(bill.get("patientPaid") or 0))


def eob_owes(eob: dict) -> float | None:
    if eob.get("totalPatientOwes") is not None:
        return float(eob["totalPatientOwes"])
    vals = [l["patientOwes"] for l in eob.get("lines") or [] if l.get("patientOwes") is not None]
    return float(sum(vals)) if vals else None


def name_words(s: str | None) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", (s or "").lower()) if len(w) >= 4 and w not in STOP_WORDS}


def _d(s: str | None) -> date | None:
    try:
        return date.fromisoformat(s) if s else None
    except ValueError:
        return None


def is_mismatch(bill: dict, eob: dict) -> bool:
    bill_dates = [d for d in [_d(bill.get("serviceDate"))] + [_d(l.get("date")) for l in bill.get("lines") or []] if d]
    e_from, e_to = _d(eob.get("serviceDateFrom")), _d(eob.get("serviceDateTo"))
    e_from, e_to = e_from or e_to, e_to or e_from
    if bill_dates and e_from:
        slack = timedelta(days=3)
        if e_from > max(bill_dates) + slack or e_to < min(bill_dates) - slack:
            return True
    if eob.get("providerName") and bill.get("hospitalName"):
        if not name_words(eob["providerName"]) & name_words(bill["hospitalName"]):
            return True
    return False


def er_visit(bill: dict, eob: dict) -> bool:
    if eob.get("emergency") is True:
        return True
    for l in bill.get("lines") or []:
        rc = re.sub(r"\D", "", l.get("revCode") or "")
        if rc and 450 <= int(rc) <= 459:
            return True
        c = norm_code(l.get("code"))
        if c and c.isdigit() and 99281 <= int(c) <= 99285:
            return True
        if "emergency" in (l.get("description") or "").lower():
            return True
    return False


def check_eob(bill: dict, eob: dict) -> list[dict]:
    out: list[dict] = []
    lines = bill.get("lines") or []

    # 1. Wrong statement: stop.
    if is_mismatch(bill, eob):
        return [{"kind": "EOB_MISMATCH", "lines": [], "amount": 0}]
    # 2. Still processing: stop.
    if eob.get("claimStatus") == "pending":
        return [{"kind": "CLAIM_PENDING", "lines": [], "amount": 0}]

    due = due_of(bill)
    owes = eob_owes(eob)
    still = max(0.0, owes - float(bill.get("patientPaid") or 0)) if owes is not None else None
    over = due is not None and still is not None and more(due, still)

    # 3 / 4. The bill asks for more than the EOB says.
    money_finding = False
    if over and eob.get("network") == "out" and er_visit(bill, eob):
        out.append({"kind": "SURPRISE_BILL", "lines": [], "amount": r2(due - still)})
        money_finding = True
    elif over:
        out.append({"kind": "OWES_MORE_THAN_EOB", "lines": [], "amount": r2(due - still)})
        money_finding = True

    # 5. Plan paid, bill shows no insurance payment (folded into 3/4 when they fired).
    paid = eob.get("totalPlanPaid")
    if not money_finding and paid is not None and paid > 0 and float(bill.get("insurancePaid") or 0) == 0:
        amt = min(float(paid), due) if due is not None else float(paid)
        out.append({"kind": "INSURANCE_NOT_APPLIED", "lines": [], "amount": r2(max(0.0, amt))})

    # 6. Bill lines the EOB doesn't list.
    eob_codes = {norm_code(l.get("code")) for l in eob.get("lines") or []} - {None}
    if eob_codes:
        for i, l in enumerate(lines):
            c = norm_code(l.get("code"))
            if not c:
                continue
            if c in eob_codes or norm_code(l.get("revCode")) in eob_codes:
                continue
            out.append({"kind": "NOT_ON_EOB", "lines": [i], "amount": 0})

    # 7. Denied or not covered.
    denied = [l for l in eob.get("lines") or [] if (l.get("notCovered") or 0) > 0]
    status = eob.get("claimStatus")
    if denied or status in ("denied", "partly_denied"):
        amt = sum(float(l["notCovered"]) for l in denied)
        if status == "denied" and not denied:
            amt = float(eob.get("totalPatientOwes") or 0)
        codes = {norm_code(l.get("code")) for l in denied} - {None}
        idx = [i for i, l in enumerate(lines)
               if norm_code(l.get("code")) in codes or norm_code(l.get("revCode")) in codes]
        out.append({"kind": "DENIED_BY_PLAN", "lines": idx, "amount": r2(amt)})
    return out
