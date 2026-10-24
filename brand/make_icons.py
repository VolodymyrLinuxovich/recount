"""Build every Recount icon from the logo geometry (Lupa's lens over a bill, rim = return arrow,
the total struck through). Same shapes as RecountMark in the web app.

Writes SVG sources to brand/ and PNGs (rendered with headless Chrome) to the web and mobile apps.
Usage: python3 -I brand/make_icons.py
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

LIGHT = dict(rim="#5b21b6", glass="#eee9ff", lines="#2a004d", strike="#ff4b4b", handle="#ffc800")
DARK = dict(rim="#b3a4ff", glass="#2e1a55", lines="#f5f0ff", strike="#ff4b4b", handle="#ffc800")
WHITE = dict(rim="#ffffff", glass="none", lines="#ffffff", strike="#ffffff", handle="#ffffff")
INK = "#2a004d"


def mark(c: dict) -> str:
    """The mark in its own 64x64 box (same paths as Logo.tsx)."""
    return f"""<path d="M41 41 L55 55" stroke="{c['handle']}" stroke-width="9" stroke-linecap="round"/>
  <circle cx="27" cy="27" r="19" fill="{c['glass']}"/>
  <g stroke="{c['lines']}" stroke-linecap="round">
    <path d="M18 20.5 H36" stroke-width="3.2"/><path d="M18 27 H31" stroke-width="3.2"/><path d="M18 33.5 H36" stroke-width="3.2"/>
  </g>
  <path d="M15.5 37.5 L38.5 29.5" stroke="{c['strike']}" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M39.2 12.45 A19 19 0 1 1 20.5 9.15" fill="none" stroke="{c['rim']}" stroke-width="5" stroke-linecap="round"/>
  <path d="M27 7 L21.6 15.2 L17.4 4.2 Z" fill="{c['rim']}" stroke="{c['rim']}" stroke-width="1.5" stroke-linejoin="round"/>"""


def icon(colors: dict, bg: str | None, rx: float, scale: float) -> str:
    """Mark centered in a 100x100 canvas. The mark's drawn bounds are about x 3-58, y 3-58."""
    s = 100 * scale / 56
    tx = 50 - 30.5 * s
    ty = 50 - 30.5 * s
    back = f'<rect width="100" height="100" rx="{rx}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024">{back}'
            f'<g transform="translate({tx:.2f} {ty:.2f}) scale({s:.4f})">{mark(colors)}</g></svg>')


VARIANTS = {
    "logo": icon(DARK, INK, 22, 0.66),            # rounded tile: README, Apify, slides
    "square": icon(DARK, INK, 0, 0.66),           # iOS app icon (iOS rounds the corners itself)
    "maskable": icon(DARK, INK, 0, 0.54),         # Android/web maskable: inside the safe zone
    "fg": icon(DARK, None, 0, 0.5),               # Android adaptive foreground (over INK background)
    "bg": f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024"><rect width="100" height="100" fill="{INK}"/></svg>',
    "mono": icon(WHITE, None, 0, 0.5),            # Android 13 themed icon
    "splash": icon(LIGHT, None, 0, 0.8),          # splash on white
    "mark-light": icon(LIGHT, None, 0, 0.96),     # transparent mark for light backgrounds
    "mark-dark": icon(DARK, None, 0, 0.96),       # transparent mark for dark backgrounds
}

OUTPUTS = [  # (variant, path, size)
    ("logo", "public/icons/icon-192.png", 192),
    ("logo", "public/icons/icon-512.png", 512),
    ("maskable", "public/icons/icon-maskable-512.png", 512),
    ("square", "src/app/apple-icon.png", 180),
    ("logo", "src/app/icon.png", 256),
    ("square", "mobile/assets/icon.png", 1024),
    ("fg", "mobile/assets/android-icon-foreground.png", 1024),
    ("bg", "mobile/assets/android-icon-background.png", 1024),
    ("mono", "mobile/assets/android-icon-monochrome.png", 1024),
    ("splash", "mobile/assets/splash-icon.png", 1024),
    ("logo", "mobile/assets/favicon.png", 64),
    ("logo", "brand/logo-512.png", 512),
]


def main() -> None:
    from PIL import Image

    brand = ROOT / "brand"
    for name, svg in VARIANTS.items():
        (brand / f"{name}.svg").write_text(svg)
    with tempfile.TemporaryDirectory() as tmp:
        for name in VARIANTS:
            png = Path(tmp) / f"{name}.png"
            subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                            "--default-background-color=00000000", f"--screenshot={png}",
                            "--window-size=1024,1024", f"file://{brand / (name + '.svg')}"],
                           check=True, capture_output=True)
        for name, rel, size in OUTPUTS:
            Image.open(Path(tmp) / f"{name}.png").convert("RGBA").resize((size, size), Image.LANCZOS).save(ROOT / rel)
            print("wrote", rel)


if __name__ == "__main__":
    main()
