"""Generate synthetic SF hospital ER bills with planted errors and an answer key.

  python -I generate.py            # 30 bills into out/
  python -I generate.py -n 60 --seed 7
  python -I generate.py --demo     # demo_bill.json + out/demo-bill.png + public/sample-bill.png

For each bill writes out/<id>.png (and out/<id>.pdf for the 2-page variant) plus
out/<id>.truth.json:
  {id, hospitalKey, priceSource, variant, files, ref, bill: ParsedBill, errors: [...],
   expectedFindings: [...]}
`errors` is the answer key: {kind, lines, note}. kind is a FindingKind from checks.ts.
Line indexes point into bill.lines. A clean bill has errors == [].

Line charges are each hospital's published gross charge times quantity, taken from
~/Code/recount-data/out/prices_<hospital>.json. Codes missing from that file use the
PLACEHOLDER_PRICES table in prices.py, and the line's `source` in the truth file says so.
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parent))  # -I leaves the script dir off sys.path

import argparse
import json
import random
import shutil
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import prices
from checks import check_bill, r2
from render import render

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"

# Visit scenarios: (ER level choices, codes always present, optional codes).
SCENARIOS = {
    "chest pain": (["99284", "99285"], ["93005", "80053", "85025", "71046", "36415"], ["96374", "J2405", "J7030"]),
    "head injury": (["99283", "99284"], ["70450"], ["12002", "J1885", "96374", "85025"]),
    "abdominal pain": (["99284", "99285"], ["74177", "80053", "85025", "81001", "36415"], ["96374", "96375", "J2405", "J1885", "J7030"]),
    "laceration": (["99283"], ["12002"], ["J1885", "71046"]),
    "dehydration": (["99283", "99284"], ["96360", "J7030", "80053", "36415"], ["96375", "J2405", "85025", "81001"]),
}

PATIENTS = [
    "Jordan Lee", "Sam Okafor", "Maria Santos", "Chris Nguyen", "Taylor Brooks", "Dana Kowalski",
    "Riley Chen", "Jamie Alvarez", "Morgan Patel", "Casey Huang", "Avery Johnson", "Quinn Ramirez",
    "Drew Martin", "Robin Tran", "Jesse Kim", "Elena Duarte", "Marcus Bell", "Priya Raman",
]
PAYERS = ["Blue Shield of California PPO", "Anthem Blue Cross PPO", "Aetna Choice POS II"]

SUMMARY_GROUPS = [  # rev-code prefix -> printed category
    ("045", "0450", "EMERGENCY ROOM"),
    ("030", "0300", "LABORATORY"),
    ("032", "0320", "RADIOLOGY - DIAGNOSTIC"),
    ("035", "0350", "CT SCAN"),
    ("026", "0260", "IV THERAPY"),
    ("063", "0636", "PHARMACY - DRUGS"),
    ("025", "0250", "PHARMACY"),
    ("073", "0730", "EKG/ECG"),
]

# Mix of bill kinds. "combo" plants a duplicate and a bad total on the same bill.
MIX = [("clean", 0.25), ("dup", 0.20), ("above", 0.20), ("total", 0.15), ("summary", 0.13), ("combo", 0.07)]


def plan_kinds(n: int, rng: random.Random) -> list[str]:
    kinds = []
    for k, share in MIX:
        kinds += [k] * round(n * share)
    while len(kinds) < n:
        kinds.append("clean")
    kinds = kinds[:n]
    rng.shuffle(kinds)
    return kinds


def make_line(code: str, mrf: dict | None, day: date, qty: int = 1) -> dict:
    row = prices.price_for(code, mrf)
    desc = row["description"].upper() if row["source"] == "mrf" else row["description"]
    return {
        "date": day.isoformat(),
        "code": code,
        "revCode": prices.REV_CODES.get(code),
        "description": desc,
        "quantity": qty,
        "charge": r2(row["grossCharge"] * qty),
        "_source": row["source"],
    }


def base_bill(rng: random.Random, key: str, mrf: dict | None, choices: list[str]) -> dict:
    h = prices.HOSPITALS[key]
    scenario = rng.choice(choices)
    levels, always, optional = SCENARIOS[scenario]
    codes = [rng.choice(levels)] + always + rng.sample(optional, rng.randint(0, len(optional)))
    service = date(2026, 7, 1) + timedelta(days=rng.randint(0, 90))
    overnight = rng.random() < 0.25
    lines = []
    for i, c in enumerate(codes):
        day = service + timedelta(days=1) if overnight and i >= len(codes) * 0.6 else service
        qty = {"J2405": 4, "J1885": 2, "J7030": rng.choice([1, 2])}.get(c, 1)
        lines.append(make_line(c, mrf, day, qty))
    insured = rng.random() < 0.2
    total = r2(sum(l["charge"] for l in lines))
    bill = {
        "hospitalName": h["name"],
        "hospitalWebsite": h["website"],
        "billingPhone": h["phone"],
        "accountNumber": f"SAMPLE-{rng.randint(10**7, 10**8 - 1)}",
        "patientName": rng.choice(PATIENTS),
        "statementDate": (service + timedelta(days=rng.randint(14, 40))).isoformat(),
        "serviceDate": service.isoformat(),
        "insurancePayer": rng.choice(PAYERS) if insured else None,
        "insurancePaid": r2(total * 0.38) if insured else 0,
        "adjustments": r2(total * 0.41) if insured else 0,
        "patientPaid": float(rng.choice([0, 0, 0, 100, 250])),
        "totalCharges": total,
        "amountDue": None,
        "isItemized": True,
        "lines": lines,
        "unreadable": [],
    }
    return bill, scenario


def settle(bill: dict) -> None:
    """Amount due follows the printed total, right or wrong, like a real statement."""
    t = bill["totalCharges"]
    bill["amountDue"] = r2(t - bill["insurancePaid"] - bill["adjustments"] - bill["patientPaid"])


def plant_duplicate(bill: dict, rng: random.Random) -> dict:
    lines = bill["lines"]
    i = rng.randrange(1, len(lines))  # never the ER visit itself, too obvious
    j = rng.randint(i + 1, len(lines))
    lines.insert(j, dict(lines[i]))
    bill["totalCharges"] = r2(sum(l["charge"] for l in lines))
    return {"kind": "DUPLICATE_LINE", "lines": [i, j],
            "note": f"{lines[i]['code']} entered twice on {lines[i]['date']}"}


def plant_above(bill: dict, rng: random.Random) -> dict:
    cands = [i for i, l in enumerate(bill["lines"]) if l["_source"] == "mrf"]
    i = rng.choice(cands)
    l = bill["lines"][i]
    published = l["charge"] / l["quantity"]
    l["charge"] = float(round(l["charge"] * rng.uniform(1.08, 1.6)))
    bill["totalCharges"] = r2(sum(x["charge"] for x in bill["lines"]))
    return {"kind": "ABOVE_LIST_PRICE", "lines": [i],
            "note": f"{l['code']} billed {l['charge']:.2f}, published gross {published:.2f}/unit"}


def plant_total(bill: dict, rng: random.Random) -> dict:
    s = r2(sum(l["charge"] for l in bill["lines"]))
    how = rng.choice(["transpose", "extra", "carry"])
    if how == "transpose":  # swap two adjacent digits of the dollars
        d = list(f"{int(s)}")
        k = rng.randrange(len(d) - 1)
        while d[k] == d[k + 1]:
            k = (k + 1) % (len(d) - 1)
        d[k], d[k + 1] = d[k + 1], d[k]
        t = r2(int("".join(d)) + (s - int(s)))
    elif how == "extra":  # a charge left in the total after its line was removed
        t = r2(s + rng.choice([269.0, 402.0, 528.0, 1150.0]))
    else:
        t = r2(s + 1000)
    bill["totalCharges"] = t
    return {"kind": "TOTAL_MISMATCH", "lines": [], "note": f"lines sum to {s:.2f}, printed total {t:.2f} ({how})"}


def make_summary(bill: dict) -> dict:
    groups: dict[str, dict] = {}
    for l in bill["lines"]:
        rc = l["revCode"] or "0999"
        name = next(((code, label) for p, code, label in SUMMARY_GROUPS if rc.startswith(p)), ("0999", "OTHER SERVICES"))
        g = groups.setdefault(name[1], {"date": None, "code": None, "revCode": name[0], "description": name[1],
                                        "quantity": 1, "charge": 0.0, "_source": "summary"})
        g["charge"] = r2(g["charge"] + l["charge"])
    bill["lines"] = list(groups.values())
    bill["isItemized"] = False
    return {"kind": "NOT_ITEMIZED", "lines": [], "note": "summary bill, no CPT/HCPCS codes or per-service charges"}


def strip(bill: dict) -> tuple[dict, list[str]]:
    """Remove private helper fields; return the ParsedBill and each line's price source."""
    srcs = [l.pop("_source") for l in bill["lines"]]
    return bill, srcs


