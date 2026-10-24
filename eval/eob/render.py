"""Render a ParsedEob as an insurer's Explanation of Benefits, and render the pairs' bills.

Variants, as in ../render.py:
  clean  a flat scan-like PNG (1200 px wide, letter size)
  photo  the same page shot with a phone: on a desk, slightly rotated, shadowed, blurred

  python -I render.py                          # every out/pair-*.truth.json -> out/<id>.eob.png + out/<id>.bill.png
  python -I render.py --sample                 # convex/lib/sampleEob.json -> public/sample-eob.png (+ out/sample-eob-photo.png)
  python -I render.py some.eob.json --variant all --out out/x

Input is a ParsedEob (convex/lib/eob.ts) or a truth file ({"eob": ParsedEob, "shares": [...], ...}).
`shares` splits each line's "you may owe" into deductible, copay and coinsurance. Without it the
table shows "you may owe" and "not covered" only, like many plans print it.
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_HERE = _Path(__file__).resolve().parent
_sys.path[:0] = [str(_HERE.parent), str(_HERE)]  # -I leaves the script dir off sys.path; bill eval first

import argparse
import json
import random
import re
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageDraw

import render as bill_render  # ../render.py, the bill renderer
from render import clean_scan, font, money, phone_photo, us_date

HERE = _HERE
OUT = HERE / "out"
ROOT = HERE.parent.parent
W, H = bill_render.W, bill_render.H
M = 64
INK = (26, 28, 32)
GREY = (105, 108, 115)
RULE = (175, 178, 184)
BAND = (240, 244, 241)

# Each fictional insurer gets its own colour, so the EOBs don't all look alike.
BRAND = {
    "Golden Bear Health Plan": ((23, 74, 126), "GB"),
    "Fogline Health": ((52, 98, 92), "FH"),
    "Redwood Lantern Assurance": ((128, 44, 36), "RL"),
    "Sierra Larkspur Health Plan": ((84, 62, 130), "SL"),
    "Poppyfield Community Health Plan": ((176, 84, 20), "PC"),
}
STATUS = {"processed": "Processed", "denied": "Denied", "partly_denied": "Processed, some services denied",
          "pending": "Pending, still in process", "unknown": ""}


def brand(eob: dict) -> tuple:
    payer = eob.get("payer") or ""
    return next((v for k, v in BRAND.items() if payer.startswith(k)), ((40, 60, 90), "HP"))


def plan_name(eob: dict) -> str:
    payer, kind = eob.get("payer") or "", eob.get("planType") or ""
    return payer if not kind or payer.upper().endswith(kind.upper()) else f"{payer} {kind}"


class Page:
    def __init__(self):
        self.img = Image.new("RGB", (W, H), (255, 255, 255))
        self.d = ImageDraw.Draw(self.img)

    def text(self, xy, s, f, fill=INK, anchor="la"):
        self.d.text(xy, s, font=f, fill=fill, anchor=anchor)

    def rule(self, y, x0=M, x1=W - M, fill=RULE, width=1):
        self.d.line([(x0, y), (x1, y)], fill=fill, width=width)

    def fit(self, s: str, f, width: int) -> str:
        while s and self.d.textlength(s, font=f) > width:
            s = s[:-1]
        return s


def cash(x) -> str:
    return "" if x is None else f"${money(x)}"


def remark_code(r: str | None) -> str:
    return (r or "").split(" ", 1)[0]


def draw_header(p: Page, eob: dict, rng: random.Random) -> int:
    color, mark = brand(eob)
    p.d.ellipse([M, 56, M + 64, 120], fill=color)
    p.text((M + 32, 88), mark, font("bold", 26), "white", "mm")
    p.text((M + 82, 58), eob.get("payer") or "", font("bold", 28), color)
    p.text((M + 82, 96), "Explanation of Benefits", font("regular", 20), GREY)
    p.text((W - M, 60), "THIS IS NOT A BILL", font("bold", 30), INK, "ra")
    p.text((W - M, 98), "Keep this statement for your records.", font("regular", 16), GREY, "ra")
    p.rule(134, fill=color, width=3)

    # Member box (left) and statement box (right).
    f_l, f_v = font("bold", 15), font("regular", 18)
    y0 = 152
    issued = eob.get("serviceDateTo") or eob.get("serviceDateFrom")
    stmt = (date.fromisoformat(issued) + timedelta(days=rng.randint(18, 45))).isoformat() if issued else None
    left = [("Member", (eob.get("memberName") or "").upper()), ("Member ID", eob.get("memberId") or ""),
            ("Group number", f"{rng.randint(100000, 999999)}"),
            ("Plan", plan_name(eob))]
    right = [("Statement date", us_date(stmt)), ("Claim number", eob.get("claimNumber") or ""),
             ("Customer service", eob.get("insurerPhone") or "")]
    y = y0
    for k, v in left:
        p.text((M, y), k.upper(), f_l, GREY)
        p.text((M + 170, y - 2), v, f_v)
        y += 30
    bx0 = W - M - 430
    p.d.rectangle([bx0, y0 - 10, W - M, y0 + 98], outline=RULE, width=1)
    y = y0
    for k, v in right:
        p.text((bx0 + 14, y), k.upper(), f_l, GREY)
        p.text((W - M - 14, y - 2), v, f_v, INK, "ra")
        y += 30
    return y0 + 4 * 30 + 16


def draw_claim(p: Page, eob: dict, y: int) -> int:
    color = brand(eob)[0]
    p.d.rectangle([M, y, W - M, y + 34], fill=color)
    p.text((M + 14, y + 8), "CLAIM DETAILS", font("bold", 17), "white")
    y += 46
    f_l, f_v = font("bold", 15), font("regular", 18)
    span = us_date(eob.get("serviceDateFrom"))
    if eob.get("serviceDateTo") and eob.get("serviceDateTo") != eob.get("serviceDateFrom"):
        span += f" - {us_date(eob['serviceDateTo'])}"
    rows = [("Patient", (eob.get("memberName") or "").upper()), ("Provider", eob.get("providerName") or ""),
            ("Service dates", span)]
    net = {"in": "In-network (participating provider)", "out": "Out-of-network (non-participating provider)"}.get(eob.get("network"))
    if net:
        rows.append(("Network status", net))
    if eob.get("emergency") is True:
        rows.append(("Type of care", "Emergency room services"))
    rows.append(("Claim status", STATUS.get(eob.get("claimStatus"), "")))
    for k, v in rows:
        p.text((M + 14, y), k.upper(), f_l, GREY)
        bold = k == "Claim status" and eob.get("claimStatus") in ("denied", "partly_denied", "pending")
        p.text((M + 220, y - 2), v, font("bold", 18) if bold else f_v)
        y += 29
    return y + 10


def columns(split: bool) -> list[tuple]:
    """(title line 1, title line 2, x, align, getter key). Money columns are right-aligned at x."""
    base = [("DATE", "", M + 8, "la", "date"), ("CODE", "", M + 112, "la", "code"), ("SERVICE", "", M + 196, "la", "description")]
    if split:
        money_cols = [("AMOUNT", "BILLED", 560, "billed"), ("PLAN", "ALLOWED", 668, "allowed"),
                      ("NOT", "COVERED", 760, "notCovered"), ("DEDUCT-", "IBLE", 846, "deductible"),
                      ("COPAY/", "COINS.", 934, "copayCoins"), ("PLAN", "PAID", 1032, "planPaid"),
                      ("YOU MAY", "OWE", 1132, "patientOwes")]
    else:
        money_cols = [("AMOUNT", "BILLED", 620, "billed"), ("PLAN", "ALLOWED", 740, "allowed"),
                      ("NOT", "COVERED", 850, "notCovered"), ("PLAN", "PAID", 980, "planPaid"),
                      ("YOU MAY", "OWE", 1132, "patientOwes")]
    return base + [(a, b, x, "ra", k) for a, b, x, k in money_cols] + [("RMK", "", W - M - 6, "ra", "remark")]


def draw_table(p: Page, eob: dict, shares: list | None, y: int) -> int:
    lines = eob.get("lines") or []
    split = bool(shares) and all(s is not None for s in shares) and len(shares) == len(lines)
    cols = columns(split)
    pending = eob.get("claimStatus") == "pending"
    p.d.rectangle([M, y, W - M, y + 46], fill=(232, 235, 240))
    f_h = font("bold", 13)
    for t1, t2, x, a, _ in cols:
        p.text((x, y + 7), t1, f_h, INK, a)
        if t2:
            p.text((x, y + 25), t2, f_h, INK, a)
    y += 46
    f_r, f_n = font("regular", 16), font("mono", 16)
    desc_w = (cols[3][2] - 100) - cols[2][2]
    for n, l in enumerate(lines):
        if n % 2 == 1:
            p.d.rectangle([M, y, W - M, y + 30], fill=BAND)
        ty = y + 7
        s = shares[n] if split else {}
        vals = dict(l)
        if split:
            vals["deductible"] = s["deductible"]
            vals["copayCoins"] = round(s["copay"] + s["coinsurance"], 2)
        for _, _, x, a, k in cols:
            if k == "date":
                p.text((x, ty), us_date(l.get("date")), f_r)
            elif k == "code":
                p.text((x, ty), l.get("code") or "", f_r)
            elif k == "description":
                desc, fd = l.get("description") or "", f_r
                for size in (15, 14, 13, 12):  # shrink a long description before cutting it
                    if p.d.textlength(desc, font=fd) <= desc_w:
                        break
                    fd = font("regular", size)
                p.text((x, ty + (16 - fd.size) // 2), p.fit(desc, fd, desc_w), fd)
            elif k == "remark":
                p.text((x, ty), remark_code(l.get("remark")), f_r, INK, a)
            else:
                v = vals.get(k)
                txt = "PEND" if pending and k != "billed" else ("" if v is None else money(v))
                p.text((x, ty - 1), txt, f_n, INK, a)
        y += 30
    p.rule(y, width=2, fill=INK)
    # Totals row.
    y += 8
    p.text((cols[2][2], y + 2), "CLAIM TOTALS", font("bold", 16))
    tot = {"billed": eob.get("totalBilled"), "allowed": eob.get("totalAllowed"), "planPaid": eob.get("totalPlanPaid"),
           "patientOwes": eob.get("totalPatientOwes")}
    nc = [l.get("notCovered") for l in lines]
    if all(v is not None for v in nc) and lines:
        tot["notCovered"] = round(sum(nc), 2)
    if split:
        tot["deductible"] = round(sum(s["deductible"] for s in shares), 2)
        tot["copayCoins"] = round(sum(s["copay"] + s["coinsurance"] for s in shares), 2)
    for _, _, x, a, k in cols:
        if k in tot:
            v = tot[k]
            txt = "PEND" if pending and k != "billed" else ("" if v is None else money(v))
            p.text((x, y + 1), txt, font("monobold", 16), INK, a)
    return y + 40


def draw_summary(p: Page, eob: dict, y: int) -> int:
    color = brand(eob)[0]
    p.d.rectangle([M, y, W - M, y + 112], outline=color, width=2)
    p.text((M + 16, y + 12), "YOUR CLAIM AT A GLANCE", font("bold", 16), color)
    pending = eob.get("claimStatus") == "pending"
    billed, allowed = eob.get("totalBilled"), eob.get("totalAllowed")
    disc = round(billed - allowed, 2) if billed is not None and allowed is not None else None
    cells = [("Provider billed", cash(billed)), ("Plan discount", cash(disc) if not pending else "Pending"),
             ("Plan paid", cash(eob.get("totalPlanPaid")) if not pending else "Pending"),
             ("You may owe the provider", cash(eob.get("totalPatientOwes")) if not pending else "Pending")]
    cw = (W - 2 * M - 32) / 4
    for i, (k, v) in enumerate(cells):
        x = M + 16 + i * cw
        p.text((x, y + 44), k, font("regular", 16), GREY)
        p.text((x, y + 68), v, font("bold", 26 if i == 3 else 22), INK)
    return y + 128


def wrap(p: Page, text: str, f, width: int) -> list[str]:
    out, cur = [], ""
    for w in text.split():
        t = f"{cur} {w}".strip()
        if cur and p.d.textlength(t, font=f) > width:
            out.append(cur)
            cur = w
        else:
            cur = t
    return out + ([cur] if cur else [])


def draw_footer(p: Page, eob: dict, y: int) -> None:
    f, fb = font("regular", 15), font("bold", 15)
    remarks = []
    for l in eob.get("lines") or []:
        r = l.get("remark")
        if r and r not in remarks:
            remarks.append(r)
    if remarks:
        p.text((M, y), "REMARK CODES", fb, GREY)
        y += 22
        for r in remarks:
            code, _, txt = r.partition(" ")
            p.text((M, y), code, fb)
            p.text((M + 80, y), txt, f)
            y += 21
        y += 8
    if eob.get("claimStatus") == "pending":
        p.text((M, y), "We are still reviewing this claim. You do not need to pay the provider until we finish.", f)
        y += 21
        p.text((M, y), "We will send you a new statement when the claim is processed.", f)
        y += 29
    p.rule(y)
    y += 12
    p.text((M, y), "YOUR RIGHT TO APPEAL", fb, GREY)
    y += 22
    paras = [
        "If you disagree with how we processed this claim, you can file an appeal (grievance). "
        f"Time limit to appeal: {eob.get('appealDeadline') or ''}. Send it to: {eob.get('appealAddress') or ''}.",
        f"Questions? Call Member Services at {eob.get('insurerPhone') or ''}, TTY 711, Monday to Friday, 8 a.m. to 6 p.m.",
    ]
    if (eob.get("planType") or "") == "Medi-Cal":
        paras.append("Medi-Cal members: follow the appeal steps on the enclosed notice. You may also ask for a State Hearing.")
    else:
        paras.append("You may also contact the California Department of Managed Health Care Help Center at 1-888-466-2219.")
    for para in paras:
        for line in wrap(p, para, f, W - 2 * M):
            p.text((M, y), line, f)
            y += 21
    p.text((W - M, H - 48), "SAMPLE — fictional insurer and patient", font("bold", 15), (190, 60, 60), "ra")
    p.text((M, H - 48), "Este aviso tiene información importante. Llame a Servicios para Miembros para ayuda en español.", f, GREY)


def render_page(eob: dict, shares: list | None = None, seed: int = 0) -> Image.Image:
    rng = random.Random(seed)
    p = Page()
    y = draw_header(p, eob, rng)
    y = draw_claim(p, eob, y)
    y = draw_summary(p, eob, y)
    y = draw_table(p, eob, shares, y)
    draw_footer(p, eob, y + 6)
    return p.img


def render_eob(eob: dict, out_base: Path, variant: str, seed: int = 0, shares: list | None = None) -> list[Path]:
    """Write out_base.png (clean or photo), or both with -clean/-photo suffixes for "all"."""
    rng = random.Random(seed)
    out_base.parent.mkdir(parents=True, exist_ok=True)
    page = render_page(eob, shares, seed)
    written = []
    for v in (["clean", "photo"] if variant == "all" else [variant]):
        path = out_base.with_name(out_base.name + (f"-{v}" if variant == "all" else "") + ".png")
        (clean_scan(page) if v == "clean" else phone_photo(page, rng)).save(path, optimize=True)
        written.append(path)
    return written


def render_pairs(src: Path, only: list[str] | None) -> None:
    truths = sorted(src.glob("pair-*.truth.json"))
    if not truths:
        raise SystemExit(f"no truth files in {src}; run generate.py first")
    for tp in truths:
        t = json.loads(tp.read_text())
        if only and t["id"] not in only:
            continue
        n = int(re.sub(r"\D", "", t["id"]) or 0)
        render_eob(t["eob"], src / f"{t['id']}.eob", t["variant"]["eob"], seed=7000 + n, shares=t.get("shares"))
        bill_render.render(t["bill"], src / f"{t['id']}.bill", t["variant"]["bill"], seed=9000 + n)
    print(f"rendered {len(only) if only else len(truths)} EOB + bill pairs into {src}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", nargs="?", type=Path, help="ParsedEob JSON or truth file (default: render every pair in out/)")
    ap.add_argument("--out", type=Path, help="output path without extension (default: next to input)")
    ap.add_argument("--variant", choices=["clean", "photo", "all"], default="clean")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--only", nargs="*", help="pair ids to render")
    ap.add_argument("--sample", action="store_true", help="render convex/lib/sampleEob.json to public/sample-eob.png")
    a = ap.parse_args()
    if a.sample:
        src = ROOT / "convex" / "lib" / "sampleEob.json"
        if not src.exists():
            raise SystemExit(f"{src} does not exist yet")
        eob = json.loads(src.read_text())
        (written,) = render_eob(eob, ROOT / "public" / "sample-eob", "clean", seed=12)
        OUT.mkdir(exist_ok=True)
        render_eob(eob, OUT / "sample-eob-photo", "photo", seed=12)
        print(written, OUT / "sample-eob-photo.png")
        return
    if a.input is None:
        render_pairs(OUT, a.only)
        return
    data = json.loads(a.input.read_text())
    eob, shares = (data["eob"], data.get("shares")) if "eob" in data else (data, None)
    out = a.out or a.input.with_suffix("")
    for p in render_eob(eob, out, a.variant, a.seed, shares):
        print(p)


if __name__ == "__main__":
    main()
