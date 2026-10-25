"""Draw docs/results.png, the results plot in the README.

The numbers come from the eval runs and the audit described in README.md (Results).
Run: python eval/plot_results.py
"""

from pathlib import Path

import matplotlib.pyplot as plt

OUT = Path(__file__).resolve().parent.parent / "docs" / "results.png"

INK = "#1c1530"
MUTED = "#6b6580"
GRID = "#e7e3ef"
PURPLE = "#5b21b6"
GRAY = "#b9b4c4"

# Lines read right on the 30 eval bills (181 lines).
READ = [
    ("Claude (main read)", 100.0, "181 of 181"),
    ("Azure Document Intelligence", 100.0, "181 of 181"),
    ("Azure gpt-4.1-mini", 95.6, "95.6%"),
]
# Planted errors caught, end to end, out of 24.
CAUGHT = [
    ("Claude (main read)", 24, "24 of 24"),
    ("Azure gpt-4.1-mini", 18, "18 of 24"),
]
# Statewide audit, each hospital counted once under its strongest result.
AUDIT = [
    ("Plain conflict with state law", 14, "#2a004d"),
    ("Likely conflict", 47, "#7c3aed"),
    ("Wording worth asking about", 192, "#c4b5fd"),
]


def style(ax, title, xmax):
    ax.set_title(title, loc="left", fontsize=12, fontweight="bold", color=INK, pad=12)
    ax.set_xlim(0, xmax)
    ax.invert_yaxis()
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(axis="y", length=0, labelsize=10, labelcolor=INK)
    ax.tick_params(axis="x", colors=MUTED, labelsize=9)
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def bars(ax, labels, values, colors, texts, xmax):
    ax.barh(labels, values, color=colors, height=0.55)
    for i, (v, t) in enumerate(zip(values, texts)):
        ax.text(v + xmax * 0.015, i, t, va="center", fontsize=10, color=INK)


def main():
    plt.rcParams["font.family"] = ["Helvetica Neue", "Arial", "DejaVu Sans"]
    fig, axes = plt.subplots(3, 1, figsize=(9, 8.2), gridspec_kw={"height_ratios": [3, 2, 3]})
    fig.patch.set_facecolor("white")

    ax = axes[0]
    style(ax, "Bill lines read right, 30 eval bills (%)", 118)
    bars(ax, [r[0] for r in READ], [r[1] for r in READ],
         [PURPLE if r[0].startswith("Claude") else GRAY for r in READ], [r[2] for r in READ], 118)

    ax = axes[1]
    style(ax, "Planted billing errors caught, read then checked", 28.5)
    bars(ax, [r[0] for r in CAUGHT], [r[1] for r in CAUGHT],
         [PURPLE if r[0].startswith("Claude") else GRAY for r in CAUGHT], [r[2] for r in CAUGHT], 28.5)

    ax = axes[2]
    style(ax, "California hospitals flagged by the policy audit (of 470)", 225)
    bars(ax, [r[0] for r in AUDIT], [r[1] for r in AUDIT], [r[2] for r in AUDIT],
         [str(r[1]) for r in AUDIT], 225)

    fig.text(0.01, 0.005, "Eval bills are generated from real SF hospital prices. Audit covers all 470 hospitals in the HCAI registry.",
             fontsize=8.5, color=MUTED)
    fig.tight_layout(h_pad=2.2, rect=(0, 0.02, 1, 1))
    OUT.parent.mkdir(exist_ok=True)
    fig.savefig(OUT, dpi=200, facecolor="white")
    print(OUT)


if __name__ == "__main__":
    main()
