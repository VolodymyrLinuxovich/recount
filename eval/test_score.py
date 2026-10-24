"""Checks for the scorer and the checks mirror. Run: python -I test_score.py"""

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parent))

import copy

from checks import check_bill
from score import score_bill


def line(code, charge, date="2026-09-12"):
    return {"date": date, "code": code, "revCode": None, "description": code, "quantity": 1, "charge": charge}


BILL = {
    "insurancePayer": None, "isItemized": True, "totalCharges": 1068.0, "amountDue": 1068.0,
    "lines": [line("99283", 500.0), line("85025", 269.0), line("85025", 269.0), line("36415", 30.0)],
}
TRUTH = {"id": "t", "variant": "clean", "bill": BILL, "errors": [{"kind": "DUPLICATE_LINE", "lines": [1, 2]}]}
REF = {"mrf": {"url": "x", "prices": {"85025": {"grossCharge": 269.0, "discountedCash": 100.0},
                                       "99283": {"grossCharge": 450.0, "discountedCash": None}}}}


def test_checks_mirror():
    kinds = sorted(f["kind"] for f in check_bill(BILL, REF))
    # 99283 billed 500 > 450 published; 85025 twice; cash gap on both 85025 lines.
    assert kinds == ["ABOVE_LIST_PRICE", "CASH_PRICE_GAP", "CASH_PRICE_GAP", "DUPLICATE_LINE"], kinds


def test_perfect():
    r = score_bill(TRUTH, BILL, [{"kind": "DUPLICATE_LINE", "lines": [1, 2]}, {"kind": "CASH_PRICE_GAP", "lines": [1]}])
    assert r["caught"] == ["DUPLICATE_LINE"] and not r["missed"] and not r["falseAlarms"]
    assert r["reading"]["matched"] == 4 and r["reading"]["total"]


def test_reader_dropped_a_line_shifts_indexes():
    pred = copy.deepcopy(BILL)
    del pred["lines"][0]  # reader skipped the ER visit: duplicate is now at pred lines 0 and 1
    r = score_bill(TRUTH, pred, [{"kind": "DUPLICATE_LINE", "lines": [0, 1]}])
    assert r["caught"] == ["DUPLICATE_LINE"], r
    assert r["reading"]["matched"] == 3


def test_missed_and_false_alarm():
    r = score_bill(TRUTH, BILL, [{"kind": "TOTAL_MISMATCH", "lines": []}])
    assert r["missed"] == ["DUPLICATE_LINE"] and r["falseAlarms"] == ["TOTAL_MISMATCH"]


def test_misread_charge():
    pred = copy.deepcopy(BILL)
    pred["lines"][3]["charge"] = 80.0
    pred["totalCharges"] = 1118.0
    r = score_bill(TRUTH, pred, [])
    assert r["reading"]["matched"] == 3 and not r["reading"]["total"]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
