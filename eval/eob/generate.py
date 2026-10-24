"""Generate synthetic bill + EOB pairs with planted problems and an answer key.

  python -I generate.py            # 30 pairs into out/ and fixtures/
  python -I generate.py -n 60 --seed 7

The bills come from the bill eval's generator (../generate.py): an ER visit at a San Francisco
hospital, each line priced at that hospital's published gross charge. Each bill gets an EOB
from a fictional California plan (HMO, PPO, EPO or Medi-Cal) whose allowed amounts, deductible,
copay and coinsurance add up line by line: allowed = plan paid + you may owe on every line.
Then one problem from docs/EOB.md rules 1-7 is planted, or none for a clean pair.

Writes, per pair:
  out/<id>.bill.json    ParsedBill (convex/lib/bill.ts)
  out/<id>.eob.json     the true ParsedEob (convex/lib/eob.ts)
  out/<id>.truth.json   {id, kind, plan, ..., bill, eob, shares, expect, findings}
  fixtures/<id>.json    {bill, eob, expect} for tests/eob.fixtures.test.ts
`expect` is [{kind, amount}] in rule order. The generator stops with an error if eobchecks.py
(the mirror of the rules) doesn't find exactly the planted problems. Images: render.py.
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_HERE = _Path(__file__).resolve().parent
# -I leaves the script dir off sys.path. The bill eval (prices, checks, generate) comes first.
_sys.path[:0] = [str(_HERE.parent), str(_HERE)]

import argparse
import importlib.util
import json
import random
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import prices
from eobchecks import check_eob, eob_owes, r2

HERE = _HERE
OUT = HERE / "out"
FIXTURES = HERE / "fixtures"


def _bill_generator():
    """The bill eval's generate.py, loaded under its own name (this file is also generate.py)."""
    spec = importlib.util.spec_from_file_location("bill_generate", HERE.parent / "generate.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bg = _bill_generator()

# Fictional California plans. None of these names belong to a real insurer.
PLANS = [
    {"key": "gbh-hmo", "payer": "Golden Bear Health Plan", "planType": "HMO", "deductible": 0, "erCopay": 250, "coins": 0.0,
     "ratio": (0.26, 0.36), "prefix": "GBH", "phone": "1-800-555-0142",
     "appeal": "Golden Bear Health Plan, Appeals and Grievances, P.O. Box 4410, Oakland, CA 94623"},
    {"key": "gbh-ppo", "payer": "Golden Bear Health Plan", "planType": "PPO", "deductible": 1500, "erCopay": 0, "coins": 0.20,
     "ratio": (0.32, 0.44), "prefix": "GBP", "phone": "1-800-555-0142",
     "appeal": "Golden Bear Health Plan, Appeals and Grievances, P.O. Box 4410, Oakland, CA 94623"},
    {"key": "fog-ppo", "payer": "Fogline Health", "planType": "PPO", "deductible": 2500, "erCopay": 150, "coins": 0.20,
     "ratio": (0.30, 0.42), "prefix": "FGL", "phone": "1-888-555-0187",
     "appeal": "Fogline Health Member Appeals, 2200 Harbor Point Drive, Suite 400, San Jose, CA 95134"},
    {"key": "fog-epo", "payer": "Fogline Health", "planType": "EPO", "deductible": 1000, "erCopay": 300, "coins": 0.10,
     "ratio": (0.30, 0.40), "prefix": "FGE", "phone": "1-888-555-0187",
     "appeal": "Fogline Health Member Appeals, 2200 Harbor Point Drive, Suite 400, San Jose, CA 95134"},
    {"key": "rla-ppo", "payer": "Redwood Lantern Assurance", "planType": "PPO", "deductible": 5000, "erCopay": 0, "coins": 0.30,
     "ratio": (0.34, 0.46), "prefix": "RLA", "phone": "1-866-555-0119",
     "appeal": "Redwood Lantern Assurance, Attn: Appeals Unit, P.O. Box 77120, Sacramento, CA 95887"},
    {"key": "slh-hmo", "payer": "Sierra Larkspur Health Plan", "planType": "HMO", "deductible": 0, "erCopay": 150, "coins": 0.0,
     "ratio": (0.24, 0.34), "prefix": "SLH", "phone": "1-877-555-0163",
     "appeal": "Sierra Larkspur Health Plan, Grievance and Appeals Department, 815 K Street, Sacramento, CA 95814"},
    {"key": "pcp-medi", "payer": "Poppyfield Community Health Plan", "planType": "Medi-Cal", "deductible": 0, "erCopay": 0, "coins": 0.0,
     "ratio": (0.12, 0.20), "prefix": "PCH", "phone": "1-855-555-0176",
     "appeal": "Poppyfield Community Health Plan, Member Services Appeals, 1450 Mission Street, San Francisco, CA 94103"},
]
PLAN = {p["key"]: p for p in PLANS}
COMMERCIAL = [p["key"] for p in PLANS if p["planType"] != "Medi-Cal"]
WITH_SHARE = [p["key"] for p in PLANS if p["deductible"] or p["coins"]]  # patient owes more than a copay

# How the EOB names each hospital: shorter, upper case, like a claims system prints it.
EOB_PROVIDER = {
    "zsfg": ["ZUCKERBERG SF GENERAL HOSP", "ZUCKERBERG SAN FRANCISCO GENERAL HOSPITAL"],
    "ucsf": ["UCSF MEDICAL CENTER", "UCSF HELEN DILLER MEDICAL CTR"],
    "cpmc": ["CPMC VAN NESS CAMPUS", "CALIFORNIA PACIFIC MED CTR CPMC"],
    "stfrancis": ["SAINT FRANCIS MEMORIAL HOSPITAL", "SAINT FRANCIS MEMORIAL HOSP"],
}
# A claim from someone else on the same day: the ER doctors bill on their own.
OTHER_PROVIDERS = ["BAY EMERGENCY PHYSICIANS MED GROUP", "GOLDEN GATE RADIOLOGY ASSOCIATES", "MISSION BAY IMAGING GROUP"]

# EOBs print broad service categories, not the hospital's charge description.
CATEGORY = {
    "99283": "Emergency room visit", "99284": "Emergency room visit", "99285": "Emergency room visit",
    "96374": "IV push, first drug", "96375": "IV push, added drug", "96360": "IV hydration",
    "71046": "X-ray", "70450": "CT scan", "74177": "CT scan", "80053": "Lab", "85025": "Lab",
    "81001": "Lab", "36415": "Blood draw", "93005": "EKG", "12002": "Wound repair",
    "J2405": "Drugs", "J7050": "IV solution", "J7030": "IV solution", "J1885": "Drugs",
}

CO45 = "CO-45 Charge exceeds the contracted or allowed amount"
NSA = "N830 Paid at in-network cost sharing under the No Surprises Act"
LINE_DENIALS = ["PR-204 This service is not covered under your benefit plan",
                "PR-96 Non-covered charge", "PR-50 Not deemed medically necessary by the plan"]
CLAIM_DENIAL = "PR-27 Expenses incurred after coverage ended"

# Mix of pair kinds for 30 pairs; other sizes scale these shares.
MIX = [
    ("clean", 6), ("mismatch_date", 2), ("mismatch_provider", 1), ("pending", 2),
    ("surprise", 3), ("owes_more", 3), ("owes_more_unknown", 1), ("not_posted", 1),
    ("not_applied", 2), ("not_on_eob", 2), ("not_on_eob_billed", 1),
    ("denied_line", 2), ("denied_claim", 2), ("sample_like", 2),
]


def plan_kinds(n: int, rng: random.Random) -> list[str]:
    total = sum(c for _, c in MIX)
    kinds = []
    for k, c in MIX:
        m = round(n * c / total)
        kinds += [k] * (max(1, m) if n >= len(MIX) else m)  # every kind at least once when n allows
    while len(kinds) < n:
        kinds.append("clean")
    rng.shuffle(kinds)
    return kinds[:n]


def jitter(rng: random.Random, lo: float, hi: float) -> float:
    return rng.uniform(lo, hi)


def bill_for(rng: random.Random, key: str, mrf: dict | None) -> dict:
    bill, _scenario = bg.base_bill(rng, key, mrf, list(bg.SCENARIOS))
    bill, srcs = bg.strip(bill)
    h = prices.HOSPITALS[key]
    for l in bill["lines"]:
        l["chargePrinted"] = f"{l['charge']:,.2f}"
    # Field order of ParsedBill in convex/lib/bill.ts.
    out = {"isMedicalBill": True, "hospitalName": bill["hospitalName"], "hospitalWebsite": bill["hospitalWebsite"],
           "hospitalAddress": h["address"], "billingPhone": bill["billingPhone"], "accountNumber": bill["accountNumber"],
           "patientName": bill["patientName"], "patientAddress": None, "statementDate": bill["statementDate"],
           "serviceDate": bill["serviceDate"], "insurancePayer": None, "insurancePaid": 0, "adjustments": 0,
           "patientPaid": 0, "totalCharges": bill["totalCharges"], "amountDue": None, "isItemized": True,
           "lines": bill["lines"], "unreadable": []}
    out["_sources"] = srcs
    out["_scenario"] = _scenario
    return out


def adjudicate(rng: random.Random, plan: dict, lines: list[dict], network: str, denied: set[int]) -> tuple[list[dict], list[dict]]:
    """Price each bill line the way a plan does. Returns (EobLine list, per-line cost-share split).

    allowed = plan paid + deductible + copay + coinsurance + not covered, on every line.
    Out-of-network emergency care uses in-network cost sharing on the plan's allowed amount (No Surprises Act).
    """
    ratio = rng.uniform(*plan["ratio"])
    ded_left = r2(plan["deductible"] * rng.choice([1.0, 1.0, 0.6, 0.25, 0.0]))
    copay_left = float(plan["erCopay"])
    out, shares = [], []
    for i, l in enumerate(lines):
        billed = l["charge"]
        allowed = r2(billed * ratio * jitter(rng, 0.94, 1.06))
        ded = cop = coins = nc = 0.0
        remark = None
        if i in denied:
            nc = allowed
            remark = rng.choice(LINE_DENIALS)
        else:
            ded = min(ded_left, allowed)
            ded_left = r2(ded_left - ded)
            rest = r2(allowed - ded)
            if copay_left and (l.get("code") or "").startswith("9928"):
                cop = min(copay_left, rest)
                copay_left = r2(copay_left - cop)
                rest = r2(rest - cop)
            coins = r2(rest * plan["coins"])
            if network == "out":
                remark = NSA
        owes = r2(ded + cop + coins + nc)
        paid = r2(allowed - owes)
        if remark is None and plan.get("_co45"):
            remark = CO45
        out.append({"date": l["date"], "code": l["code"], "description": CATEGORY.get(l["code"], l["description"].title()),
                    "billed": billed, "allowed": allowed, "planPaid": paid, "patientOwes": owes,
                    "notCovered": nc, "remark": remark})
        shares.append({"deductible": r2(ded), "copay": r2(cop), "coinsurance": r2(coins)})
    return out, shares


def make_eob(rng: random.Random, plan: dict, bill: dict, key: str, elines: list[dict], network: str,
             status: str = "processed", emergency: bool | None = True) -> dict:
    dates = sorted(l["date"] for l in elines if l.get("date")) or [bill["serviceDate"]]
    tot = lambda f: r2(sum(l[f] for l in elines)) if elines and all(l[f] is not None for l in elines) else None
    return {
        "isEob": True,
        "payer": plan["payer"],
        "planType": plan["planType"],
        "memberName": bill["patientName"],
        "memberId": f"{plan['prefix']}{rng.randint(10**8, 10**9 - 1)}",
        "claimNumber": f"{rng.randint(20, 26)}{rng.randint(10**10, 10**11 - 1)}",
        "providerName": rng.choice(EOB_PROVIDER[key]),
        "serviceDateFrom": dates[0],
        "serviceDateTo": dates[-1],
        "network": network,
        "emergency": emergency,
        "claimStatus": status,
        "totalBilled": tot("billed"),
        "totalAllowed": tot("allowed"),
        "totalPlanPaid": tot("planPaid"),
        "totalPatientOwes": tot("patientOwes"),
        "appealDeadline": rng.choice(["180 days from the date of this notice", "within 180 days of the date on this statement",
                                      "60 days from the date of this notice"] if plan["planType"] == "Medi-Cal"
                                     else ["180 days from the date of this notice", "within 180 days of the date on this statement"]),
        "appealAddress": plan["appeal"],
        "insurerPhone": plan["phone"],
        "lines": elines,
        "unreadable": [],
    }


def settle_bill(bill: dict, plan: dict, eob: dict, *, ins_paid: float, adjustments: float, patient_paid: float) -> None:
    bill["insurancePayer"] = f"{plan['payer']} {plan['planType']}"
    bill["insurancePaid"] = r2(ins_paid)
    bill["adjustments"] = r2(adjustments)
    bill["patientPaid"] = r2(patient_paid)
    bill["totalCharges"] = r2(sum(l["charge"] for l in bill["lines"]))
    bill["amountDue"] = r2(bill["totalCharges"] - bill["insurancePaid"] - bill["adjustments"] - bill["patientPaid"])


def contractual(eob: dict) -> float:
    return r2(sum(l["billed"] - (l["allowed"] or 0) for l in eob["lines"]))


def pick_paid(rng: random.Random, owes: float) -> float:
    """What the patient already paid at the ER desk: nothing, or part of what they owe."""
    opts = [0.0, 0.0, 0.0] + [x for x in (50.0, 100.0, 150.0) if x < owes]
    return rng.choice(opts)


def non_er(lines: list[dict]) -> list[int]:
    return [i for i, l in enumerate(lines) if not (l.get("code") or "").startswith("9928")]


def build(kind: str, rng: random.Random, key: str, mrf: dict | None) -> dict:
    bill = bill_for(rng, key, mrf)
    lines = bill["lines"]
    note = ""
    plan_key = {
        "surprise": rng.choice(["gbh-ppo", "fog-ppo", "rla-ppo", "fog-epo"]),
        "not_applied": rng.choice(WITH_SHARE),
        "sample_like": rng.choice(["gbh-hmo", "slh-hmo"]),
        "denied_claim": rng.choice(COMMERCIAL),
    }.get(kind) or rng.choice([p["key"] for p in PLANS])
    plan = dict(PLAN[plan_key])
    plan["_co45"] = rng.random() < 0.5  # some plans print CO-45 on every discounted line

    network = "in"
    if kind == "surprise" or (kind == "clean" and rng.random() < 0.3 and plan["planType"] != "Medi-Cal"):
        network = "out"
    if kind == "owes_more_unknown" or (kind == "clean" and network == "in" and rng.random() < 0.2):
        network = "unknown"
    emergency = rng.choice([True, True, None])

    denied: set[int] = set()
    if kind == "denied_line":
        denied = set(rng.sample(non_er(lines), min(len(non_er(lines)), rng.choice([1, 1, 2]))))
    if kind == "sample_like":
        denied = {rng.choice(non_er(lines))}

    # The EOB covers the bill's lines, except where the plan never got one.
    covered = list(range(len(lines)))
    dropped = None
    if kind in ("not_on_eob", "not_on_eob_billed"):
        dropped = rng.choice(non_er(lines))
        covered.remove(dropped)
    elines, shares = adjudicate(rng, plan, [lines[i] for i in covered], network, denied={covered.index(i) for i in denied})

    status = "partly_denied" if denied else "processed"
    if kind == "pending":
        status = "pending"
        for l in elines:
            l.update(allowed=None, planPaid=None, patientOwes=None, notCovered=None, remark=None)
        shares = [None] * len(elines)
    if kind == "denied_claim":
        status = "denied"
        missing = rng.random() < 0.5
        for l in elines:
            l.update(allowed=0.0, planPaid=0.0, patientOwes=l["billed"], notCovered=l["billed"], remark=CLAIM_DENIAL)
            if missing:
                l.update(allowed=None, patientOwes=None, notCovered=None)
        shares = [None] * len(elines)
        note = "whole claim denied" + (", line amounts not printed" if missing else "")
    eob = make_eob(rng, plan, bill, key, elines, network, status, emergency)
    if kind == "denied_claim" and eob["totalPatientOwes"] is None:
        eob["totalPatientOwes"] = eob["totalBilled"]

    owes = eob_owes(eob) or 0.0
    paid = pick_paid(rng, owes)
    plan_paid = eob["totalPlanPaid"] or 0.0
    adj = contractual(eob) if kind != "denied_claim" else 0.0

    if kind == "mismatch_date":
        other = bill_for(rng, key, mrf)  # a different visit at the same hospital
        shift = rng.randint(21, 80) * rng.choice([-1, 1])
        for l in other["lines"]:
            l["date"] = (date.fromisoformat(bill["serviceDate"]) + timedelta(days=shift)).isoformat()
        oel, shares = adjudicate(rng, plan, other["lines"], network, set())
        eob = make_eob(rng, plan, bill, key, oel, network, "processed", emergency)
        note = f"EOB is for a visit {abs(shift)} days {'later' if shift > 0 else 'earlier'}"
        owes, plan_paid, adj = eob_owes(eob), eob["totalPlanPaid"], contractual(eob)
        settle_bill(bill, plan, eob, ins_paid=plan_paid, adjustments=r2(adj * rng.uniform(0.7, 1.3)), patient_paid=0)
    elif kind == "mismatch_provider":
        eob["providerName"] = rng.choice(OTHER_PROVIDERS)
        note = f"EOB is for {eob['providerName']}, not the hospital"
        settle_bill(bill, plan, eob, ins_paid=plan_paid, adjustments=adj, patient_paid=paid)
    elif kind == "pending":
        settle_bill(bill, plan, eob, ins_paid=0, adjustments=0, patient_paid=0)
        note = "claim still in process; hospital billed full charges"
    elif kind == "surprise":
        settle_bill(bill, plan, eob, ins_paid=plan_paid, adjustments=0, patient_paid=paid)
        note = "out-of-network ER balance billed above in-network cost sharing"
    elif kind in ("owes_more", "owes_more_unknown"):
        how = rng.choice(["no discount", "partial discount"])
        settle_bill(bill, plan, eob, ins_paid=plan_paid, adjustments=0 if how == "no discount" else r2(adj * rng.uniform(0.4, 0.8)),
                    patient_paid=paid)
        note = f"bill skips the plan discount ({how})"
    elif kind == "not_posted":
        settle_bill(bill, plan, eob, ins_paid=0, adjustments=adj, patient_paid=paid)
        note = "plan payment not posted, so the bill asks for it"
    elif kind == "not_applied":
        # The payment is folded into one adjustments figure: the amount due is right, the payment isn't shown.
        settle_bill(bill, plan, eob, ins_paid=0, adjustments=r2(adj + plan_paid), patient_paid=paid)
        note = "plan payment lumped into adjustments, no insurance payment shown"
    elif kind == "not_on_eob":
        settle_bill(bill, plan, eob, ins_paid=plan_paid, adjustments=r2(adj + lines[dropped]["charge"]), patient_paid=paid)
        note = f"{lines[dropped]['code']} not on the EOB (held for a separate claim)"
    elif kind == "not_on_eob_billed":
        settle_bill(bill, plan, eob, ins_paid=plan_paid, adjustments=adj, patient_paid=paid)
        note = f"{lines[dropped]['code']} not on the EOB and billed to the patient at full charge"
    elif kind == "sample_like":
        settle_bill(bill, plan, eob, ins_paid=0, adjustments=0, patient_paid=paid)
        note = "full charges billed, plan payment not shown, one line denied"
    else:  # clean, denied_line, denied_claim
        settle_bill(bill, plan, eob, ins_paid=plan_paid, adjustments=adj, patient_paid=paid)
        if kind == "denied_line":
            note = f"{len(denied)} line(s) not covered"
    if kind == "clean":
        note = {"in": "clean, in-network", "out": "clean, out-of-network ER billed at in-network cost sharing",
                "unknown": "clean, network not printed"}[network] + (f", {plan['planType']}")

    plan.pop("_co45")
    return {"kind": kind, "plan": plan_key, "planType": plan["planType"], "network": network, "note": note,
            "bill": bill, "eob": eob, "shares": shares, "dropped": dropped}


# What each kind must produce, as finding kinds in rule order.
WANT = {
    "clean": [], "mismatch_date": ["EOB_MISMATCH"], "mismatch_provider": ["EOB_MISMATCH"],
    "pending": ["CLAIM_PENDING"], "surprise": ["SURPRISE_BILL"], "owes_more": ["OWES_MORE_THAN_EOB"],
    "owes_more_unknown": ["OWES_MORE_THAN_EOB"], "not_posted": ["OWES_MORE_THAN_EOB"],
    "not_applied": ["INSURANCE_NOT_APPLIED"], "not_on_eob": ["NOT_ON_EOB"],
    "not_on_eob_billed": ["OWES_MORE_THAN_EOB", "NOT_ON_EOB"], "denied_line": ["DENIED_BY_PLAN"],
    "denied_claim": ["DENIED_BY_PLAN"], "sample_like": ["OWES_MORE_THAN_EOB", "DENIED_BY_PLAN"],
}


NEEDS_PAYMENT = {"not_applied", "not_posted", "sample_like"}


def planted_amounts(p: dict) -> list[float]:
    """The amount each planted finding should carry, worked out from how the pair was built."""
    bill, eob, kind = p["bill"], p["eob"], p["kind"]
    still = max(0.0, (eob_owes(eob) or 0) - bill["patientPaid"])
    due = bill["amountDue"]
    if kind in ("surprise", "owes_more", "owes_more_unknown", "not_posted"):
        return [r2(due - still)]
    if kind == "not_applied":
        return [r2(min(eob["totalPlanPaid"], due))]
    if kind == "not_on_eob":
        return [0]
    if kind == "not_on_eob_billed":
        return [bill["lines"][p["dropped"]]["charge"], 0]
    if kind == "denied_line":
        return [r2(sum(l["notCovered"] for l in eob["lines"]))]
    if kind == "denied_claim":
        return [eob["totalPatientOwes"] if eob["lines"][0]["notCovered"] is None else r2(sum(l["notCovered"] for l in eob["lines"]))]
    if kind == "sample_like":
        return [r2(due - still), r2(sum(l["notCovered"] for l in eob["lines"]))]
    return [0] * len(WANT[kind])


def generate(n: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    mrfs = prices.load_all()
    if not mrfs:
        print("WARNING: no prices_*.json found in", prices.DATA_DIR, "- every charge uses the PLACEHOLDER table in prices.py.",
              file=_sys.stderr)
    OUT.mkdir(exist_ok=True)
    FIXTURES.mkdir(exist_ok=True)
    for old in list(OUT.glob("pair-*")) + list(FIXTURES.glob("pair-*.json")):
        old.unlink()
    manifest = []
    for idx, kind in enumerate(plan_kinds(n, rng), 1):
        pid = f"pair-{idx:03d}"
        key = rng.choice(list(prices.HOSPITALS))
        for _ in range(50):
            p = build(kind, rng, key, mrfs.get(key))
            # These kinds need a plan payment to leave off the bill (a deductible can eat all of it).
            if kind not in NEEDS_PAYMENT or (p["eob"]["totalPlanPaid"] >= 1 and p["bill"]["amountDue"] >= 1):
                break
        bill = p["bill"]
        sources, scenario = bill.pop("_sources"), bill.pop("_scenario")
        found = check_eob(bill, p["eob"])
        got = [(f["kind"], f["amount"]) for f in found]
        want = list(zip(WANT[kind], planted_amounts(p)))
        # The answer key must be exactly what the rules see; fail loudly if not.
        if got != want:
            raise SystemExit(f"{pid} ({kind}, {p['note']}): planted {want} but eobchecks finds {got}")
        expect = [{"kind": k, "amount": a} for k, a in want]
        variant = {"eob": rng.choices(["photo", "clean"], weights=[6, 4])[0],
                   "bill": rng.choices(["photo", "clean"], weights=[6, 4])[0]}
        truth = {
            "id": pid, "kind": kind, "note": p["note"], "hospitalKey": key, "scenario": scenario,
            "plan": p["plan"], "planType": p["planType"], "network": p["network"], "lineSources": sources,
            "variant": variant, "files": {"eob": f"{pid}.eob.png", "bill": f"{pid}.bill.png"},
            "bill": bill, "eob": p["eob"], "shares": p["shares"], "expect": expect, "findings": found,
        }
        (OUT / f"{pid}.bill.json").write_text(json.dumps(bill, indent=1))
        (OUT / f"{pid}.eob.json").write_text(json.dumps(p["eob"], indent=1))
        (OUT / f"{pid}.truth.json").write_text(json.dumps(truth, indent=1))
        (FIXTURES / f"{pid}.json").write_text(json.dumps({"bill": bill, "eob": p["eob"], "expect": expect}, indent=1))
        manifest.append({"id": pid, "kind": kind, "hospital": key, "plan": p["plan"], "network": p["network"],
                         "expect": [e["kind"] for e in expect], "note": p["note"]})
    (OUT / "manifest.json").write_text(json.dumps({"seed": seed, "n": n, "pairs": manifest}, indent=1))
    c = Counter(m["kind"] for m in manifest)
    k = Counter(e for m in manifest for e in m["expect"])
    print(f"wrote {n} pairs to {OUT} and {FIXTURES}: " + ", ".join(f"{a} {b}" for a, b in sorted(c.items())))
    print("planted findings: " + ", ".join(f"{a} {b}" for a, b in sorted(k.items())))
    return manifest


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-n", type=int, default=30)
    ap.add_argument("--seed", type=int, default=2026)
    a = ap.parse_args()
    generate(a.n, a.seed)


if __name__ == "__main__":
    main()