def write_refs(mrfs: dict) -> None:
    (OUT / "refs").mkdir(parents=True, exist_ok=True)
    for key in prices.HOSPITALS:
        ref = prices.hospital_ref(key, mrfs.get(key))
        (OUT / "refs" / f"{key}.json").write_text(json.dumps(ref, indent=1))


def generate(n: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    mrfs = prices.load_all()
    if not mrfs:
        print("WARNING: no prices_*.json found in", prices.DATA_DIR,
              "- every charge uses the PLACEHOLDER table in prices.py and no ABOVE_LIST_PRICE errors are planted.",
              file=sys.stderr)
    else:
        missing = [k for k in prices.HOSPITALS if k not in mrfs]
        print(f"real price files: {', '.join(mrfs)}; placeholder prices for: {', '.join(missing) or 'none'}")
    OUT.mkdir(exist_ok=True)
    write_refs(mrfs)
    kinds = plan_kinds(n, rng)
    if not mrfs:
        kinds = ["clean" if k == "above" else k for k in kinds]
    manifest = []
    for idx, kind in enumerate(kinds, 1):
        bid = f"bill-{idx:03d}"
        key = rng.choice(list(mrfs)) if kind == "above" else rng.choice(list(prices.HOSPITALS))
        mrf = mrfs.get(key)
        # A summary bill needs several departments to look real.
        choices = ["chest pain", "abdominal pain", "dehydration"] if kind == "summary" else list(SCENARIOS)
        bill, scenario = base_bill(rng, key, mrf, choices)
        errors = []
        if kind in ("dup", "combo"):
            errors.append(plant_duplicate(bill, rng))
        if kind == "above":
            errors.append(plant_above(bill, rng))
        if kind == "summary":
            errors.append(make_summary(bill))
        if kind in ("total", "combo"):
            errors.append(plant_total(bill, rng))
        settle(bill)
        bill, srcs = strip(bill)
        ref = prices.hospital_ref(key, mrf)
        expected = check_bill(bill, ref)
        # The answer key must match what the rules can see; fail loudly if it doesn't.
        got = Counter(f["kind"] for f in expected if f["kind"] != "CASH_PRICE_GAP")
        want = Counter(e["kind"] for e in errors)
        if got != want:
            raise SystemExit(f"{bid}: planted {dict(want)} but checks find {dict(got)}")
        variant = rng.choices(["photo", "clean", "pdf"], weights=[6, 3, 1])[0]
        files = {"png": f"{bid}.png"}
        render(bill, OUT / bid, "photo" if variant == "photo" else "clean", seed=seed * 1000 + idx)
        if variant == "pdf":
            render(bill, OUT / bid, "pdf", seed=seed * 1000 + idx)
            files["pdf"] = f"{bid}.pdf"
        price_src = sorted(set(s for s in srcs if s != "summary")) or ["summary"]
        truth = {
            "id": bid,
            "scenario": scenario,
            "hospitalKey": key,
            "priceSource": price_src[0] if len(price_src) == 1 else "mixed",
            "lineSources": srcs,
            "variant": variant,
            "files": files,
            "ref": f"refs/{key}.json",
            "bill": bill,
            "errors": errors,
            "expectedFindings": expected,
        }
        (OUT / f"{bid}.truth.json").write_text(json.dumps(truth, indent=1))
        manifest.append({"id": bid, "kind": kind, "hospital": key, "variant": variant,
                         "errors": [e["kind"] for e in errors]})
    (OUT / "manifest.json").write_text(json.dumps({"seed": seed, "n": n, "bills": manifest}, indent=1))
    c = Counter(m["kind"] for m in manifest)
    print(f"wrote {n} bills to {OUT}: " + ", ".join(f"{k} {v}" for k, v in sorted(c.items())))
    return manifest


# ---- demo bill -------------------------------------------------------------------------

DEMO_CODES = [  # (code, qty, description override or None)
    ("99284", 1, None), ("80053", 1, None), ("85025", 1, None), ("85025", 1, None),
    ("71046", 1, None), ("70450", 1, None), ("96374", 1, None), ("J2405", 4, None),
    ("J7050", 1, None), ("36415", 1, None),
]
DEMO_ABOVE = "70450"  # CT head billed above ZSFG's published gross charge
DEMO_ABOVE_CHARGE = 4830.0


def build_demo() -> dict:
    mrf = prices.load_all().get("zsfg")
    if not mrf:
        print("WARNING: prices_zsfg.json missing; demo uses PLACEHOLDER prices.", file=sys.stderr)
    day = date(2026, 9, 12)
    lines = [make_line(c, mrf, day, q) for c, q, _ in DEMO_CODES]
    for l in lines:
        if l["code"] == DEMO_ABOVE:
            l["charge"] = DEMO_ABOVE_CHARGE
    srcs = {l["code"]: l.pop("_source") for l in lines}
    total = r2(sum(l["charge"] for l in lines))
    bill = {
        "hospitalName": prices.HOSPITALS["zsfg"]["name"],
        "hospitalWebsite": None,
        "billingPhone": prices.HOSPITALS["zsfg"]["phone"],
        "accountNumber": "SAMPLE-40017782",
        "patientName": "Alex Rivera",
        "statementDate": "2026-10-01",
        "serviceDate": "2026-09-12",
        "insurancePayer": None,
        "insurancePaid": 0,
        "adjustments": 0,
        "patientPaid": 0,
        "totalCharges": total,
        "amountDue": total,
        "isItemized": True,
        "lines": lines,
        "unreadable": [],
    }
    (HERE / "demo_bill.json").write_text(json.dumps(bill, indent=2) + "\n")
    placeholder = sorted(c for c, s in srcs.items() if s != "mrf")
    print("demo_bill.json written; total", f"{total:,.2f}")
    if placeholder:
        print("  not in ZSFG's price file, placeholder prices used for:", ", ".join(placeholder))
    return bill


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-n", type=int, default=30)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--demo", action="store_true", help="build demo_bill.json and render the demo images")
    a = ap.parse_args()
    if a.demo:
        bill = build_demo()
        OUT.mkdir(exist_ok=True)
        render(bill, OUT / "demo-bill", "clean")
        render(bill, OUT / "demo-bill-photo", "photo", seed=12)
        render(bill, OUT / "demo-bill", "pdf")
        shutil.copyfile(OUT / "demo-bill.png", HERE.parent / "public" / "sample-bill.png")
        mrfs = prices.load_all()
        found = check_bill(bill, prices.hospital_ref("zsfg", mrfs.get("zsfg")))
        print("checks on demo bill:", ", ".join(f"{f['kind']} lines {f['lines']}" for f in found))
        print("wrote out/demo-bill.png, out/demo-bill-photo.png, out/demo-bill.pdf, public/sample-bill.png")
        return
    generate(a.n, a.seed)


if __name__ == "__main__":
    main()
