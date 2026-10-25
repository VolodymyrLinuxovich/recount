"""Hard photo conditions for rendered bill pages, made with PIL, numpy and OpenCV.

Ink on the paper (applied to the flat page, so they sit on the paper like real marks):
  pen          blue or black pen: circles around charges, check marks, margin notes, a written number
  highlighter  a yellow band over one to three rows
  coffee       a coffee ring and a faint spill, sometimes over the charges column

The paper:
  fold         one or two creases with a light/dark step and a small kink in the text
  crumple      smooth random warping with wrinkle shading

The photo:
  perspective  shot at an angle: a strong keystone and up to 12 degrees of tilt
  shadow       a hard-edged hand or phone shadow across part of the page
  lowlight     dim indoor light: dark, warm, noisy
  blur         out of focus or a shaky hand (Gaussian or motion blur)
  glare        a bright reflection that washes out a patch
  crop         the page runs off the frame on one or two sides (only margins and footer are cut)

Every photo is placed on a desk, lit unevenly and saved as JPEG like a phone does.
`apply(pages, rendered, conditions, rng)` returns the images and a log of what was done where.
"""

from __future__ import annotations

import math
import random

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from layouts import W, H, font

INK = ["pen", "highlighter", "coffee"]
PAPER = ["fold", "crumple"]
PHOTO = ["perspective", "shadow", "lowlight", "blur", "glare", "crop"]
ALL = INK + PAPER + PHOTO

PEN_NOTES = ["call ins.", "why 2x??", "too high!", "ask for itemized", "paid at ER?", "??", "dispute",
             "what is this", "insurance should pay", "check w/ billing", "not me?", "$$$"]


# ---------- ink ------------------------------------------------------------------------------

def _wobble_ellipse(d: ImageDraw.ImageDraw, box, rng, color, width):
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2 + rng.uniform(12, 22), (y1 - y0) / 2 + rng.uniform(3, 7)
    start = rng.uniform(0, 2 * math.pi)
    sweep = 2 * math.pi * rng.uniform(1.05, 1.25)  # pen circles overshoot
    pts = []
    for k in range(80):
        t = start + sweep * k / 79
        r = 1 + 0.06 * math.sin(3 * t + start) + rng.uniform(-0.015, 0.015)
        pts.append((cx + rx * r * math.cos(t), cy + ry * r * math.sin(t)))
    d.line(pts, fill=color, width=width, joint="curve")


