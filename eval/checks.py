"""Python mirror of convex/lib/checks.ts (checkBill).

Used to (1) confirm every planted error in the answer key is something the rules can
catch, and (2) give a baseline "perfect reading" score. Keep it in sync with checks.ts:
same thresholds, same line indexes, same finding kinds. Titles and evidence are left out.
"""

from __future__ import annotations

from prices import _norm


def r2(x: float) -> float:
    return round(x * 100) / 100


def check_bill(bill: dict, ref: dict | None) -> list[dict]:
    out: list[dict] = []
    lines = bill.get("lines") or []

    if not bill.get("isItemized") or not lines:
        out.append({"id": "not-itemized", "kind": "NOT_ITEMIZED", "lines": [], "amount": 0})

    seen: dict[str, int] = {}
    for i, l in enumerate(lines):
        code = _norm(l.get("code"))
        if not code:
            continue
        key = f"{code}|{l.get('date') or ''}|{l['charge']:.2f}"
        if key not in seen:
            seen[key] = i
            continue
        out.append({"id": f"dup-{i}", "kind": "DUPLICATE_LINE", "lines": [seen[key], i], "amount": l["charge"]})

    mrf = (ref or {}).get("mrf")
    if mrf:
        for i, l in enumerate(lines):
            code = _norm(l.get("code"))
            row = mrf["prices"].get(code) if code else None
            if not row:
                continue
            qty = l["quantity"] if l.get("quantity", 0) > 0 else 1
            per_unit = l["charge"] / qty
            gross = row.get("grossCharge")
            if gross is not None and per_unit > gross + 0.5:
                out.append({"id": f"list-{i}", "kind": "ABOVE_LIST_PRICE", "lines": [i],
                            "amount": r2((per_unit - gross) * qty)})
            cash = row.get("discountedCash")
            if not bill.get("insurancePayer") and cash is not None and per_unit > cash + 0.5:
                out.append({"id": f"cash-{i}", "kind": "CASH_PRICE_GAP", "lines": [i],
                            "amount": r2((per_unit - max(cash, 0)) * qty)})

    if bill.get("totalCharges") is not None and lines:
        s = r2(sum(l["charge"] for l in lines))
        if abs(s - bill["totalCharges"]) > 1:
            out.append({"id": "total", "kind": "TOTAL_MISMATCH", "lines": [],
                        "amount": max(0, r2(bill["totalCharges"] - s))})
    return out
