"""Generate the hard bill set: six layouts, hard photo conditions, planted errors, answer keys.

  python -I generate.py                 # dev + held-out bills into ../out/hard/
  python -I generate.py --sample        # also copy a few small images into sample/ (committed)

Each bill is priced like the bill eval (../generate.py): an ER visit at a San Francisco hospital,
every line at that hospital's published gross charge times quantity. Then one error is planted
(or none), the bill is drawn in one layout (layouts.py) and photographed or scanned under hard
conditions (conditions.py).

Two splits, made with different seeds: "dev" is the set we look at and tune on, "holdout" is only
scored. Per bill:
  ../out/hard/<id>.p1.jpg ... (photos, one per page) or <id>.pdf
  ../out/hard/<id>.truth.json   {id, split, layout, kind, medium, conditions, conditionLog, files, hospitalKey,
                                 ref, bill (ParsedBill), errors, expectedFindings, notes}
`errors` is the answer key, as in the bill eval: {kind, lines, note} with line indexes into bill.lines
in printed order. The generator stops if the Python rules mirror (../checks.py) doesn't find exactly
the planted errors; run.ts --oracle checks the same against the app's TypeScript rules.
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_HERE = _Path(__file__).resolve().parent
_sys.path[:0] = [str(_HERE.parent), str(_HERE)]  # -I leaves the script dir off sys.path; bill eval first

import argparse
import importlib.util
import json
import random
import shutil
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import prices
from checks import check_bill, r2
import conditions as cond
import layouts

HERE = _HERE
OUT = HERE.parent / "out" / "hard"
SAMPLE = HERE / "sample"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bg = _load("bill_generate", HERE.parent / "generate.py")

# The plan for each split: (layout, kind, medium). Kinds are the bill eval's:
# clean, dup, above, total, combo (dup + total), summary (NOT_ITEMIZED).
PLAN = [
    ("classic", "dup", "photo"), ("classic", "above", "photo"), ("classic", "total", "photo"), ("classic", "clean", "photo"),
    ("epic", "dup", "photo"), ("epic", "above", "photo"), ("epic", "clean", "photo"), ("epic", "total", "scan"), ("epic", "combo", "photo"),
    ("summary", "summary", "photo"), ("summary", "summary", "photo"), ("summary", "summary", "scan"),
    ("multipage", "dup", "photo"), ("multipage", "above", "photo"), ("multipage", "clean", "photo"), ("multipage", "total", "pdf"), ("multipage", "dup", "pdf"),
    ("ub04", "above", "photo"), ("ub04", "dup", "photo"), ("ub04", "clean", "scan"), ("ub04", "total", "photo"),
    ("collection", "dup", "photo"), ("collection", "above", "scan"), ("collection", "balance", "photo"), ("collection", "balance", "photo"),
]
SPLITS = {"dev": 101, "holdout": 202}

# Conditions are dealt round-robin so each one shows up on several bills in each split.
PHOTO_CYCLE = ["crumple", "perspective", "shadow", "lowlight", "blur", "glare", "crop", "fold"]
INK_CYCLE = ["pen", "highlighter", "coffee"]


def deal_conditions(plan: list[tuple], rng: random.Random) -> list[list[str]]:
    out = []
    pi = rng.randrange(len(PHOTO_CYCLE))
    ii = rng.randrange(len(INK_CYCLE))
    for _layout, _kind, medium in plan:
        cs = []
        if medium == "photo":
            for _ in range(2 if rng.random() < 0.6 else 1):
                cs.append(PHOTO_CYCLE[pi % len(PHOTO_CYCLE)])
                pi += 1
            if rng.random() < 0.75:
                cs.append(INK_CYCLE[ii % len(INK_CYCLE)])
                ii += 1
        else:  # scans and PDFs: marks on the paper, maybe a fold
            cs.append(INK_CYCLE[ii % len(INK_CYCLE)])
            ii += 1
            if rng.random() < 0.4:
                cs.append("fold")
        out.append(sorted(set(cs), key=cond.ALL.index))
    return out


# ---- bills --------------------------------------------------------------------------------

DAILY = ["85025", "80053", "36415", "J7030", "J2405", "J1885", "96375", "96360", "81001"]
FIRST_DAY = ["93005", "71046", "96374"]


def long_bill(rng: random.Random, key: str, mrf: dict | None) -> dict:
    """An ER visit kept for observation over 2 to 4 days: enough lines for 2 to 4 pages. No code twice on one day."""
    bill, _ = bg.base_bill(rng, key, mrf, ["chest pain", "abdominal pain"])
    service = date.fromisoformat(bill["serviceDate"])
    lines = [bg.make_line(rng.choice(["99284", "99285"]), mrf, service)]
    lines += [bg.make_line(c, mrf, service) for c in FIRST_DAY + [rng.choice(["74177", "70450"])]]
    days = rng.randint(2, 4)
    for d in range(days):
        day = service + timedelta(days=d)
        for c in rng.sample(DAILY, rng.randint(6, 8)):
            if any(l["code"] == c and l["date"] == day.isoformat() for l in lines):
                continue
            qty = {"J2405": 4, "J1885": 2, "J7030": rng.choice([1, 2])}.get(c, 1)
            lines.append(bg.make_line(c, mrf, day, qty))
    lines.sort(key=lambda l: l["date"])
    bill["lines"] = lines
    bill["totalCharges"] = r2(sum(l["charge"] for l in lines))
    if bill["insurancePayer"]:
        bill["insurancePaid"] = r2(bill["totalCharges"] * 0.38)
        bill["adjustments"] = r2(bill["totalCharges"] * 0.41)
    bill["statementDate"] = (date.fromisoformat(lines[-1]["date"]) + timedelta(days=rng.randint(14, 40))).isoformat()
    return bill


def plant_dup_far(bill: dict, rng: random.Random) -> dict:
    """A duplicate on a later page: copy a line from the first third to the last third."""
    lines = bill["lines"]
    n = len(lines)
    i = rng.randrange(1, max(2, n // 3))
    j = rng.randint(2 * n // 3, n)
    lines.insert(j, dict(lines[i]))
    bill["totalCharges"] = r2(sum(l["charge"] for l in lines))
    return {"kind": "DUPLICATE_LINE", "lines": [i, j], "note": f"{lines[i]['code']} on {lines[i]['date']} entered again further down"}


def build_bill(layout: str, kind: str, rng: random.Random, mrfs: dict) -> tuple[dict, list[dict], str]:
    priced = [k for k in prices.HOSPITALS if k in mrfs]
    key = rng.choice(priced) if kind == "above" else rng.choice(list(prices.HOSPITALS))
    mrf = mrfs.get(key)
    if layout == "multipage":
        bill = long_bill(rng, key, mrf)
    else:
        choices = ["chest pain", "abdominal pain", "dehydration"] if kind in ("summary", "balance") else list(bg.SCENARIOS)
        for _ in range(20):
            bill, _ = bg.base_bill(rng, key, mrf, choices)
            if layout != "ub04" or len(bill["lines"]) <= 20:
                break
    if layout == "ub04":  # a claim form as a patient copy: self-pay, nothing paid yet
        bill.update(insurancePayer=None, insurancePaid=0, adjustments=0, patientPaid=0.0)
    errors = []
    if kind in ("dup", "combo"):
        errors.append(plant_dup_far(bill, rng) if layout == "multipage" else bg.plant_duplicate(bill, rng))
    if kind == "above":
        errors.append(bg.plant_above(bill, rng))
    if kind in ("summary", "balance"):
        errors.append(bg.make_summary(bill))
    if kind in ("total", "combo"):
        errors.append(bg.plant_total(bill, rng))
    if bill["insurancePayer"] and kind not in ("summary", "balance"):
        # Keep payments in line with the (possibly changed) charges.
        s = r2(sum(l["charge"] for l in bill["lines"]))
        bill["insurancePaid"], bill["adjustments"] = r2(s * 0.38), r2(s * 0.41)
    bg.settle(bill)
    if kind == "balance":  # a collection letter with only the balance: no lines, no printed total charges
        bill["lines"] = []
        bill["totalCharges"] = None
        bill["insurancePaid"] = 0
        bill["adjustments"] = 0
        errors[-1]["note"] = "collection letter with only the balance, no itemization"
    return bill, errors, key


def reorder(bill: dict, errors: list[dict], order: list[int]) -> None:
    """Put bill.lines in printed order and point the errors at the new indexes."""
    if order == list(range(len(order))):
        return
    pos = {old: new for new, old in enumerate(order)}
    bill["lines"] = [bill["lines"][i] for i in order]
    for e in errors:
        e["lines"] = sorted(pos[i] for i in e["lines"])


def finish(bill: dict, key: str) -> tuple[dict, list[str]]:
    """ParsedBill fields in the order of convex/lib/bill.ts; private helper fields out."""
    srcs = [l.pop("_source") for l in bill["lines"]]
    for l in bill["lines"]:
        l["chargePrinted"] = f"{l['charge']:,.2f}"
    h = prices.HOSPITALS[key]
    out = {"isMedicalBill": True, "hospitalName": bill["hospitalName"], "hospitalWebsite": bill["hospitalWebsite"],
           "hospitalAddress": h["address"], "billingPhone": bill["billingPhone"], "accountNumber": bill["accountNumber"],
           "patientName": bill["patientName"], "patientAddress": None, "statementDate": bill["statementDate"],
           "serviceDate": bill["serviceDate"], "insurancePayer": bill["insurancePayer"], "insurancePaid": bill["insurancePaid"],
           "adjustments": bill["adjustments"], "patientPaid": bill["patientPaid"], "totalCharges": bill["totalCharges"],
           "amountDue": bill["amountDue"], "isItemized": bill["isItemized"], "lines": bill["lines"], "unreadable": []}
    return out, srcs


def save_images(bid: str, imgs: list, medium: str, rng: random.Random) -> dict:
    if medium == "pdf":
        p = OUT / f"{bid}.pdf"
        imgs[0].save(p, save_all=True, append_images=imgs[1:], resolution=150)
        return {"pdf": p.name}
    names = []
    for k, im in enumerate(imgs, 1):
        p = OUT / f"{bid}.p{k}.jpg"
        im.convert("RGB").save(p, quality=rng.randint(78, 88) if medium == "photo" else 90, optimize=True)
        names.append(p.name)
    return {"pages": names}


def generate() -> list[dict]:
    mrfs = prices.load_all()
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("hb-*"):
        old.unlink()
    (OUT / "refs").mkdir(exist_ok=True)
    for key in prices.HOSPITALS:
        (OUT / "refs" / f"{key}.json").write_text(json.dumps(prices.hospital_ref(key, mrfs.get(key)), indent=1))
    manifest = []
    for split, seed in SPLITS.items():
        rng = random.Random(seed)
        plan = list(PLAN)
        rng.shuffle(plan)
        conds = deal_conditions(plan, rng)
        for n, ((layout, kind, medium), cs) in enumerate(zip(plan, conds), 1):
            bid = f"hb-{split[0]}{n:02d}"
            bill, errors, key = build_bill(layout, kind, rng, mrfs)
            r = layouts.LAYOUTS[layout](bill, rng)
            reorder(bill, errors, r.order)
            bill, srcs = finish(bill, key)
            ref = prices.hospital_ref(key, mrfs.get(key))
            expected = check_bill(bill, ref)
            got = Counter(f["kind"] for f in expected if f["kind"] != "CASH_PRICE_GAP")
            want = Counter(e["kind"] for e in errors)
            if got != want:
                raise SystemExit(f"{bid} ({layout}/{kind}): planted {dict(want)} but checks find {dict(got)}")
            imgs, clog = cond.apply(r, cs, rng, "photo" if medium == "photo" else "scan")
            files = save_images(bid, imgs, medium, rng)
            truth = {"id": bid, "split": split, "layout": layout, "kind": kind, "medium": medium, "conditions": cs,
                     "conditionLog": clog, "notes": r.notes, "files": files, "pages": len(imgs), "hospitalKey": key,
                     "ref": f"refs/{key}.json", "lineSources": srcs, "bill": bill, "errors": errors, "expectedFindings": expected}
            (OUT / f"{bid}.truth.json").write_text(json.dumps(truth, indent=1))
            manifest.append({"id": bid, "split": split, "layout": layout, "kind": kind, "medium": medium, "conditions": cs,
                             "pages": len(imgs), "lines": len(bill["lines"]), "errors": [e["kind"] for e in errors]})
            print(f"{bid} {split:7} {layout:10} {kind:8} {medium:5} {len(imgs)}p {len(bill['lines']):2} lines  {'+'.join(cs)}", flush=True)
    (OUT / "manifest.json").write_text(json.dumps({"bills": manifest}, indent=1))
    c = Counter(x for m in manifest for x in m["conditions"])
    print("conditions:", ", ".join(f"{k} {v}" for k, v in sorted(c.items())))
    print("planted:", dict(Counter(e for m in manifest for e in m["errors"])))
    return manifest


def sample(ids: list[str]) -> None:
    """Copy a few small images into sample/ (committed, so the set can be seen without running anything)."""
    from PIL import Image

    SAMPLE.mkdir(exist_ok=True)
    for old in SAMPLE.glob("*"):
        old.unlink()
    for bid in ids:
        t = json.loads((OUT / f"{bid}.truth.json").read_text())
        src = OUT / t["files"]["pages"][0] if "pages" in t["files"] else None
        if src is None:
            continue
        im = Image.open(src)
        im = im.resize((800, round(im.height * 800 / im.width)), Image.LANCZOS)
        im.save(SAMPLE / f"{bid}-{t['layout']}-{'-'.join(t['conditions'])}.jpg", quality=72, optimize=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sample", nargs="*", help="bill ids to copy into sample/ after generating")
    a = ap.parse_args()
    generate()
    if a.sample:
        sample(a.sample)


if __name__ == "__main__":
    main()
