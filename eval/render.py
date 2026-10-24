"""Render a ParsedBill JSON as a hospital itemized statement.

Variants:
  clean  a flat scan-like PNG (1275 px wide, letter size at 150 dpi)
  photo  the same page shot with a phone: on a desk, slightly rotated, shadowed, blurred
  pdf    a 2-page PDF with the line items split across pages

Input is a ParsedBill (convex/lib/bill.ts) or a generator truth file ({"bill": ParsedBill, ...}).

  python render.py demo_bill.json --variant all --out out/demo-bill
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parent))  # -I leaves the script dir off sys.path

import argparse
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from prices import HOSPITALS

W, H = 1275, 1650  # letter at 150 dpi
MARGIN = 70
INK = (28, 28, 30)
GREY = (110, 110, 115)
RULE = (170, 170, 175)
BAND = (236, 240, 245)
ACCENT = (22, 62, 112)

FONT_DIRS = ["/System/Library/Fonts/Supplemental", "/Library/Fonts", "/usr/share/fonts/truetype/dejavu"]
FONT_FILES = {
    "regular": ["Arial.ttf", "DejaVuSans.ttf"],
    "bold": ["Arial Bold.ttf", "DejaVuSans-Bold.ttf"],
    "mono": ["Courier New.ttf", "DejaVuSansMono.ttf"],
    "monobold": ["Courier New Bold.ttf", "DejaVuSansMono-Bold.ttf"],
}


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    for d in FONT_DIRS:
        for f in FONT_FILES[kind]:
            p = Path(d) / f
            if p.exists():
                return ImageFont.truetype(str(p), size)
    return ImageFont.load_default(size)


def money(x: float | None) -> str:
    return "" if x is None else f"{x:,.2f}"


def us_date(iso: str | None) -> str:
    if not iso:
        return ""
    y, m, d = iso.split("-")
    return f"{m}/{d}/{y}"


def hospital_info(bill: dict) -> dict:
    name = (bill.get("hospitalName") or "").lower()
    for h in HOSPITALS.values():
        if h["name"].lower() == name or h["short"].lower() in name:
            return h
    return {"name": bill.get("hospitalName") or "", "address": "", "phone": bill.get("billingPhone"), "website": None}


class Page:
    def __init__(self):
        self.img = Image.new("RGB", (W, H), (255, 255, 255))
        self.d = ImageDraw.Draw(self.img)

    def text(self, xy, s, f, fill=INK, anchor="la"):
        self.d.text(xy, s, font=f, fill=fill, anchor=anchor)

    def rule(self, y, x0=MARGIN, x1=W - MARGIN, fill=RULE, width=1):
        self.d.line([(x0, y), (x1, y)], fill=fill, width=width)


def draw_header(p: Page, bill: dict, page_no: int, pages: int) -> int:
    h = hospital_info(bill)
    f_name = font("bold", 26)
    f_small = font("regular", 17)
    f_label = font("bold", 15)
    # Logo-ish mark: a simple cross in a rounded square.
    p.d.rounded_rectangle([MARGIN, 62, MARGIN + 58, 120], radius=10, fill=ACCENT)
    p.d.rectangle([MARGIN + 24, 72, MARGIN + 34, 110], fill="white")
    p.d.rectangle([MARGIN + 10, 86, MARGIN + 48, 96], fill="white")
    x = MARGIN + 76
    name = h["name"]
    if p.d.textlength(name, font=f_name) > 640:
        f_name = font("bold", 21)
    p.text((x, 62), name, f_name, ACCENT)
    p.text((x, 98), h.get("address") or "", f_small, GREY)
    contact = f"Billing questions: {bill.get('billingPhone') or h.get('phone') or ''}"
    if bill.get("hospitalWebsite"):
        contact += f"   {bill['hospitalWebsite']}"
    p.text((x, 122), contact, f_small, GREY)

    # Statement box, top right.
    bx0, bx1, by0 = W - MARGIN - 380, W - MARGIN, 160
    p.d.rectangle([bx0, by0, bx1, by0 + 190], outline=INK, width=2)
    p.d.rectangle([bx0, by0, bx1, by0 + 36], fill=INK)
    title = "ITEMIZED STATEMENT" if bill.get("isItemized") else "PATIENT STATEMENT"
    p.text(((bx0 + bx1) // 2, by0 + 18), title, font("bold", 18), "white", "mm")
    rows = [
        ("Statement Date", us_date(bill.get("statementDate"))),
        ("Account Number", bill.get("accountNumber") or ""),
        ("Page", f"{page_no} of {pages}"),
    ]
    y = by0 + 50
    for k, v in rows:
        p.text((bx0 + 16, y), k, f_label, GREY)
        p.text((bx1 - 16, y), v, font("regular", 17), INK, "ra")
        y += 30
    if page_no == 1:
        p.rule(y + 2, bx0 + 10, bx1 - 10)
        p.text((bx0 + 16, y + 14), "AMOUNT DUE", font("bold", 17))
        p.text((bx1 - 16, y + 10), f"${money(bill.get('amountDue'))}", font("bold", 24), INK, "ra")

    # Patient block, left.
    y = 172
    p.text((MARGIN, y), "PATIENT", f_label, GREY)
    p.text((MARGIN, y + 22), (bill.get("patientName") or "").upper(), font("bold", 20))
    p.text((MARGIN, y + 50), "Guarantor: same as patient", f_small)
    y += 92
    p.text((MARGIN, y), "SERVICE", f_label, GREY)
    dates = sorted({l["date"] for l in bill.get("lines", []) if l.get("date")}) or [bill.get("serviceDate")]
    span = us_date(dates[0]) if len(dates) == 1 else f"{us_date(dates[0])} - {us_date(dates[-1])}"
    p.text((MARGIN, y + 22), f"Emergency Department   Dates: {span}", f_small)
    payer = bill.get("insurancePayer") or "SELF PAY / UNINSURED"
    p.text((MARGIN, y + 46), f"Primary insurance: {payer}", f_small)
    return 380


COLS = [  # (title, x, align)
    ("DATE", MARGIN + 6, "la"),
    ("REV", MARGIN + 130, "la"),
    ("CPT/HCPCS", MARGIN + 200, "la"),
    ("DESCRIPTION", MARGIN + 330, "la"),
    ("QTY", W - MARGIN - 190, "ra"),
    ("CHARGES", W - MARGIN - 8, "ra"),
]


def draw_table(p: Page, lines: list[dict], y: int, start_index: int, itemized: bool) -> int:
    f_head = font("bold", 15)
    f_row = font("regular", 17)
    f_num = font("mono", 18)
    title = "DETAIL OF CHARGES" if itemized else "SUMMARY OF CHARGES"
    p.text((MARGIN, y), title, font("bold", 18), ACCENT)
    y += 30
    p.d.rectangle([MARGIN, y, W - MARGIN, y + 30], fill=INK)
    cols = COLS if itemized else [COLS[1], ("DESCRIPTION", MARGIN + 200, "la"), COLS[5]]
    for t, x, a in cols:
        p.text((x, y + 8), t, f_head, "white", a)
    y += 30
    for n, l in enumerate(lines):
        if (start_index + n) % 2 == 1:
            p.d.rectangle([MARGIN, y, W - MARGIN, y + 32], fill=BAND)
        ty = y + 7
        if itemized:
            p.text((COLS[0][1], ty), us_date(l.get("date")), f_row)
            p.text((COLS[1][1], ty), l.get("revCode") or "", f_row)
            p.text((COLS[2][1], ty), l.get("code") or "", f_row)
            desc = l["description"]
            while p.d.textlength(desc, font=f_row) > 540:
                desc = desc[:-1]
            p.text((COLS[3][1], ty), desc, f_row)
            p.text((COLS[4][1], ty - 1), f"{l.get('quantity', 1):g}", f_num, INK, "ra")
        else:
            p.text((COLS[1][1], ty), l.get("revCode") or "", f_row)
            p.text((MARGIN + 200, ty), l["description"], f_row)
        p.text((COLS[5][1], ty - 1), money(l["charge"]), f_num, INK, "ra")
        y += 32
    p.rule(y, width=2, fill=INK)
    return y + 14


def draw_totals(p: Page, bill: dict, y: int) -> int:
    f = font("regular", 18)
    fb = font("bold", 20)
    x0, x1 = W - MARGIN - 420, W - MARGIN - 8
    rows = [
        ("Total Charges", bill.get("totalCharges")),
        ("Insurance Payments", -(bill.get("insurancePaid") or 0)),
        ("Adjustments", -(bill.get("adjustments") or 0)),
        ("Patient Payments", -(bill.get("patientPaid") or 0)),
    ]
    for k, v in rows:
        p.text((x0, y), k, f)
        p.text((x1, y - 1), money(v) if v else "0.00", font("mono", 19), INK, "ra")
        y += 30
    p.d.rectangle([x0 - 12, y + 2, W - MARGIN, y + 46], outline=INK, width=2)
    p.text((x0, y + 13), "AMOUNT DUE", fb)
    p.text((x1, y + 11), f"${money(bill.get('amountDue'))}", fb, INK, "ra")
    return y + 64


def draw_footer(p: Page, bill: dict, last: bool) -> None:
    f = font("regular", 15)
    y = H - 210
    if last:
        due = ""
        if bill.get("statementDate"):
            due = us_date((date.fromisoformat(bill["statementDate"]) + timedelta(days=30)).isoformat())
        p.rule(y - 14)
        msgs = [
            f"Please pay by {due}. Make checks payable to the hospital and include your account number." if due else "",
            "If you are uninsured or have high medical costs, you may qualify for free or discounted care under",
            "our Financial Assistance Policy (California Health & Safety Code 127400). Ask us for an application.",
            "You may request an itemized statement at any time at no charge.",
        ]
        for m in msgs:
            p.text((MARGIN, y), m, f, GREY)
            y += 22
    else:
        p.text((W // 2, H - 150), "Continued on next page", font("bold", 16), GREY, "mm")
    # Small watermark in the bottom-right corner.
    p.text((W - MARGIN, H - 48), "SAMPLE — fictional patient", font("bold", 15), (190, 60, 60), "ra")


def render_pages(bill: dict, split: bool = False) -> list[Image.Image]:
    lines = bill.get("lines") or []
    itemized = bool(bill.get("isItemized"))
    chunks = [lines]
    if split and len(lines) > 1:
        cut = math.ceil(len(lines) / 2)
        chunks = [lines[:cut], lines[cut:]]
    elif len(lines) > 26:
        chunks = [lines[i:i + 26] for i in range(0, len(lines), 26)]
    pages = []
    start = 0
    for n, chunk in enumerate(chunks, 1):
        p = Page()
        y = draw_header(p, bill, n, len(chunks))
        y = draw_table(p, chunk, y, start, itemized)
        start += len(chunk)
        last = n == len(chunks)
        if last:
            draw_totals(p, bill, y + 10)
        draw_footer(p, bill, last)
        pages.append(p.img)
    return pages


def _desk(size: tuple[int, int], rng: random.Random) -> Image.Image:
    """A dim wood-ish desk: warm gradient plus streaks and grain."""
    w, h = size
    base = rng.choice([(118, 86, 60), (92, 78, 66), (150, 140, 128), (70, 72, 78)])
    img = Image.new("RGB", (w, h), base)
    d = ImageDraw.Draw(img)
    for y in range(0, h, 3):
        k = rng.uniform(-14, 14)
        d.line([(0, y), (w, y + rng.randint(-6, 6))], fill=tuple(max(0, min(255, int(c + k))) for c in base), width=3)
    return img.filter(ImageFilter.GaussianBlur(2))


def phone_photo(page: Image.Image, rng: random.Random, out_w: int = 1200) -> Image.Image:
    """Simulate a phone snapshot: page on a desk, rotated a little, soft shadow, uneven light, blur."""
    import numpy as np

    angle = rng.uniform(-3.5, 3.5)
    pad = 140
    canvas = _desk((W + 2 * pad, H + 2 * pad), rng)
    # Drop shadow.
    shadow = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(shadow).rectangle([pad + 14, pad + 18, pad + W + 14, pad + H + 18], fill=150)
    shadow = shadow.rotate(angle, resample=Image.BICUBIC, center=(canvas.width / 2, canvas.height / 2))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    canvas = Image.composite(Image.new("RGB", canvas.size, (20, 18, 16)), canvas, shadow)
    # Paper is slightly off-white.
    paper = Image.blend(page, Image.new("RGB", page.size, (246, 243, 236)), 0.25)
    mask = Image.new("L", page.size, 255)
    layer = Image.new("RGB", canvas.size)
    layer.paste(paper, (pad, pad))
    lmask = Image.new("L", canvas.size, 0)
    lmask.paste(mask, (pad, pad))
    c = (canvas.width / 2, canvas.height / 2)
    layer = layer.rotate(angle, resample=Image.BICUBIC, center=c)
    lmask = lmask.rotate(angle, resample=Image.BICUBIC, center=c)
    canvas.paste(layer, (0, 0), lmask)

    # Uneven lighting: bright spot plus a soft hand/phone shadow across one corner.
    a = np.asarray(canvas).astype(np.float32)
    hh, ww = a.shape[:2]
    yy, xx = np.mgrid[0:hh, 0:ww]
    cx, cy = rng.uniform(0.3, 0.7) * ww, rng.uniform(0.2, 0.5) * hh
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / math.hypot(ww, hh)
    light = 1.06 - 0.45 * dist
    corner = rng.choice([(0, 0), (ww, 0), (0, hh), (ww, hh)])
    cd = np.sqrt((xx - corner[0]) ** 2 + (yy - corner[1]) ** 2) / math.hypot(ww, hh)
    light *= 1 - 0.22 * np.clip(1 - cd / 0.45, 0, 1)
    a = a * light[..., None]
    a += np.random.default_rng(rng.randint(0, 2**31)).normal(0, 3.5, a.shape)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.5, 1.1)))
    # Crop a bit off the desk edges unevenly, like a hand-held framing.
    l, t = rng.randint(30, 110), rng.randint(30, 110)
    r, b = img.width - rng.randint(30, 110), img.height - rng.randint(30, 110)
    img = img.crop((l, t, r, b))
    return img.resize((out_w, round(img.height * out_w / img.width)), Image.LANCZOS)


def clean_scan(page: Image.Image, out_w: int = 1200) -> Image.Image:
    return page.resize((out_w, round(H * out_w / W)), Image.LANCZOS)


def render(bill: dict, out_base: Path, variant: str, seed: int = 0) -> list[Path]:
    """Write out_base.png (clean or photo) and/or out_base.pdf. Returns written paths."""
    rng = random.Random(seed)
    out_base.parent.mkdir(parents=True, exist_ok=True)
    written = []
    if variant in ("clean", "all"):
        pages = render_pages(bill)
        p = out_base.with_name(out_base.name + ("-clean" if variant == "all" else "") + ".png")
        clean_scan(pages[0]).save(p, optimize=True)
        written.append(p)
    if variant in ("photo", "all"):
        pages = render_pages(bill)
        p = out_base.with_name(out_base.name + ("-photo" if variant == "all" else "") + ".png")
        phone_photo(pages[0], rng).save(p, optimize=True)
        written.append(p)
    if variant in ("pdf", "all"):
        pages = render_pages(bill, split=True)
        p = out_base.with_suffix(".pdf") if variant == "pdf" else out_base.with_name(out_base.name + ".pdf")
        pages[0].save(p, save_all=True, append_images=pages[1:], resolution=150)
        written.append(p)
    return written


def load_bill(path: Path) -> dict:
    data = json.loads(path.read_text())
    return data["bill"] if "bill" in data else data


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", type=Path, help="ParsedBill JSON or generator truth file")
    ap.add_argument("--out", type=Path, help="output path without extension (default: next to input)")
    ap.add_argument("--variant", choices=["clean", "photo", "pdf", "all"], default="clean")
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    out = a.out or a.input.with_suffix("")
    for p in render(load_bill(a.input), out, a.variant, a.seed):
        print(p)


if __name__ == "__main__":
    main()
