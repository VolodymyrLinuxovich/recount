"""Bill layouts for the hard eval: six ways a California hospital bill can look on paper.

  classic     the bill eval's own statement (../render.py)
  epic        an itemized statement like big hospital billing systems print: lines grouped by revenue
              code with a subtotal per group, then a separate payments and adjustments table
  summary     a summary statement with revenue codes and department totals only, no CPT codes
  multipage   an itemized statement over 2 to 4 pages, a page subtotal at the foot of each page and
              the total only on the last page
  ub04        a UB-04-like claim form: red form lines, MMDDYY dates, dollars and cents in separate boxes
  collection  a collection agency letter, with the hospital's itemization or with only the balance

Every layout takes a ParsedBill and returns a Rendered: the page images, the order the lines were
printed in (indexes into bill["lines"]) and where each line and the total sit on the page, so the
photo conditions (conditions.py) can circle a charge or stain a row.

Everything here is fictional: patients, account numbers, the collection agency. The hospital names,
addresses and phone numbers are the real billing contacts the bill eval already uses.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from prices import HOSPITALS

W, H = 1275, 1650  # letter at 150 dpi

FONT_DIRS = ["/System/Library/Fonts/Supplemental", "/System/Library/Fonts", "/Library/Fonts", "/usr/share/fonts/truetype/dejavu"]
FONTS = {
    "arial": ["Arial.ttf", "DejaVuSans.ttf"],
    "arialb": ["Arial Bold.ttf", "DejaVuSans-Bold.ttf"],
    "narrow": ["Arial Narrow.ttf", "DejaVuSansCondensed.ttf", "DejaVuSans.ttf"],
    "narrowb": ["Arial Narrow Bold.ttf", "DejaVuSansCondensed-Bold.ttf", "DejaVuSans-Bold.ttf"],
    "verdana": ["Verdana.ttf", "DejaVuSans.ttf"],
    "verdanab": ["Verdana Bold.ttf", "DejaVuSans-Bold.ttf"],
    "georgia": ["Georgia.ttf", "DejaVuSerif.ttf"],
    "georgiab": ["Georgia Bold.ttf", "DejaVuSerif-Bold.ttf"],
    "times": ["Times New Roman.ttf", "DejaVuSerif.ttf"],
    "timesb": ["Times New Roman Bold.ttf", "DejaVuSerif-Bold.ttf"],
    "courier": ["Courier New.ttf", "DejaVuSansMono.ttf"],
    "courierb": ["Courier New Bold.ttf", "DejaVuSansMono-Bold.ttf"],
    "hand": ["Bradley Hand Bold.ttf", "DejaVuSans-Oblique.ttf"],
    "marker": ["MarkerFelt.ttc", "Noteworthy.ttc", "DejaVuSans-Oblique.ttf"],
    "note": ["Noteworthy.ttc", "Chalkboard.ttc", "DejaVuSans-Oblique.ttf"],
}
_font_cache: dict = {}


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    k = (kind, size)
    if k not in _font_cache:
        for d in FONT_DIRS:
            hit = next((Path(d) / f for f in FONTS[kind] if (Path(d) / f).exists()), None)
            if hit:
                _font_cache[k] = ImageFont.truetype(str(hit), size)
                break
        else:
            _font_cache[k] = ImageFont.load_default(size)
    return _font_cache[k]


def money(x: float | None) -> str:
    return "" if x is None else f"{x:,.2f}"


def us_date(iso: str | None, fmt: str = "%m/%d/%Y") -> str:
    return date.fromisoformat(iso).strftime(fmt) if iso else ""


def hospital_info(bill: dict) -> dict:
    name = (bill.get("hospitalName") or "").lower()
    for h in HOSPITALS.values():
        if h["name"].lower() == name or h["short"].lower() in name:
            return h
    return {"name": bill.get("hospitalName") or "", "short": bill.get("hospitalName") or "", "address": "",
            "phone": bill.get("billingPhone"), "website": None}


@dataclass
class Rendered:
    pages: list[Image.Image]
    order: list[int]  # printed position -> index in bill["lines"]
    rows: list[dict] = field(default_factory=list)  # {page, line (printed position), row: box, charge: box}
    total: dict | None = None  # {page, box} of the printed total charges
    due: dict | None = None  # {page, box} of the printed amount due
    protect: list[dict] = field(default_factory=list)  # {page, box}: content a crop must keep
    notes: list[str] = field(default_factory=list)  # what is unusual about this rendering


class Page:
    def __init__(self, bg=(255, 255, 255)):
        self.img = Image.new("RGB", (W, H), bg)
        self.d = ImageDraw.Draw(self.img)

    def text(self, xy, s, f, fill=(28, 28, 30), anchor="la"):
        self.d.text(xy, s, font=f, fill=fill, anchor=anchor)

    def rtext(self, x, y, s, f, fill=(28, 28, 30)) -> tuple:
        """Right-aligned text; returns its box."""
        self.d.text((x, y), s, font=f, fill=fill, anchor="ra")
        w = self.d.textlength(s, font=f)
        return (x - w, y, x, y + f.size)

    def rule(self, y, x0, x1, fill=(170, 170, 175), width=1):
        self.d.line([(x0, y), (x1, y)], fill=fill, width=width)

    def fit(self, s: str, f, width: float) -> str:
        while s and self.d.textlength(s, font=f) > width:
            s = s[:-1]
        return s


def watermark(p: Page, x=W - 70, y=H - 44, fill=(190, 60, 60)) -> None:
    p.text((x, y), "SAMPLE — fictional patient", font("arialb", 14), fill, "ra")


def group_order(lines: list[dict], key) -> list[int]:
    """Line indexes grouped by key, groups in order of first appearance, stable inside a group."""
    groups: dict = {}
    for i, l in enumerate(lines):
        groups.setdefault(key(l), []).append(i)
    return [i for g in groups.values() for i in g]


REV_NAMES = {
    "0450": "EMERGENCY ROOM", "0300": "LABORATORY", "0301": "LAB - CHEMISTRY", "0305": "LAB - HEMATOLOGY",
    "0307": "LAB - UROLOGY", "0320": "DX X-RAY", "0351": "CT SCAN - HEAD", "0352": "CT SCAN - BODY",
    "0260": "IV THERAPY", "0258": "PHARMACY - IV SOLUTIONS", "0636": "DRUGS REQUIRING DETAIL CODING",
    "0730": "EKG/ECG", "0250": "PHARMACY", "0762": "OBSERVATION ROOM",
}


# ---------- classic: the bill eval's renderer -------------------------------------------------

def classic(bill: dict, rng: random.Random) -> Rendered:
    import render as base  # ../render.py

    pages = base.render_pages(bill)
    lines = bill["lines"]
    rows = []
    for n in range(len(lines)):
        y = 440 + 32 * n
        rows.append({"page": 0, "line": n, "row": (70, y, W - 70, y + 32), "charge": (W - 70 - 140, y + 4, W - 74, y + 28)})
    y_end = 440 + 32 * len(lines) + 14 + 10
    return Rendered(pages, list(range(len(lines))), rows,
                    total={"page": 0, "box": (W - 70 - 160, y_end, W - 74, y_end + 26)},
                    due={"page": 0, "box": (W - 70 - 200, y_end + 130, W - 74, y_end + 160)},
                    protect=[{"page": 0, "box": (70, 60, W - 70, y_end + 170)}])


# ---------- epic-style itemized statement ------------------------------------------------------

TEAL = (16, 86, 102)


def epic(bill: dict, rng: random.Random) -> Rendered:
    lines = bill["lines"]
    order = group_order(lines, lambda l: l.get("revCode") or "0999")
    h = hospital_info(bill)
    p = Page()
    M = 64
    f_s, f_b = font("verdana", 15), font("verdanab", 15)
    p.text((M, 52), h["name"], font("verdanab", 23 if len(h["name"]) < 50 else 19), TEAL)
    p.text((M, 86), "Hospital Billing Services", font("verdana", 16), (90, 96, 104))
    p.text((M, 110), h.get("address") or "", f_s, (90, 96, 104))
    p.text((M, 132), f"Customer Service {bill.get('billingPhone') or h.get('phone') or ''}   Mon-Fri 8am-5pm", f_s, (90, 96, 104))
    # Right: statement box.
    bx0, bx1 = W - M - 420, W - M
    p.d.rectangle([bx0, 48, bx1, 230], outline=TEAL, width=2)
    p.d.rectangle([bx0, 48, bx1, 82], fill=TEAL)
    p.text(((bx0 + bx1) // 2, 65), "ITEMIZED STATEMENT OF ACCOUNT", font("verdanab", 15), "white", "mm")
    guar = f"{rng.randint(10**6, 10**7 - 1)}"
    rows_r = [("Statement Date", us_date(bill.get("statementDate"))), ("Guarantor #", guar),
              ("Hospital Account #", bill.get("accountNumber") or ""),
              ("Due Date", us_date((date.fromisoformat(bill["statementDate"]) + timedelta(days=28)).isoformat()))]
    y = 92
    for k, v in rows_r:
        p.text((bx0 + 12, y), k, f_s, (90, 96, 104))
        p.rtext(bx1 - 12, y, v, f_b)
        y += 26
    p.text((bx0 + 12, y + 6), "Please Pay", font("verdanab", 17))
    due_box = p.rtext(bx1 - 12, y + 2, f"${money(bill.get('amountDue'))}", font("verdanab", 22))
    # Patient strip.
    y = 262
    p.d.rectangle([M, y, W - M, y + 74], fill=(238, 244, 246))
    dates = sorted({l["date"] for l in lines if l.get("date")}) or [bill.get("serviceDate")]
    cells = [("Patient", (bill.get("patientName") or "").upper()), ("MRN", f"{rng.randint(10**7, 10**8 - 1)}"),
             ("Admit", us_date(dates[0])), ("Discharge", us_date(dates[-1])), ("Account Class", "Emergency")]
    x = M + 14
    for k, v in cells:
        p.text((x, y + 10), k, font("verdana", 13), (90, 96, 104))
        p.text((x, y + 32), v, font("verdanab", 15))
        x += 160 if k != "Patient" else 300
    p.text((M + 14, y + 54), f"Primary Plan: {bill.get('insurancePayer') or 'Self-Pay'}", font("verdana", 13), (90, 96, 104))

    # Charges table, grouped by revenue code.
    y = 360
    p.text((M, y), "Charges", font("verdanab", 18), TEAL)
    y += 30
    cols = [("Svc Date", M + 8, "la"), ("Rev Cd", M + 126, "la"), ("Proc Code", M + 206, "la"), ("Description", M + 316, "la"),
            ("Qty", W - M - 200, "ra"), ("Amount", W - M - 10, "ra")]
    p.d.rectangle([M, y, W - M, y + 28], fill=(220, 232, 236))
    for t, x, a in cols:
        p.text((x, y + 6), t, font("verdanab", 13), (30, 40, 48), a)
    y += 30
    f_r, f_n = font("verdana", 14), font("courier", 17)
    rows = []
    pos = 0
    groups: list[list[int]] = []
    for i in order:
        rc = lines[i].get("revCode") or "0999"
        if not groups or (lines[groups[-1][0]].get("revCode") or "0999") != rc:
            groups.append([])
        groups[-1].append(i)
    for g in groups:
        rc = lines[g[0]].get("revCode") or "0999"
        p.text((M + 8, y + 5), f"{rc}  {REV_NAMES.get(rc, 'OTHER SERVICES')}", font("verdanab", 13), TEAL)
        y += 24
        sub = 0.0
        for i in g:
            l = lines[i]
            p.text((cols[0][1], y + 5), us_date(l.get("date")), f_r)
            p.text((cols[1][1], y + 5), l.get("revCode") or "", f_r)
            p.text((cols[2][1], y + 5), l.get("code") or "", f_r)
            p.text((cols[3][1], y + 5), p.fit(l["description"], f_r, W - M - 260 - cols[3][1]), f_r)
            p.rtext(cols[4][1], y + 4, f"{l.get('quantity', 1):g}", f_n)
            cb = p.rtext(cols[5][1], y + 4, money(l["charge"]), f_n)
            rows.append({"page": 0, "line": pos, "row": (M, y, W - M, y + 26), "charge": cb})
            sub += l["charge"]
            pos += 1
            y += 26
        p.rule(y + 2, W - M - 190, W - M, (120, 130, 136))
        p.text((W - M - 380, y + 7), f"Subtotal {rc}", font("verdana", 13), (90, 96, 104))
        p.rtext(cols[5][1], y + 6, money(round(sub, 2)), font("courier", 16), (90, 96, 104))
        y += 32
    p.rule(y, M, W - M, (30, 40, 48), 2)
    p.text((W - M - 380, y + 10), "Total Charges", font("verdanab", 15))
    tb = p.rtext(cols[5][1], y + 9, money(bill.get("totalCharges")), font("courierb", 18))
    y += 46

    # Payments and adjustments, as their own table: these are not charges.
    tx = []
    stmt = date.fromisoformat(bill["statementDate"])
    if bill.get("insurancePaid"):
        tx.append(((stmt - timedelta(days=12)).isoformat(), f"Insurance Payment - {bill.get('insurancePayer') or 'Insurance'}", -bill["insurancePaid"]))
    if bill.get("adjustments"):
        tx.append(((stmt - timedelta(days=12)).isoformat(), "Contractual Adjustment", -bill["adjustments"]))
    if bill.get("patientPaid"):
        tx.append(((stmt - timedelta(days=20)).isoformat(), "Patient Payment - Thank You", -bill["patientPaid"]))
    p.text((M, y), "Payments and Adjustments", font("verdanab", 18), TEAL)
    y += 30
    p.d.rectangle([M, y, W - M, y + 26], fill=(220, 232, 236))
    for t, x, a in [("Post Date", M + 8, "la"), ("Description", M + 206, "la"), ("Amount", W - M - 10, "ra")]:
        p.text((x, y + 5), t, font("verdanab", 13), (30, 40, 48), a)
    y += 28
    if not tx:
        p.text((M + 206, y + 5), "No payments or adjustments this period", f_r, (90, 96, 104))
        y += 26
    for d, desc, amt in tx:
        p.text((M + 8, y + 5), us_date(d), f_r)
        p.text((M + 206, y + 5), desc, f_r)
        p.rtext(W - M - 10, y + 4, f"({money(-amt)})", f_n)
        y += 26
    y += 12
    # Account summary.
    sx0 = W - M - 470
    p.d.rectangle([sx0, y, W - M, y + 150], outline=TEAL, width=2)
    summ = [("Total Charges", money(bill.get("totalCharges"))), ("Total Payments", f"({money((bill.get('insurancePaid') or 0) + (bill.get('patientPaid') or 0))})"),
            ("Total Adjustments", f"({money(bill.get('adjustments') or 0)})")]
    yy = y + 12
    for k, v in summ:
        p.text((sx0 + 16, yy), k, f_s)
        p.rtext(W - M - 14, yy - 1, v, font("courier", 17))
        yy += 28
    p.rule(yy + 2, sx0 + 10, W - M - 10, TEAL, 2)
    p.text((sx0 + 16, yy + 14), "Account Balance", font("verdanab", 18))
    db = p.rtext(W - M - 14, yy + 10, f"${money(bill.get('amountDue'))}", font("verdanab", 22))
    protect_bottom = y + 160
    # Payment coupon at the bottom.
    cy = H - 250
    p.d.line([(M, cy), (W - M, cy)], fill=(140, 140, 140), width=1)
    for x in range(M, W - M, 14):
        p.d.line([(x, cy), (x + 7, cy)], fill="white", width=2)
    p.text((M, cy + 12), "Please detach and return this portion with your payment.", font("verdana", 13), (90, 96, 104))
    p.text((M, cy + 44), "Guarantor", font("verdana", 13), (90, 96, 104))
    p.text((M, cy + 64), (bill.get("patientName") or "").upper(), font("verdanab", 15))
    p.text((M + 380, cy + 44), "Hospital Account #", font("verdana", 13), (90, 96, 104))
    p.text((M + 380, cy + 64), bill.get("accountNumber") or "", font("verdanab", 15))
    p.text((M + 680, cy + 44), "Amount Due", font("verdana", 13), (90, 96, 104))
    p.text((M + 680, cy + 64), f"${money(bill.get('amountDue'))}", font("verdanab", 15))
    p.text((M + 680, cy + 104), "Amount Enclosed  $", font("verdana", 15))
    p.d.rectangle([M + 860, cy + 98, W - M, cy + 128], outline=(60, 60, 60), width=1)
    p.text((M, cy + 150), "Financial assistance is available. Ask for our Financial Assistance Policy (Health & Safety Code 127400).", font("verdana", 12), (90, 96, 104))
    watermark(p)
    return Rendered([p.img], order, rows, total={"page": 0, "box": tb}, due={"page": 0, "box": db},
                    protect=[{"page": 0, "box": (M, 48, W - M, protect_bottom)}],
                    notes=["lines grouped by revenue code with a subtotal row per group",
                           "payments and adjustments in their own table"])


# ---------- summary statement, revenue codes only ----------------------------------------------

NAVY = (30, 44, 84)


def summary(bill: dict, rng: random.Random) -> Rendered:
    lines = bill["lines"]
    h = hospital_info(bill)
    p = Page()
    M = 80
    p.text((W // 2, 60), h["name"], font("georgiab", 26 if len(h["name"]) < 48 else 21), NAVY, "ma")
    p.text((W // 2, 98), h.get("address") or "", font("georgia", 16), (80, 80, 90), "ma")
    p.text((W // 2, 122), f"Patient Financial Services  {bill.get('billingPhone') or h.get('phone') or ''}", font("georgia", 16), (80, 80, 90), "ma")
    p.rule(156, M, W - M, NAVY, 2)
    p.text((M, 176), "PATIENT STATEMENT", font("georgiab", 22), NAVY)
    left = [("Patient", bill.get("patientName") or ""), ("Account No.", bill.get("accountNumber") or ""),
            ("Dates of Service", us_date(bill.get("serviceDate"))), ("Insurance", bill.get("insurancePayer") or "None on file")]
    right = [("Statement Date", us_date(bill.get("statementDate"))), ("Patient Type", "Emergency Outpatient")]
    y = 218
    for k, v in left:
        p.text((M, y), k, font("georgia", 16), (80, 80, 90))
        p.text((M + 190, y), v, font("georgiab", 16))
        y += 28
    y2 = 218
    for k, v in right:
        p.text((W - M - 380, y2), k, font("georgia", 16), (80, 80, 90))
        p.rtext(W - M, y2, v, font("georgiab", 16))
        y2 += 28
    y = 350
    p.text((M, y), "Summary of Hospital Services", font("georgiab", 19), NAVY)
    y += 34
    p.rule(y, M, W - M, NAVY, 2)
    p.text((M + 6, y + 8), "Rev. Code", font("georgiab", 15))
    p.text((M + 150, y + 8), "Service Department", font("georgiab", 15))
    p.rtext(W - M - 6, y + 8, "Charges", font("georgiab", 15))
    y += 34
    p.rule(y, M, W - M, (150, 150, 160))
    rows = []
    for n, l in enumerate(lines):
        p.text((M + 6, y + 8), l.get("revCode") or "", font("georgia", 17))
        p.text((M + 150, y + 8), l["description"], font("georgia", 17))
        cb = p.rtext(W - M - 6, y + 7, money(l["charge"]), font("courier", 18))
        rows.append({"page": 0, "line": n, "row": (M, y, W - M, y + 34), "charge": cb})
        y += 34
        p.d.line([(M, y), (W - M, y)], fill=(215, 215, 222))
    y += 16
    tot = [("Total Hospital Charges", bill.get("totalCharges"), True), ("Insurance Payments", bill.get("insurancePaid") or 0, False),
           ("Adjustments", bill.get("adjustments") or 0, False), ("Patient Payments", bill.get("patientPaid") or 0, False)]
    tb = None
    for k, v, first in tot:
        p.text((W - M - 520, y), k, font("georgiab" if first else "georgia", 17))
        b = p.rtext(W - M - 6, y - 1, money(v) if first else (f"-{money(v)}" if v else "0.00"), font("courier", 18))
        tb = tb or b
        y += 30
    p.d.rectangle([W - M - 540, y + 4, W - M, y + 52], fill=(232, 236, 246))
    p.text((W - M - 520, y + 16), "AMOUNT YOU OWE", font("georgiab", 19), NAVY)
    db = p.rtext(W - M - 12, y + 14, f"${money(bill.get('amountDue'))}", font("georgiab", 22), NAVY)
    y += 80
    for s in ["This statement summarizes your charges by department. You have the right to request an itemized",
              "statement listing each service and its code, at no charge. Call Patient Financial Services.",
              "If you have no insurance or high medical costs, you may qualify for free or discounted care."]:
        p.text((M, y), s, font("georgia", 15), (80, 80, 90))
        y += 22
    watermark(p)
    return Rendered([p.img], list(range(len(lines))), rows, total={"page": 0, "box": tb}, due={"page": 0, "box": db},
                    protect=[{"page": 0, "box": (M, 56, W - M, y)}], notes=["summary only: revenue codes, no CPT/HCPCS"])


# ---------- multi-page itemized statement -----------------------------------------------------

def multipage(bill: dict, rng: random.Random, per_page: int | None = None) -> Rendered:
    lines = bill["lines"]
    h = hospital_info(bill)
    per = per_page or rng.choice([12, 13, 14])
    chunks = [list(range(i, min(i + per, len(lines)))) for i in range(0, len(lines), per)]
    if len(chunks) > 1 and len(chunks[-1]) < 3:  # keep a few lines with the totals
        chunks[-2], chunks[-1] = chunks[-2][:-3], chunks[-2][-3:] + chunks[-1]
    n = len(chunks)
    subtotals = rng.random() < 0.7
    pages, rows = [], []
    M = 60
    f_r, f_n = font("narrow", 18), font("courier", 18)
    total_box = due_box = None
    protect = []
    for k, chunk in enumerate(chunks):
        p = Page()
        if k == 0:
            p.text((M, 50), h["name"], font("narrowb", 28), (40, 40, 44))
            p.text((M, 86), h.get("address") or "", font("narrow", 18), (90, 90, 96))
            p.text((M, 110), f"Billing Office {bill.get('billingPhone') or h.get('phone') or ''}", font("narrow", 18), (90, 90, 96))
            p.text((W - M, 50), "DETAILED PATIENT BILL", font("narrowb", 26), (40, 40, 44), "ra")
            info = [("Statement date", us_date(bill.get("statementDate"))), ("Account", bill.get("accountNumber") or ""),
                    ("Patient", (bill.get("patientName") or "").upper()), ("Payer", bill.get("insurancePayer") or "SELF PAY")]
            yy = 92
            for a, b in info:
                p.text((W - M - 420, yy), a, font("narrow", 17), (90, 90, 96))
                p.rtext(W - M, yy, b, font("narrowb", 17))
                yy += 24
            p.text((M, 156), "Your balance and payment options are on the last page.", font("narrow", 17), (120, 50, 40))
            y = 210
        else:
            p.text((M, 50), f"{h['short'].upper()}  -  DETAILED PATIENT BILL (continued)", font("narrowb", 20), (40, 40, 44))
            p.text((M, 78), f"Patient: {(bill.get('patientName') or '').upper()}    Account: {bill.get('accountNumber') or ''}", font("narrow", 17), (90, 90, 96))
            y = 120
        p.text((W - M, 132 if k == 0 else 50), f"Page {k + 1} of {n}", font("narrowb", 17), (40, 40, 44), "ra")
        cols = [("DATE", M + 6, "la"), ("CODE", M + 120, "la"), ("REV", M + 214, "la"), ("DESCRIPTION", M + 290, "la"),
                ("UNITS", W - M - 200, "ra"), ("CHARGE", W - M - 8, "ra")]
        p.rule(y, M, W - M, (40, 40, 44), 2)
        for t, x, a in cols:
            p.text((x, y + 7), t, font("narrowb", 16), (40, 40, 44), a)
        y += 32
        p.rule(y, M, W - M, (40, 40, 44), 1)
        y0 = y
        sub = 0.0
        for i in chunk:
            l = lines[i]
            p.text((cols[0][1], y + 7), us_date(l.get("date")), f_r)
            p.text((cols[1][1], y + 7), l.get("code") or "", f_r)
            p.text((cols[2][1], y + 7), l.get("revCode") or "", f_r)
            p.text((cols[3][1], y + 7), p.fit(l["description"], f_r, W - M - 260 - cols[3][1]), f_r)
            p.rtext(cols[4][1], y + 6, f"{l.get('quantity', 1):g}", f_n)
            cb = p.rtext(cols[5][1], y + 6, money(l["charge"]), f_n)
            rows.append({"page": k, "line": i, "row": (M, y, W - M, y + 34), "charge": cb})
            sub += l["charge"]
            y += 34
            p.d.line([(M, y), (W - M, y)], fill=(222, 222, 226))
        if subtotals and k < n - 1:
            p.text((W - M - 420, y + 12), "Page subtotal", font("narrowb", 18))
            p.rtext(cols[5][1], y + 11, money(round(sub, 2)), font("courierb", 18))
            y += 40
        protect.append({"page": k, "box": (M, 46, W - M, y + 10)})
        if k < n - 1:
            p.text((W // 2, H - 120), "Continued on next page", font("narrowb", 18), (90, 90, 96), "mm")
        else:
            y += 24
            x0 = W - M - 460
            items = [("Total charges", bill.get("totalCharges")), ("Insurance payments", -(bill.get("insurancePaid") or 0)),
                     ("Adjustments", -(bill.get("adjustments") or 0)), ("Your payments", -(bill.get("patientPaid") or 0))]
            for a, v in items:
                p.text((x0, y), a, font("narrow", 19))
                b = p.rtext(W - M - 8, y - 1, money(v) if v else "0.00", font("courier", 19))
                if a == "Total charges":
                    total_box = {"page": k, "box": b}
                y += 30
            p.d.rectangle([x0 - 14, y + 4, W - M, y + 50], outline=(40, 40, 44), width=2)
            p.text((x0, y + 16), "BALANCE DUE", font("narrowb", 21))
            due_box = {"page": k, "box": p.rtext(W - M - 8, y + 13, f"${money(bill.get('amountDue'))}", font("narrowb", 23))}
            protect[-1]["box"] = (M, 46, W - M, y + 60)
            yy = y + 90
            for s in ["Pay online, by phone or by mail. Questions about this bill? Call the Billing Office.",
                      "You may qualify for free or discounted care under our Financial Assistance Policy."]:
                p.text((M, yy), s, font("narrow", 17), (90, 90, 96))
                yy += 24
        watermark(p)
        pages.append(p.img)
    notes = [f"{n} pages, total only on the last page"] + (["page subtotal at the foot of each page"] if subtotals else [])
    return Rendered(pages, list(range(len(lines))), rows, total=total_box, due=due_box, protect=protect, notes=notes)


# ---------- UB-04-like claim form ------------------------------------------------------------

FORM_RED = (196, 52, 52)


def ub04(bill: dict, rng: random.Random) -> Rendered:
    lines = bill["lines"]
    if len(lines) > 22:
        raise ValueError("ub04 holds 22 lines")
    h = hospital_info(bill)
    p = Page((255, 253, 250))
    M = 40
    lab, f_d, f_db = font("narrow", 11), font("courierb", 17), font("courierb", 18)
    red = FORM_RED

    def box(x0, y0, x1, y1, label=None):
        p.d.rectangle([x0, y0, x1, y1], outline=red, width=1)
        if label:
            p.text((x0 + 3, y0 + 2), label, lab, red)

    # Top block.
    box(M, 40, 520, 160, "1")
    yy = 54
    for s in [h["name"].upper()[:38], (h.get("address") or "").upper()[:38], (bill.get("billingPhone") or h.get("phone") or "")]:
        p.text((M + 16, yy), s, f_d)
        yy += 30
    box(520, 40, 860, 100, "3a PAT. CNTL #")
    p.text((530, 66), bill.get("accountNumber") or "", f_d)
    box(520, 100, 860, 160, "b. MED. REC. #")
    p.text((530, 126), f"{rng.randint(10**7, 10**8 - 1)}", f_d)
    box(860, 40, W - M, 100, "4 TYPE OF BILL")
    p.text((880, 66), "0131", f_d)
    box(860, 100, 1040, 160, "5 FED. TAX NO.")
    p.text((866, 126), f"94-{rng.randint(10**6, 10**7 - 1)}", f_d)
    dates = sorted({l["date"] for l in lines if l.get("date")}) or [bill.get("serviceDate")]
    box(1040, 100, W - M, 160, "6 STATEMENT COVERS PERIOD")
    p.text((1046, 126), f"{us_date(dates[0], '%m%d%y')} {us_date(dates[-1], '%m%d%y')}", f_d)
    box(M, 160, 640, 220, "8 PATIENT NAME")
    name = bill.get("patientName") or ""
    first, _, last = name.partition(" ")
    p.text((M + 16, 186), f"{last.upper()}, {first.upper()}", f_d)
    box(640, 160, W - M, 220, "9 PATIENT ADDRESS")
    p.text((650, 186), "SAMPLE ADDRESS  SAN FRANCISCO  CA 94110", f_d)
    box(M, 220, 260, 280, "10 BIRTHDATE")
    p.text((M + 16, 246), f"{rng.randint(1, 12):02d}{rng.randint(1, 28):02d}{rng.randint(1950, 2004)}", f_d)
    box(260, 220, 420, 280, "13 ADMISSION HR")
    p.text((276, 246), f"{rng.randint(0, 23):02d}", f_d)
    box(420, 220, 600, 280, "14 TYPE")
    p.text((436, 246), "1", f_d)
    box(600, 220, W - M, 280, "OCCURRENCE / CONDITION CODES")

    # Line grid, fields 42-48.
    gy = 300
    cols = [(M, 112, "42 REV. CD."), (112, 470, "43 DESCRIPTION"), (470, 650, "44 HCPCS / RATE / HIPPS CODE"),
            (650, 770, "45 SERV. DATE"), (770, 880, "46 SERV. UNITS"), (880, 1080, "47 TOTAL CHARGES"), (1080, W - M, "48 NON-COVERED")]
    for x0, x1, t in cols:
        box(x0, gy, x1, gy + 30)
        p.text((x0 + 3, gy + 8), t, lab, red)
    rh = 38
    rows = []
    cents_x = 1040  # the cents box inside 47
    for r in range(23):
        y0 = gy + 30 + r * rh
        if r % 2 == 0:
            p.d.rectangle([M + 1, y0 + 1, W - M - 1, y0 + rh - 1], fill=(253, 236, 232))
        for x0, x1, _ in cols:
            p.d.rectangle([x0, y0, x1, y0 + rh], outline=red, width=1)
        p.d.line([(cents_x, y0), (cents_x, y0 + rh)], fill=red, width=1)
        p.d.line([(W - M - 40, y0), (W - M - 40, y0 + rh)], fill=red, width=1)
        p.text((M - 30, y0 + 12), f"{r + 1}", lab, red)
        ty = y0 + 10
        if r < len(lines):
            l = lines[r]
            p.text((M + 6, ty), l.get("revCode") or "", f_d)
            p.text((118, ty), p.fit(l["description"].upper(), f_d, 345), f_d)
            p.text((476, ty), l.get("code") or "", f_d)
            p.text((656, ty), us_date(l.get("date"), "%m%d%y"), f_d)
            p.rtext(872, ty, f"{l.get('quantity', 1):g}", f_d)
            dollars, cents = f"{l['charge']:.2f}".split(".")
            b1 = p.rtext(cents_x - 8, ty, dollars, f_d)
            p.text((cents_x + 6, ty), cents, f_d)
            rows.append({"page": 0, "line": r, "row": (M, y0, W - M, y0 + rh), "charge": (b1[0], y0 + 4, cents_x + 40, y0 + rh - 4)})
        elif r == 22:
            p.text((M + 6, ty), "0001", f_db)
            p.text((118, ty), "PAGE  1  OF  1", f_d)
            p.text((476, ty), "CREATION DATE", lab, red)
            p.text((560, ty), us_date(bill.get("statementDate"), "%m%d%y"), f_d)
            p.text((770, ty), "TOTALS", font("narrowb", 14), red)
            dollars, cents = f"{bill['totalCharges']:.2f}".split(".")
            b1 = p.rtext(cents_x - 8, ty, dollars, f_db)
            p.text((cents_x + 6, ty), cents, f_db)
            total_box = (b1[0], y0 + 4, cents_x + 40, y0 + rh - 4)
    by = gy + 30 + 23 * rh + 16
    # Payer block, fields 50-55.
    pcols = [(M, 420, "50 PAYER NAME"), (420, 600, "51 HEALTH PLAN ID"), (600, 700, "52 REL INFO"), (700, 880, "54 PRIOR PAYMENTS"),
             (880, W - M, "55 EST. AMOUNT DUE")]
    for x0, x1, t in pcols:
        box(x0, by, x1, by + 30)
        p.text((x0 + 3, by + 8), t, lab, red)
    prior = round((bill.get("insurancePaid") or 0) + (bill.get("patientPaid") or 0) + (bill.get("adjustments") or 0), 2)
    for r, (payer, pr, due) in enumerate([(bill.get("insurancePayer") or "SELF PAY", prior, bill.get("amountDue")), ("", None, None), ("", None, None)]):
        y0 = by + 30 + r * 36
        for x0, x1, _ in pcols:
            p.d.rectangle([x0, y0, x1, y0 + 36], outline=red, width=1)
        p.text((M - 24, y0 + 10), "ABC"[r], lab, red)
        if r == 0:
            p.text((M + 6, y0 + 9), payer.upper()[:26], f_d)
            p.text((606, y0 + 9), "Y", f_d)
            p.rtext(872, y0 + 9, f"{pr:.2f}", f_d)
            due_b = p.rtext(W - M - 10, y0 + 9, f"{due:.2f}", f_db)
    fy = by + 30 + 3 * 36 + 20
    box(M, fy, 640, fy + 90, "80 REMARKS")
    p.text((M + 16, fy + 30), "PATIENT COPY - NOT A CLAIM SUBMISSION", f_d)
    box(640, fy, W - M, fy + 90, "76 ATTENDING")
    p.text((650, fy + 30), "SAMPLE PHYSICIAN MD", f_d)
    p.text((M, H - 60), "UB-04 STYLE FORM (illustrative)", font("narrowb", 13), red)
    watermark(p)
    notes = ["dollars and cents in separate boxes, MMDDYY dates", "totals on line 23 with revenue code 0001"]
    return Rendered([p.img], list(range(len(lines))), rows, total={"page": 0, "box": total_box}, due={"page": 0, "box": due_b},
                    protect=[{"page": 0, "box": (M, 40, W - M, fy + 90)}], notes=notes)


# ---------- collection agency letter -----------------------------------------------------------

AGENCIES = [
    {"name": "Coastline Recovery Services, Inc.", "addr": "P.O. Box 55210, Fresno, CA 93755", "phone": "1-866-555-0134"},
    {"name": "Bayside Account Resolution LLC", "addr": "4120 Seaport Way, Suite 210, Stockton, CA 95206", "phone": "1-877-555-0158"},
]


def collection(bill: dict, rng: random.Random) -> Rendered:
    """A letter from a debt collector. With lines, the hospital's itemization is attached;
    with none (a summary bill passed in with no lines), only the balance and the federal itemization of the debt."""
    lines = bill["lines"]
    itemized = bool(bill.get("isItemized")) and bool(lines)
    ag = rng.choice(AGENCIES)
    h = hospital_info(bill)
    p = Page()
    M = 90
    p.text((M, 60), ag["name"], font("timesb", 28), (20, 20, 20))
    p.text((M, 96), ag["addr"], font("times", 17), (70, 70, 70))
    p.text((M, 118), f"Toll free {ag['phone']}   Monday to Friday, 8 a.m. to 5 p.m. Pacific", font("times", 17), (70, 70, 70))
    p.rule(146, M, W - M, (20, 20, 20), 2)
    letter_date = date.fromisoformat(bill["statementDate"]) + timedelta(days=rng.randint(75, 140))
    p.text((M, 166), letter_date.strftime("%B %d, %Y").replace(" 0", " "), font("times", 18))
    y = 204
    for s in [(bill.get("patientName") or "").upper(), "SAMPLE ADDRESS", "SAN FRANCISCO CA 94110"]:
        p.text((M, y), s, font("times", 18))
        y += 24
    ref = f"CR-{rng.randint(10**6, 10**7 - 1)}"
    info = [("Original creditor", h["name"]), ("Creditor account no.", bill.get("accountNumber") or ""),
            ("Date of service", us_date(bill.get("serviceDate"))), ("Our reference no.", ref)]
    y = 300
    for k, v in info:
        p.text((M, y), k + ":", font("timesb", 17))
        p.text((M + 230, y), v, font("times", 17))
        y += 24
    y += 14
    p.text((M, y), "Balance due:", font("timesb", 22))
    db = p.rtext(M + 420, y, f"${money(bill.get('amountDue'))}", font("timesb", 22))
    y += 44
    body = (f"{h['short']} has referred your account to {ag['name']} for collection. This is a communication from a debt "
            "collector. We are trying to collect a debt, and any information we obtain will be used for that purpose.")
    y = para(p, body, M, y, W - 2 * M, font("times", 18))
    rows = []
    tb = None
    if itemized:
        y += 14
        p.text((M, y), "Itemization of hospital charges, as provided by the original creditor", font("timesb", 18))
        y += 30
        p.rule(y, M, W - M, (20, 20, 20))
        for t, x, a in [("Date", M + 4, "la"), ("CPT/HCPCS", M + 130, "la"), ("Description", M + 270, "la"), ("Units", W - M - 170, "ra"), ("Amount", W - M - 4, "ra")]:
            p.text((x, y + 6), t, font("timesb", 16), (20, 20, 20), a)
        y += 30
        p.rule(y, M, W - M, (20, 20, 20))
        f_r = font("times", 17)
        for n, l in enumerate(lines):
            p.text((M + 4, y + 6), us_date(l.get("date")), f_r)
            p.text((M + 130, y + 6), l.get("code") or "", f_r)
            p.text((M + 270, y + 6), p.fit(l["description"], f_r, W - M - 220 - (M + 270)), f_r)
            p.rtext(W - M - 170, y + 6, f"{l.get('quantity', 1):g}", f_r)
            cb = p.rtext(W - M - 4, y + 5, money(l["charge"]), font("courier", 17))
            rows.append({"page": 0, "line": n, "row": (M, y, W - M, y + 28), "charge": cb})
            y += 28
        p.rule(y, M, W - M, (20, 20, 20))
        y += 10
        items = [("Total charges", bill.get("totalCharges")), ("Less insurance payments", bill.get("insurancePaid") or 0),
                 ("Less adjustments", bill.get("adjustments") or 0), ("Less your payments", bill.get("patientPaid") or 0),
                 ("Balance referred for collection", bill.get("amountDue"))]
        for k, v in items:
            bold = k.startswith("Balance") or k.startswith("Total")
            p.text((W - M - 560, y), k, font("timesb" if bold else "times", 17))
            b = p.rtext(W - M - 4, y, money(v), font("courierb" if bold else "courier", 17))
            if k == "Total charges":
                tb = b
            y += 26
    else:
        y += 16
        owed_on = date.fromisoformat(bill["statementDate"])
        paid = bill.get("patientPaid") or 0
        start = round((bill.get("amountDue") or 0) + paid, 2)
        p.text((M, y), "Itemization of the debt", font("timesb", 18))
        y += 30
        items = [(f"As of {owed_on.strftime('%B %d, %Y').replace(' 0', ' ')}, you owed:", money(start)),
                 (f"Between {owed_on.strftime('%B %d, %Y').replace(' 0', ' ')} and today:", ""),
                 ("    You were charged this amount in interest:", "+ 0.00"),
                 ("    You were charged this amount in fees:", "+ 0.00"),
                 ("    You paid or were credited this amount toward the debt:", f"- {money(paid)}"),
                 ("Total amount of the debt now:", money(bill.get("amountDue")))]
        for k, v in items:
            p.text((M, y), k, font("timesb" if k.startswith("Total") else "times", 18))
            if v:
                p.rtext(W - M - 60, y, v, font("courierb" if k.startswith("Total") else "courier", 18))
            y += 28
    y += 18
    for t in ["How can you dispute the debt? Call or write to us by the date 30 days after you receive this notice to dispute all or",
              "part of the debt. If you do not, we will assume that our information is correct.",
              "The state Rosenthal Fair Debt Collection Practices Act and the federal Fair Debt Collection Practices Act require that,",
              "except under unusual circumstances, collectors may not contact you before 8 a.m. or after 9 p.m."]:
        p.text((M, y), t, font("times", 15), (60, 60, 60))
        y += 21
    protect_bottom = y
    cy = H - 230
    p.d.rectangle([M, cy, W - M, cy + 160], outline=(60, 60, 60), width=1)
    p.text((M + 14, cy + 12), "How do you want to respond?   Mail this form to us with your payment or dispute.", font("timesb", 16))
    opts = ["I want to dispute the debt because I think:", "This is not my debt.", "The amount is wrong.", "Other (please describe on reverse)."]
    yy = cy + 44
    for o in opts:
        if o.endswith("think:"):
            p.text((M + 14, yy), o, font("times", 16))
        else:
            p.d.rectangle([M + 40, yy + 2, M + 56, yy + 18], outline=(40, 40, 40), width=2)
            p.text((M + 66, yy), o, font("times", 16))
        yy += 26
    p.text((W - M - 360, cy + 52), f"Reference {ref}", font("times", 16))
    p.text((W - M - 360, cy + 80), f"Amount due ${money(bill.get('amountDue'))}", font("timesb", 16))
    watermark(p)
    notes = ["collection agency letter, original creditor is the hospital"] + (["itemization attached"] if itemized else ["balance only, no line items"])
    return Rendered([p.img], list(range(len(lines))), rows, total={"page": 0, "box": tb} if tb else None, due={"page": 0, "box": db},
                    protect=[{"page": 0, "box": (M, 56, W - M, protect_bottom)}], notes=notes)


def para(p: Page, text: str, x: int, y: int, width: int, f) -> int:
    cur = ""
    for w in text.split():
        t = f"{cur} {w}".strip()
        if cur and p.d.textlength(t, font=f) > width:
            p.text((x, y), cur, f)
            y += f.size + 6
            cur = w
        else:
            cur = t
    if cur:
        p.text((x, y), cur, f)
        y += f.size + 6
    return y


LAYOUTS = {"classic": classic, "epic": epic, "summary": summary, "multipage": multipage, "ub04": ub04, "collection": collection}
