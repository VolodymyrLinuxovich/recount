"""Generate the hard insurance statement set: bill + EOB pairs in four EOB layouts, under hard photo conditions.

  python -I eob_generate.py        # dev + held-out pairs into ../out/hard-eob/

The claims come from the EOB eval (../eob/generate.py): each pair is an ER bill priced from a San Francisco
hospital's published charges and the EOB a fictional California plan sends for the same claim, with one
problem planted from docs/EOB.md (or none). The plans are made up: Golden Bear Health Plan, Fogline Health,
Redwood Lantern Assurance, Sierra Larkspur Health Plan and Poppyfield Community Health Plan.

EOB layouts:
  classic   the EOB eval's statement (../eob/render.py)
  blocks    one box per service, label and amount on each row, like a member portal printout
  dense     a wide table with every cost-share column, reason codes as footnote letters; sometimes a
            second claim on the same page (the ER doctors' group), which is not the hospital's claim
  letter    a claim decision letter: a paragraph, then a small table

Per pair:
  ../out/hard-eob/<id>.eob.p1.jpg (or .png scan) and <id>.bill.p1.jpg
  ../out/hard-eob/<id>.truth.json   {id, split, kind, note, eobLayout, billLayout, conditions, bill, eob, expect, findings, ...}
`expect` is [{kind, amount}] from the EOB eval's answer key. run.ts --oracle checks it against the app's rules.
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_HERE = _Path(__file__).resolve().parent
_sys.path[:0] = [str(_HERE.parent / "eob"), str(_HERE.parent), str(_HERE)]

import argparse
import importlib.util
import json
import random
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

from PIL import Image

import prices
import conditions as cond
import layouts
from layouts import Page, font, money, us_date, W, H
from eobchecks import check_eob

HERE = _HERE
OUT = HERE.parent / "out" / "hard-eob"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


eg = _load("eob_generate", HERE.parent / "eob" / "generate.py")
er = _load("eob_render", HERE.parent / "eob" / "render.py")

SPLITS = {
    "dev": (303, ["clean", "clean", "denied_line", "denied_line", "denied_claim", "pending", "pending",
                  "surprise", "surprise", "owes_more", "owes_more", "not_on_eob_billed"]),
    "holdout": (404, ["clean", "clean", "denied_line", "denied_line", "denied_claim", "pending", "surprise",
                      "surprise", "owes_more", "owes_more_unknown", "sample_like", "mismatch_provider"]),
}
EOB_LAYOUTS = ["classic", "blocks", "dense", "letter"]
PHOTO = ["perspective", "shadow", "lowlight", "blur", "glare", "crop", "crumple", "fold"]
INK = ["pen", "highlighter", "coffee"]
STATUS = {"processed": "Processed", "denied": "Denied", "partly_denied": "Processed - some services not covered",
          "pending": "In process", "unknown": ""}


def color_of(eob: dict) -> tuple:
    return er.brand(eob)[0]


def amt(v, pending=False) -> str:
    return "Pending" if pending else ("" if v is None else f"${money(v)}")


# ---------- EOB layouts ----------------------------------------------------------------------------

def blocks(eob: dict, shares: list | None, rng: random.Random, **_) -> tuple[Image.Image, list[dict]]:
    p = Page()
    c = color_of(eob)
    M = 60
    pending = eob.get("claimStatus") == "pending"
    p.d.rectangle([0, 0, W, 120], fill=c)
    p.text((M, 30), eob.get("payer") or "", font("arialb", 30), "white")
    p.text((M, 74), "Your Explanation of Benefits", font("arial", 20), (230, 236, 240))
    p.text((W - M, 34), "This is not a bill", font("arialb", 24), "white", "ra")
    issued = date.fromisoformat(eob["serviceDateTo"]) + timedelta(days=rng.randint(20, 40))
    p.text((W - M, 74), f"Issued {issued.strftime('%B %d, %Y').replace(' 0', ' ')}", font("arial", 18), (230, 236, 240), "ra")
    y = 146
    info = [("Member", eob.get("memberName") or ""), ("ID", eob.get("memberId") or ""), ("Plan", er.plan_name(eob)),
            ("Claim", eob.get("claimNumber") or ""), ("Provider", eob.get("providerName") or ""),
            ("Visit", us_date(eob.get("serviceDateFrom")) + ("" if eob.get("serviceDateTo") == eob.get("serviceDateFrom") else f" to {us_date(eob.get('serviceDateTo'))}"))]
    net = {"in": "In network", "out": "Out of network"}.get(eob.get("network"))
    if net:
        info.append(("Network", net))
    info.append(("Status", STATUS.get(eob.get("claimStatus"), "")))
    for k, (a, b) in enumerate(info):
        x = M + (k % 2) * 580
        yy = y + (k // 2) * 30
        p.text((x, yy), a, font("arial", 17), (100, 104, 110))
        p.text((x + 110, yy), b, font("arialb", 17))
    y += ((len(info) + 1) // 2) * 30 + 16
    # Summary strip.
    p.d.rounded_rectangle([M, y, W - M, y + 100], radius=12, fill=(242, 245, 247))
    cells = [("Billed by provider", amt(eob.get("totalBilled"))), ("Your plan paid", amt(eob.get("totalPlanPaid"), pending)),
             ("Your responsibility", amt(eob.get("totalPatientOwes"), pending))]
    for k, (a, b) in enumerate(cells):
        x = M + 24 + k * 380
        p.text((x, y + 16), a, font("arial", 17), (100, 104, 110))
        p.text((x, y + 44), b, font("arialb", 30 if k == 2 else 26), c if k == 2 else (28, 28, 30))
    y += 124
    rows = []
    lines = eob.get("lines") or []
    bw = (W - 2 * M - 24) // 2
    split = bool(shares) and len(lines) <= 6  # the cost-share rows only fit with up to 3 rows of boxes
    bh = 262 if split else 210
    for n, l in enumerate(lines):
        col = n % 2
        x0 = M + col * (bw + 24)
        if col == 0 and n:
            y += bh + 18
        if y + bh > H - 150:
            raise ValueError("blocks layout ran out of room")
        p.d.rounded_rectangle([x0, y, x0 + bw, y + bh], radius=10, outline=(200, 205, 210), width=2)
        head = f"{l.get('description') or ''}"
        p.text((x0 + 16, y + 12), p.fit(head, font("arialb", 18), bw - 180), font("arialb", 18))
        p.text((x0 + bw - 16, y + 14), f"{us_date(l.get('date'))}  {l.get('code') or ''}", font("arial", 15), (100, 104, 110), "ra")
        items = [("Amount billed", l.get("billed")), ("Plan discount", None if l.get("allowed") is None or l.get("billed") is None else round(l["billed"] - l["allowed"], 2)),
                 ("Allowed amount", l.get("allowed")), ("Not covered", l.get("notCovered"))]
        if split and n < len(shares) and shares[n]:
            s = shares[n]
            items += [("Deductible", s["deductible"]), ("Copay", s["copay"]), ("Coinsurance", s["coinsurance"])]
        items += [("Plan paid", l.get("planPaid")), ("You owe", l.get("patientOwes"))]
        yy = y + 44
        for a, v in items:
            last = a == "You owe"
            p.text((x0 + 16, yy), a, font("arialb" if last else "arial", 16))
            txt = "Pending" if pending and a != "Amount billed" else ("--" if v is None else f"${money(v)}")
            b = p.rtext(x0 + bw - 16, yy - 1, txt, font("arialb" if last else "arial", 16))
            if last:
                rows.append({"page": 0, "line": n, "row": (x0, yy - 4, x0 + bw, yy + 22), "charge": b})
            yy += 22
        if l.get("remark"):
            p.text((x0 + 16, yy + 2), p.fit(f"Note: {l['remark']}", font("arial", 13), bw - 32), font("arial", 13), (150, 40, 30))
    y += bh + 24
    for s in [f"Questions? Call {eob.get('insurerPhone') or ''}. To appeal ({eob.get('appealDeadline') or ''}), write to:",
              eob.get("appealAddress") or ""]:
        p.text((M, y), s, font("arial", 15), (80, 84, 90))
        y += 22
    if pending:
        p.text((M, y + 6), "We are still processing this claim. Please don't pay the provider until we finish.", font("arialb", 16), (150, 40, 30))
    layouts.watermark(p)
    return p.img, rows


def dense(eob: dict, shares: list | None, rng: random.Random, second: dict | None = None) -> tuple[Image.Image, list[dict]]:
    p = Page()
    c = color_of(eob)
    M = 40
    pending = eob.get("claimStatus") == "pending"
    p.text((M, 40), (eob.get("payer") or "").upper(), font("narrowb", 30), c)
    p.text((M, 78), f"EXPLANATION OF BENEFITS  -  {er.plan_name(eob)}", font("narrow", 19), (60, 60, 64))
    p.text((W - M, 40), "THIS IS NOT A BILL", font("narrowb", 22), (60, 60, 64), "ra")
    p.text((W - M, 70), f"Member: {(eob.get('memberName') or '').upper()}   ID {eob.get('memberId') or ''}", font("narrow", 17), (60, 60, 64), "ra")
    p.rule(104, M, W - M, c, 3)
    y = 120

    def claim(ce: dict, csh: list | None, y: int, label: str) -> tuple[int, list]:
        rows = []
        pend = ce.get("claimStatus") == "pending"
        net = {"in": "IN-NETWORK", "out": "OUT-OF-NETWORK", "unknown": ""}.get(ce.get("network"), "")
        p.d.rectangle([M, y, W - M, y + 30], fill=(236, 238, 240))
        hdr = f"{label}  CLAIM {ce.get('claimNumber') or ''}   PROVIDER: {ce.get('providerName') or ''}   {net}"
        p.text((M + 8, y + 6), p.fit(hdr, font("narrowb", 16), W - 2 * M - 220), font("narrowb", 16))
        p.text((W - M - 8, y + 6), f"STATUS: {STATUS.get(ce.get('claimStatus'), '').upper()}", font("narrowb", 16), (40, 40, 44), "ra")
        y += 38
        cols = [("SERVICE", "DATE", M + 4, "la"), ("PROC", "CODE", M + 100, "la"), ("DESCRIPTION", "", M + 176, "la"),
                ("CHARGED", "", 560, "ra"), ("NOT", "PAYABLE", 640, "ra"), ("REASON", "", 700, "ra"), ("PLAN", "ALLOWS", 790, "ra"),
                ("DEDUCT", "", 870, "ra"), ("COPAY", "", 940, "ra"), ("COINS", "", 1015, "ra"), ("PLAN", "PAYS", 1105, "ra"),
                ("YOUR", "SHARE", W - M - 4, "ra")]
        for a, b, x, al in cols:
            p.text((x, y), a, font("narrowb", 13), (60, 60, 64), al)
            if b:
                p.text((x, y + 15), b, font("narrowb", 13), (60, 60, 64), al)
        y += 36
        p.rule(y, M, W - M, (60, 60, 64), 1)
        reasons: dict[str, str] = {}
        f_r, f_n = font("narrow", 15), font("courier", 15)
        for n, l in enumerate(ce.get("lines") or []):
            s = csh[n] if csh and n < len(csh) and csh[n] else None
            r = l.get("remark")
            letter = ""
            if r:
                letter = reasons.setdefault(r, "ABCDEFGH"[len(reasons)])
            vals = [us_date(l.get("date"), "%m/%d/%y"), l.get("code") or "", l.get("description") or "",
                    money(l.get("billed")), money(l.get("notCovered")) if l.get("notCovered") is not None else "", letter,
                    money(l.get("allowed")) if l.get("allowed") is not None else "",
                    money(s["deductible"]) if s else "", money(s["copay"]) if s else "", money(s["coinsurance"]) if s else "",
                    money(l.get("planPaid")) if l.get("planPaid") is not None else "", money(l.get("patientOwes")) if l.get("patientOwes") is not None else ""]
            if pend:
                vals = vals[:4] + ["", "", "PEND", "", "", "", "PEND", "PEND"]
            for (a, b, x, al), v in zip(cols, vals):
                fnt = f_n if al == "ra" and a not in ("REASON",) else f_r
                if a == "DESCRIPTION":
                    v = p.fit(v, f_r, 560 - 90 - x)
                if al == "ra":
                    bx = p.rtext(x, y + 6, v, fnt)
                else:
                    p.text((x, y + 6), v, fnt)
                    bx = None
                if a == "YOUR":
                    rows.append({"page": 0, "line": n, "row": (M, y, W - M, y + 26), "charge": bx})
            y += 26
        p.rule(y, M, W - M, (60, 60, 64), 2)
        tot = [ce.get("totalBilled"), None, None, ce.get("totalAllowed"), None, None, None, ce.get("totalPlanPaid"), ce.get("totalPatientOwes")]
        p.text((M + 176, y + 6), "CLAIM TOTALS", font("narrowb", 15))
        for (a, b, x, al), v in zip([cols[3], cols[4], cols[5], cols[6], cols[7], cols[8], cols[9], cols[10], cols[11]], tot):
            if v is not None or (pend and a in ("PLAN", "YOUR")):
                p.rtext(x, y + 6, "PEND" if pend and a in ("PLAN", "YOUR") else money(v), font("courierb", 15))
        y += 34
        for r, letter in reasons.items():
            p.text((M + 8, y), f"{letter}  {r}", font("narrow", 14), (60, 60, 64))
            y += 20
        return y + 14, rows

    y, rows = claim(eob, shares, y, "CLAIM 1 OF 2" if second else "")
    if second:
        y, _ = claim(second, None, y + 6, "CLAIM 2 OF 2")
    p.d.rectangle([M, y, W - M, y + 60], outline=c, width=2)
    p.text((M + 14, y + 10), "Total you may owe for the claim(s) on this statement is shown in YOUR SHARE. Pay the provider only after you get their bill.",
           font("narrow", 15), (60, 60, 64))
    p.text((M + 14, y + 32), f"Appeals: {eob.get('appealDeadline') or ''} - {eob.get('appealAddress') or ''}", font("narrow", 15), (60, 60, 64))
    y += 76
    p.text((M, y), f"Member Services {eob.get('insurerPhone') or ''} (TTY 711).  California DMHC Help Center 1-888-466-2219.", font("narrow", 15), (60, 60, 64))
    layouts.watermark(p)
    return p.img, rows


def letter(eob: dict, shares: list | None, rng: random.Random, **_) -> tuple[Image.Image, list[dict]]:
    p = Page()
    c = color_of(eob)
    M = 96
    p.text((M, 60), eob.get("payer") or "", font("georgiab", 28), c)
    p.text((M, 98), "Claims Department", font("georgia", 17), (90, 90, 96))
    issued = date.fromisoformat(eob["serviceDateTo"]) + timedelta(days=rng.randint(20, 40))
    p.text((M, 150), issued.strftime("%B %d, %Y").replace(" 0", " "), font("georgia", 18))
    y = 188
    for s in [(eob.get("memberName") or "").upper(), f"Member ID {eob.get('memberId') or ''}"]:
        p.text((M, y), s, font("georgia", 18))
        y += 26
    y += 16
    st = eob.get("claimStatus")
    title = {"denied": "Notice of Claim Denial", "pending": "Claim Status Notice", "partly_denied": "Explanation of Benefits: Claim Decision"}.get(st, "Explanation of Benefits")
    p.text((M, y), title, font("georgiab", 22))
    y += 40
    span = us_date(eob.get("serviceDateFrom"))
    body = {
        "denied": f"We reviewed the claim from {eob.get('providerName')} for services on {span} (claim {eob.get('claimNumber')}). We are not able to pay this claim. The reason is shown below.",
        "pending": f"We received the claim from {eob.get('providerName')} for services on {span} (claim {eob.get('claimNumber')}). It is still in process. You do not need to pay the provider until we finish our review.",
    }.get(st, f"We processed the claim from {eob.get('providerName')} for services on {span} (claim {eob.get('claimNumber')}). Here is what we paid and what you may owe the provider.")
    net = {"in": " The provider is in your plan's network.", "out": " The provider is not in your plan's network (out-of-network)."}.get(eob.get("network"), "")
    if eob.get("emergency"):
        net += " This was emergency care."
    y = layouts.para(p, "Dear Member: " + body + net + " This is not a bill.", M, y, W - 2 * M, font("georgia", 18))
    y += 18
    pending = st == "pending"
    cols = [("Date", M + 4, "la"), ("Service", M + 120, "la"), ("Billed", 700, "ra"), ("Plan allowed", 840, "ra"), ("Plan paid", 980, "ra"), ("You may owe", W - M - 4, "ra")]
    p.rule(y, M, W - M, (30, 30, 30), 2)
    for t, x, a in cols:
        p.text((x, y + 8), t, font("georgiab", 15), (30, 30, 30), a)
    y += 34
    p.rule(y, M, W - M, (30, 30, 30), 1)
    rows = []
    for n, l in enumerate(eob.get("lines") or []):
        p.text((M + 4, y + 7), us_date(l.get("date")), font("georgia", 16))
        p.text((M + 120, y + 7), p.fit(f"{l.get('code') or ''} {l.get('description') or ''}", font("georgia", 16), 440), font("georgia", 16))
        vals = [l.get("billed"), l.get("allowed"), l.get("planPaid"), l.get("patientOwes")]
        for (t, x, a), v in zip(cols[2:], vals):
            txt = "Pending" if pending and t != "Billed" else ("-" if v is None else money(v))
            b = p.rtext(x, y + 7, txt, font("courier", 16))
        rows.append({"page": 0, "line": n, "row": (M, y, W - M, y + 30), "charge": b})
        y += 30
    p.rule(y, M, W - M, (30, 30, 30), 2)
    p.text((M + 120, y + 8), "Total", font("georgiab", 16))
    for (t, x, a), v in zip(cols[2:], [eob.get("totalBilled"), eob.get("totalAllowed"), eob.get("totalPlanPaid"), eob.get("totalPatientOwes")]):
        p.rtext(x, y + 8, "Pending" if pending and t != "Billed" else ("-" if v is None else money(v)), font("courierb", 16))
    y += 44
    rem = []
    for l in eob.get("lines") or []:
        if l.get("remark") and l["remark"] not in rem:
            rem.append(l["remark"])
    for r in rem:
        y = layouts.para(p, f"Reason: {r}", M, y, W - 2 * M, font("georgia", 16))
    y += 10
    y = layouts.para(p, f"If you disagree, you may appeal {eob.get('appealDeadline') or ''}. Send your appeal to {eob.get('appealAddress') or ''}. "
                     f"Call us at {eob.get('insurerPhone') or ''}. You can also contact the California Department of Managed Health Care at 1-888-466-2219.",
                     M, y, W - 2 * M, font("georgia", 15))
    layouts.watermark(p)
    return p.img, rows


def classic(eob: dict, shares: list | None, rng: random.Random, **_) -> tuple[Image.Image, list[dict]]:
    img = er.render_page(eob, shares, rng.randint(0, 9999))
    return img, []


RENDER = {"classic": classic, "blocks": blocks, "dense": dense, "letter": letter}


def second_claim(eob: dict, rng: random.Random) -> dict:
    """The ER doctors' own claim, printed on the same statement: not the hospital's claim."""
    day = eob["serviceDateFrom"]
    billed = float(rng.choice([1180, 1420, 1650, 2210]))
    allowed = round(billed * rng.uniform(0.3, 0.45), 2)
    owes = round(min(allowed, rng.choice([0, 75, 150, 250])), 2)
    l = {"date": day, "code": rng.choice(["99284", "99285"]), "description": "ER physician visit", "billed": billed, "allowed": allowed,
         "planPaid": round(allowed - owes, 2), "patientOwes": owes, "notCovered": 0.0, "remark": None}
    return {**eob, "claimNumber": f"{rng.randint(20, 26)}{rng.randint(10**10, 10**11 - 1)}", "providerName": rng.choice(eg.OTHER_PROVIDERS),
            "claimStatus": "processed", "lines": [l], "totalBilled": billed, "totalAllowed": allowed, "totalPlanPaid": l["planPaid"], "totalPatientOwes": owes}


def generate() -> None:
    mrfs = prices.load_all()
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("he-*"):
        old.unlink()
    manifest = []
    for split, (seed, kinds) in SPLITS.items():
        rng = random.Random(seed)
        kinds = list(kinds)
        rng.shuffle(kinds)
        dense_seen = 0
        for n, kind in enumerate(kinds, 1):
            pid = f"he-{split[0]}{n:02d}"
            key = rng.choice(list(prices.HOSPITALS))
            for _ in range(50):
                pr = eg.build(kind, rng, key, mrfs.get(key))
                if len(pr["eob"]["lines"]) > 8:
                    continue  # keep EOBs to one page in every layout
                if kind not in eg.NEEDS_PAYMENT or (pr["eob"]["totalPlanPaid"] >= 1 and pr["bill"]["amountDue"] >= 1):
                    break
            bill = pr["bill"]
            bill.pop("_sources"), bill.pop("_scenario")
            found = check_eob(bill, pr["eob"])
            want = list(zip(eg.WANT[kind], eg.planted_amounts(pr)))
            if [(f["kind"], f["amount"]) for f in found] != want:
                raise SystemExit(f"{pid} ({kind}): planted {want} but eobchecks finds {found}")
            eob_layout = EOB_LAYOUTS[(n + (0 if split == "dev" else 2)) % len(EOB_LAYOUTS)]
            two = eob_layout == "dense" and dense_seen % 2 == 0  # the 1st and 3rd dense EOB of a split carry a 2nd claim
            dense_seen += eob_layout == "dense"
            extra = {"second": second_claim(pr["eob"], rng)} if two else {}
            img, rows = RENDER[eob_layout](pr["eob"], pr["shares"], rng, **extra)
            econds = [rng.choice(PHOTO)] + ([rng.choice(INK)] if rng.random() < 0.6 else [])
            if rng.random() < 0.4:
                econds.append(rng.choice([c for c in PHOTO if c not in econds]))
            econds = sorted(set(econds), key=cond.ALL.index)
            fake = layouts.Rendered([img], [], rows, protect=[{"page": 0, "box": (40, 30, W - 40, H - 60)}])
            eimgs, elog = cond.apply(fake, econds, rng, "photo")
            efile = f"{pid}.eob.p1.jpg"
            eimgs[0].save(OUT / efile, quality=rng.randint(78, 88), optimize=True)
            # The bill: the classic or the epic layout, a photo with one condition, or a clean scan.
            bill_layout = rng.choice(["classic", "epic"])
            r = layouts.LAYOUTS[bill_layout](bill, rng)
            if r.order != list(range(len(r.order))):
                bill["lines"] = [bill["lines"][i] for i in r.order]
            bmedium = rng.choice(["photo", "photo", "scan"])
            bconds = [rng.choice(["perspective", "shadow", "fold", "crumple", "glare"])] if bmedium == "photo" else []
            bimgs, blog = cond.apply(r, bconds, rng, bmedium)
            bfile = f"{pid}.bill.p1.jpg"
            bimgs[0].save(OUT / bfile, quality=85, optimize=True)
            # Re-check: printed order can't change any EOB finding except NOT_ON_EOB's line index.
            found = check_eob(bill, pr["eob"])
            truth = {"id": pid, "split": split, "kind": kind, "note": pr["note"], "hospitalKey": key, "plan": pr["plan"],
                     "planType": pr["planType"], "network": pr["network"], "eobLayout": eob_layout, "secondClaim": two,
                     "eobConditions": econds, "eobConditionLog": elog, "billLayout": bill_layout, "billMedium": bmedium,
                     "billConditions": bconds, "billConditionLog": blog, "files": {"eob": efile, "bill": bfile},
                     "ref": f"../hard/refs/{key}.json", "bill": bill, "eob": pr["eob"], "shares": pr["shares"],
                     "expect": [{"kind": k, "amount": a} for k, a in want], "findings": found}
            (OUT / f"{pid}.truth.json").write_text(json.dumps(truth, indent=1))
            manifest.append({"id": pid, "split": split, "kind": kind, "eobLayout": eob_layout, "secondClaim": two, "eobConditions": econds,
                             "billLayout": bill_layout, "expect": [k for k, _ in want]})
            print(f"{pid} {split:7} {kind:18} eob {eob_layout:7}{' +2nd claim' if two else '':11} {'+'.join(econds):28} bill {bill_layout} {bmedium} {'+'.join(bconds)}")
    (OUT / "manifest.json").write_text(json.dumps({"pairs": manifest}, indent=1))
    print("planted:", dict(Counter(e for m in manifest for e in m["expect"])))


def main() -> None:
    argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter).parse_args()
    generate()


if __name__ == "__main__":
    main()