def pen(img: Image.Image, rows: list[dict], rng: random.Random, page_no: int) -> list[str]:
    d = ImageDraw.Draw(img)
    color = rng.choice([(24, 44, 150), (20, 20, 24), (30, 60, 170)])
    log = []
    mine = [r for r in rows if r["page"] == page_no]
    if not mine:
        return log
    for r in rng.sample(mine, min(len(mine), rng.randint(1, 3))):
        _wobble_ellipse(d, r["charge"], rng, color, rng.randint(3, 4))
        log.append(f"circled the charge on printed line {r['line'] + 1}")
    r = rng.choice(mine)
    x, y = r["row"][0] - 6, (r["row"][1] + r["row"][3]) / 2
    if x > 40:
        d.line([(x - 30, y), (x - 20, y + 10), (x - 2, y - 16)], fill=color, width=4)
        log.append(f"check mark next to printed line {r['line'] + 1}")
    # A margin note with an arrow toward a line.
    r = rng.choice(mine)
    note = rng.choice(PEN_NOTES)
    f = font(rng.choice(["hand", "marker", "note"]), rng.randint(26, 34))
    tx = rng.randint(int(W * 0.45), int(W * 0.62))
    ty = max(20, r["row"][1] - rng.randint(40, 70))
    layer = Image.new("RGBA", (int(d.textlength(note, font=f)) + 20, f.size + 24), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((10, 6), note, font=f, fill=color + (255,))
    layer = layer.rotate(rng.uniform(-8, 8), expand=True, resample=Image.BICUBIC)
    img.paste(layer, (tx, ty), layer)
    # The arrow ends just above the row, pointing down at it, so it never strikes through printed text.
    d.line([(tx + layer.width // 2, ty + layer.height - 4), (r["charge"][0] - 16, r["row"][1] - 3)], fill=color, width=3)
    log.append(f'note "{note}" pointing at printed line {r["line"] + 1}')
    # Sometimes a written number next to a charge: not printed, so never part of the bill.
    if rng.random() < 0.45:
        r = rng.choice(mine)
        guess = rng.choice(["1,200?", "450", "800 ok", "-100", "paid 50"])
        f = font("hand", 28)
        cx = r["charge"][2] + 8
        if cx + d.textlength(guess, font=f) < W - 4:
            d.text((cx, r["charge"][1] - 6), guess, font=f, fill=color)
        else:
            d.text((r["charge"][0] - d.textlength(guess, font=f) - 60, r["charge"][1] - 22), guess, font=f, fill=color)
        log.append(f'wrote "{guess}" beside the charge on printed line {r["line"] + 1}')
    return log


def highlighter(img: Image.Image, rows: list[dict], rng: random.Random, page_no: int) -> list[str]:
    mine = [r for r in rows if r["page"] == page_no]
    if not mine:
        return []
    a = np.asarray(img).astype(np.float32)
    k = rng.randint(1, min(3, len(mine)))
    start = rng.randrange(0, len(mine) - k + 1)
    color = np.array(rng.choice([(255, 238, 70), (255, 230, 90), (180, 255, 120), (255, 170, 220)]), np.float32) / 255
    mask = np.zeros(a.shape[:2], np.float32)
    for r in mine[start:start + k]:
        x0, y0, x1, y1 = r["row"]
        x0 += rng.randint(-10, 60)
        x1 -= rng.randint(-10, 30)
        pts = np.array([[x0, y0 + 2 + rng.randint(-3, 3)], [x1, y0 + rng.randint(-4, 4)],
                        [x1, y1 - rng.randint(-3, 3)], [x0, y1 - 2 + rng.randint(-4, 4)]], np.int32)
        cv2.fillPoly(mask, [pts], 1.0)
    mask = cv2.GaussianBlur(mask, (5, 5), 0) * rng.uniform(0.55, 0.8)
    tint = 1 - mask[..., None] * (1 - color[None, None, :])
    a = a * tint
    return_img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    img.paste(return_img)
    return [f"highlighted printed lines {', '.join(str(r['line'] + 1) for r in mine[start:start + k])}"]


def coffee(img: Image.Image, rows: list[dict], rng: random.Random, page_no: int) -> list[str]:
    mine = [r for r in rows if r["page"] == page_no]
    a = np.asarray(img).astype(np.float32)
    hh, ww = a.shape[:2]
    if mine and rng.random() < 0.6:
        r = rng.choice(mine)
        cx, cy = r["charge"][0] + rng.randint(-60, 40), r["row"][1] + rng.randint(-30, 30)
        where = f"over the charges near printed line {r['line'] + 1}"
    else:
        cx, cy = rng.randint(200, ww - 200), rng.randint(300, hh - 300)
        where = "on the page"
    rad = rng.randint(70, 115)
    yy, xx = np.mgrid[0:hh, 0:ww].astype(np.float32)
    ang = np.arctan2(yy - cy, xx - cx)
    wob = 1 + 0.05 * np.sin(3 * ang + rng.uniform(0, 6)) + 0.03 * np.sin(7 * ang + rng.uniform(0, 6))
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (rad * wob)
    ring = np.exp(-((dist - 1) / 0.035) ** 2) * (0.5 + 0.5 * np.clip(np.sin(ang * 2 + rng.uniform(0, 6)) + 0.6, 0, 1))
    fill = np.clip(1 - dist, 0, 1) ** 0.4 * rng.uniform(0.15, 0.3)
    m = np.clip(ring * rng.uniform(0.45, 0.65) + fill, 0, 0.75)
    stain = np.array([0.62, 0.42, 0.22], np.float32)
    a = a * (1 - m[..., None] * (1 - stain[None, None, :]))
    img.paste(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)))
    return [f"coffee ring {where}"]


# ---------- paper ----------------------------------------------------------------------------

def _remap(a: np.ndarray, dx: np.ndarray, dy: np.ndarray) -> np.ndarray:
    hh, ww = a.shape[:2]
    gx, gy = np.meshgrid(np.arange(ww, dtype=np.float32), np.arange(hh, dtype=np.float32))
    return cv2.remap(a, gx + dx, gy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def fold(img: Image.Image, rng: random.Random) -> tuple[Image.Image, str]:
    a = np.asarray(img).astype(np.float32)
    hh, ww = a.shape[:2]
    yy, xx = np.mgrid[0:hh, 0:ww].astype(np.float32)
    shade = np.ones((hh, ww), np.float32)
    dy = np.zeros((hh, ww), np.float32)
    dx = np.zeros((hh, ww), np.float32)
    n = rng.choice([1, 2, 2])
    kinds = []
    for k in range(n):
        if k == 0:  # letter fold: horizontal at a third of the page
            y0 = hh * rng.choice([1 / 3, 2 / 3]) + rng.uniform(-40, 40)
            slope = rng.uniform(-0.03, 0.03)
            s = (yy - (y0 + slope * (xx - ww / 2)))
            kinds.append("horizontal")
        else:  # a half fold the other way
            x0 = ww / 2 + rng.uniform(-60, 60)
            s = (xx - x0)
            kinds.append("vertical")
        side = np.tanh(s / 6)
        shade *= 1 - 0.07 * side * rng.choice([-1, 1]) - 0.16 * np.exp(-(s / 5) ** 2)
        kink = 2.5 * np.exp(-(s / 40) ** 2) * rng.choice([-1, 1])
        if kinds[-1] == "horizontal":
            dy += kink
        else:
            dx += kink
    a = _remap(a, dx, dy) * shade[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), f"{n} fold crease(s): {', '.join(kinds)}"


def crumple(img: Image.Image, rng: random.Random) -> tuple[Image.Image, str]:
    """Paper crumpled into a ball and smoothed out: broad facets between sharp creases, a little warping."""
    a = np.asarray(img).astype(np.float32)
    hh, ww = a.shape[:2]
    nr = np.random.default_rng(rng.randint(0, 2**31))
    height = np.zeros((hh, ww), np.float32)
    for scale, amp in [(70, 6.0), (160, 10.0), (360, 14.0)]:
        g = nr.normal(0, 1, (hh // scale + 3, ww // scale + 3)).astype(np.float32)
        height += amp * cv2.resize(g, (ww, hh), interpolation=cv2.INTER_CUBIC)
    yy, xx = np.mgrid[0:hh, 0:ww].astype(np.float32)
    n = rng.randint(7, 12)
    for _ in range(n):  # creases: long V-shaped ridges or valleys that fade out along their length
        x0, y0 = rng.uniform(0, ww), rng.uniform(0, hh)
        th = rng.uniform(0, math.pi)
        dist = (xx - x0) * math.sin(th) - (yy - y0) * math.cos(th)
        along = (xx - x0) * math.cos(th) + (yy - y0) * math.sin(th)
        fade = np.exp(-(along / rng.uniform(300, 900)) ** 2)
        height += rng.choice([-1, 1]) * rng.uniform(6, 12) * np.exp(-np.abs(dist) / 60) * fade
    gy, gx = np.gradient(height)
    lx, ly = rng.uniform(-1, 1), rng.uniform(-1, 1)
    norm = math.hypot(lx, ly) or 1
    shade = 1 + np.clip((gx * lx + gy * ly) / norm * 0.3, -0.16, 0.1)
    dx, dy = gx * 6, gy * 6  # at most a few pixels: the text bends, it doesn't break
    a = _remap(a, np.clip(dx, -4, 4).astype(np.float32), np.clip(dy, -4, 4).astype(np.float32)) * shade[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), f"crumpled and smoothed out ({n} creases)"


# ---------- photo ----------------------------------------------------------------------------

def _desk(w: int, h: int, rng: random.Random) -> np.ndarray:
    base = np.array(rng.choice([(118, 86, 60), (92, 78, 66), (150, 140, 128), (70, 72, 78), (176, 168, 150), (44, 46, 52)]), np.float32)
    nr = np.random.default_rng(rng.randint(0, 2**31))
    streak = cv2.resize(nr.normal(0, 1, (h // 3 + 1, 4)).astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)
    a = base[None, None, :] + streak[..., None] * 10 + nr.normal(0, 3, (h, w, 1))
    return np.clip(a, 0, 255).astype(np.float32)


def photograph(pg: Image.Image, protect: list[tuple], conds: list[str], rng: random.Random, out_w: int = 1400) -> tuple[Image.Image, list[str]]:
    """Put the page on a desk and shoot it. `protect` boxes (page coords) are kept in frame when cropping."""
    log = []
    pad = 170
    cw, ch = W + 2 * pad, H + 2 * pad
    src = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
    strong = "perspective" in conds
    tilt = rng.uniform(-12, 12) if strong else rng.uniform(-3, 3)
    if "crop" in conds:
        tilt = rng.uniform(-2, 2)
    th = math.radians(tilt)
    c, s = math.cos(th), math.sin(th)
    ctr = np.float32([W / 2, H / 2])
    dst = []
    for x, y in src:
        vx, vy = x - ctr[0], y - ctr[1]
        dst.append([cw / 2 + c * vx - s * vy, ch / 2 + s * vx + c * vy])
    dst = np.float32(dst)
    if strong:  # keystone: one edge farther from the camera
        k = rng.uniform(0.08, 0.16) * W
        side = rng.choice(["top", "bottom", "left", "right"])
        shrink = {"top": [0, 1], "bottom": [3, 2], "left": [0, 3], "right": [1, 2]}[side]
        a_, b_ = shrink
        mid = (dst[a_] + dst[b_]) / 2
        dst[a_] += (mid - dst[a_]) * (k / W) * 2
        dst[b_] += (mid - dst[b_]) * (k / W) * 2
        log.append(f"shot at an angle ({side} edge farther), tilted {tilt:.0f} degrees")
    jitter = 0.0 if strong else 6.0
    dst += np.float32([[rng.uniform(-jitter, jitter), rng.uniform(-jitter, jitter)] for _ in range(4)])
    M = cv2.getPerspectiveTransform(src, dst)
    page = np.asarray(pg).astype(np.float32)
    page = page * 0.94 + np.float32([246, 243, 236]) * 0.06
    desk = _desk(cw, ch, rng)
    # Soft drop shadow under the paper.
    mask = cv2.warpPerspective(np.ones((H, W), np.float32), M, (cw, ch))
    sh = cv2.GaussianBlur(np.roll(np.roll(mask, 14, 0), 10, 1), (0, 0), 16)
    desk *= (1 - 0.45 * sh)[..., None]
    warped = cv2.warpPerspective(page, M, (cw, ch), flags=cv2.INTER_LINEAR)
    a = desk * (1 - mask[..., None]) + warped * mask[..., None]
    hh, ww = a.shape[:2]
    yy, xx = np.mgrid[0:hh, 0:ww].astype(np.float32)

    # Uneven room light.
    cx, cy = rng.uniform(0.3, 0.7) * ww, rng.uniform(0.2, 0.5) * hh
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / math.hypot(ww, hh)
    a *= (1.05 - 0.4 * dist)[..., None]

    if "shadow" in conds:
        # A hard-edged shadow from a hand or phone: a polygon from one edge, darkened, edge only a little soft.
        edge = rng.choice(["left", "right", "top", "bottom"])
        depth = rng.uniform(0.25, 0.45)
        if edge in ("left", "right"):
            x_in = depth * ww if edge == "left" else (1 - depth) * ww
            xo = 0 if edge == "left" else ww
            pts = [(xo, rng.uniform(0, 0.3) * hh), (x_in, rng.uniform(0.15, 0.4) * hh), (x_in + rng.uniform(-80, 80), rng.uniform(0.6, 0.95) * hh), (xo, hh)]
        else:
            y_in = depth * hh if edge == "top" else (1 - depth) * hh
            yo = 0 if edge == "top" else hh
            pts = [(rng.uniform(0, 0.3) * ww, yo), (rng.uniform(0.1, 0.4) * ww, y_in), (rng.uniform(0.6, 0.9) * ww, y_in + rng.uniform(-80, 80)), (ww, yo)]
        m = np.zeros((hh, ww), np.float32)
        cv2.fillPoly(m, [np.array(pts, np.int32)], 1.0)
        m = cv2.GaussianBlur(m, (0, 0), rng.uniform(4, 9))
        dark = rng.uniform(0.25, 0.35) if "lowlight" in conds else rng.uniform(0.4, 0.55)
        a *= (1 - dark * m)[..., None]
        a[..., 2] *= (1 + 0.04 * m)  # shadows look a little blue
        log.append(f"hard shadow from the {edge}, {int(dark * 100)}% darker")

    if "glare" in conds:
        gx, gy = rng.uniform(0.25, 0.75) * ww, rng.uniform(0.25, 0.7) * hh
        rx, ry = rng.uniform(90, 170), rng.uniform(60, 120)
        rot = rng.uniform(0, math.pi)
        u = ((xx - gx) * math.cos(rot) + (yy - gy) * math.sin(rot)) / rx
        v = (-(xx - gx) * math.sin(rot) + (yy - gy) * math.cos(rot)) / ry
        g = np.exp(-(u ** 2 + v ** 2) * 1.6) * rng.uniform(0.6, 0.72)
        a = a * (1 - g[..., None]) + 255 * g[..., None]
        # Glare point in page coordinates, for the log.
        inv = np.linalg.inv(M)
        p = inv @ np.array([gx, gy, 1.0])
        log.append(f"glare around page point ({int(p[0] / p[2])}, {int(p[1] / p[2])})")

    if "lowlight" in conds:
        k = rng.uniform(0.38, 0.52)
        a = 255 * (np.clip(a, 0, 255) / 255) ** rng.uniform(1.15, 1.4) * k
        a *= np.float32([1.06, 0.98, 0.84])
        nr = np.random.default_rng(rng.randint(0, 2**31))
        a += nr.normal(0, rng.uniform(5, 8), a.shape) + cv2.resize(nr.normal(0, 4, (hh // 4, ww // 4, 3)).astype(np.float32), (ww, hh))
        log.append(f"low light ({int(k * 100)}% exposure), noisy")
    else:
        a += np.random.default_rng(rng.randint(0, 2**31)).normal(0, 3, a.shape)

    a = np.clip(a, 0, 255).astype(np.uint8)
    if "blur" in conds:
        if rng.random() < 0.5:
            sig = rng.uniform(1.5, 2.1)
            a = cv2.GaussianBlur(a, (0, 0), sig)
            log.append(f"out of focus (sigma {sig:.1f} px)")
        else:
            n = rng.randint(7, 11)
            ang = rng.uniform(0, 180)
            kern = np.zeros((n, n), np.float32)
            kern[n // 2, :] = 1
            kern = cv2.warpAffine(kern, cv2.getRotationMatrix2D((n / 2 - 0.5, n / 2 - 0.5), ang, 1), (n, n))
            a = cv2.filter2D(a, -1, kern / kern.sum())
            log.append(f"motion blur ({n} px at {ang:.0f} degrees)")
    else:
        a = cv2.GaussianBlur(a, (0, 0), rng.uniform(0.5, 0.9))

    # Framing: a hand-held crop, or (crop condition) the page cut off on one or two sides.
    def mapped(pts):
        q = cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), M).reshape(-1, 2)
        return q

    corners = mapped(src)
    l, t = max(0, corners[:, 0].min() - rng.uniform(20, 90)), max(0, corners[:, 1].min() - rng.uniform(20, 90))
    r, b = min(ww, corners[:, 0].max() + rng.uniform(20, 90)), min(hh, corners[:, 1].max() + rng.uniform(20, 90))
    if "crop" in conds:
        keep = np.float32([[x, y] for (x0, y0, x1, y1) in protect for (x, y) in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]])
        km = mapped(keep)
        sides = rng.sample(["left", "right", "top", "bottom"], rng.choice([1, 2]))
        for sd in sides:
            if sd == "left":
                l = max(l, km[:, 0].min() - rng.uniform(4, 14))
            elif sd == "right":
                r = min(r, km[:, 0].max() + rng.uniform(4, 14))
            elif sd == "top":
                t = max(t, km[:, 1].min() - rng.uniform(4, 14))
            else:
                b = min(b, km[:, 1].max() + rng.uniform(4, 30))
        log.append(f"page cut off at the {' and '.join(sides)}")
    a = a[int(t):int(b), int(l):int(r)]
    img = Image.fromarray(a)
    return img.resize((out_w, round(img.height * out_w / img.width)), Image.LANCZOS), log


def scan(pg: Image.Image, rng: random.Random, out_w: int = 1275) -> Image.Image:
    """A flatbed or app scan: flat, slightly grey, a little soft."""
    a = np.asarray(pg).astype(np.float32) * 0.97 + 4
    a += np.random.default_rng(rng.randint(0, 2**31)).normal(0, 2, a.shape)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.4))
    return img if img.width == out_w else img.resize((out_w, round(img.height * out_w / img.width)), Image.LANCZOS)


def apply(rendered, conds: list[str], rng: random.Random, medium: str) -> tuple[list[Image.Image], list[str]]:
    """Ink and paper conditions on each page, then a photo (medium "photo") or a flat scan ("scan", "pdf-scan")."""
    out, log = [], []
    for k, pg in enumerate(rendered.pages):
        pg = pg.copy()
        tag = f"p{k + 1}: " if len(rendered.pages) > 1 else ""
        for c in INK:
            if c in conds and (k == 0 or rng.random() < 0.6):
                log += [tag + x for x in {"pen": pen, "highlighter": highlighter, "coffee": coffee}[c](pg, rendered.rows, rng, k)]
        for c in PAPER:
            if c in conds:
                pg, msg = (fold if c == "fold" else crumple)(pg, rng)
                log.append(tag + msg)
        if medium == "photo":
            prot = [x["box"] for x in rendered.protect if x["page"] == k]
            img, msgs = photograph(pg, prot, conds, rng)
            log += [tag + m for m in msgs]
        else:
            img = scan(pg, rng)
        out.append(img)
    return out, log
