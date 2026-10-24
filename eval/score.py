"""Score the app's bill reading and its findings against the generator's answer key.

  python -I score.py --pred preds/            # preds/<id>.parsed.json [+ <id>.findings.json]
  python -I score.py --oracle                 # truth bills as predictions: tests the rules alone

Predictions per bill, in --pred:
  <id>.parsed.json    the ParsedBill the reader returned
  <id>.findings.json  optional, the Finding[] the app produced (convex/lib/checks.ts shape).
                      If missing, findings are computed with checks.py (the Python mirror of
                      checks.ts) from the predicted bill and out/refs/<hospital>.json.

(a) Reading: line precision/recall on (code, charge) pairs, plus exact match of total
    charges, amount due and the itemized flag.
(b) Findings: planted errors caught / missed, and false alarms. CASH_PRICE_GAP is advice,
    not an error, so it never counts as a false alarm. A finding matches a planted error
    when the kind is the same and, for line errors, it points at the same bill line
    (predicted line indexes are mapped to truth lines through the reading match).
Writes score.md and score.json next to the predictions and prints the markdown.
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parent))  # -I leaves the script dir off sys.path

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

from checks import check_bill
from prices import _norm

HERE = Path(__file__).resolve().parent
ERROR_KINDS = ["DUPLICATE_LINE", "ABOVE_LIST_PRICE", "TOTAL_MISMATCH", "NOT_ITEMIZED"]


def line_key(l: dict) -> tuple:
    return (_norm(l.get("code")) or "", round(float(l.get("charge") or 0), 2))


def match_lines(truth: list[dict], pred: list[dict]) -> dict[int, int]:
    """Greedy in-order multiset match on (code, charge). Returns {pred_index: truth_index}."""
    free: dict[tuple, list[int]] = defaultdict(list)
    for i, l in enumerate(truth):
        free[line_key(l)].append(i)
    out = {}
    for j, l in enumerate(pred):
        slots = free.get(line_key(l))
        if slots:
            out[j] = slots.pop(0)
    return out


def money_eq(a, b) -> bool:
    if a is None or b is None:
        return a is None and b is None
    return abs(float(a) - float(b)) < 0.005


def score_bill(truth: dict, pred: dict, findings: list[dict]) -> dict:
    tb, pb = truth["bill"], pred
    tl, pl = tb.get("lines") or [], pb.get("lines") or []
    m = match_lines(tl, pl)
    reading = {
        "truthLines": len(tl), "predLines": len(pl), "matched": len(m),
        "total": money_eq(tb.get("totalCharges"), pb.get("totalCharges")),
        "amountDue": money_eq(tb.get("amountDue"), pb.get("amountDue")),
        "itemized": bool(tb.get("isItemized")) == bool(pb.get("isItemized")),
    }
    # Findings: map predicted line indexes into truth indexes.
    preds = [f for f in findings if f.get("kind") in ERROR_KINDS]
    used = [False] * len(preds)
    caught, missed = [], []
    for e in truth["errors"]:
        hit = None
        for k, f in enumerate(preds):
            if used[k] or f["kind"] != e["kind"]:
                continue
            mapped = {m.get(i, -1 - i) for i in f.get("lines", [])}
            if not e["lines"] or mapped & set(e["lines"]):
                hit = k
                break
        if hit is None:
            missed.append(e["kind"])
        else:
            used[hit] = True
            caught.append(e["kind"])
    false_alarms = [preds[k]["kind"] for k in range(len(preds)) if not used[k]]
    return {"id": truth["id"], "reading": reading, "caught": caught, "missed": missed,
            "falseAlarms": false_alarms, "clean": not truth["errors"], "variant": truth.get("variant")}


def pct(a: int, b: int) -> str:
    return "n/a" if b == 0 else f"{100 * a / b:.1f}%"


def summarize(rows: list[dict], label: str) -> tuple[str, dict]:
    tl = sum(r["reading"]["truthLines"] for r in rows)
    pl = sum(r["reading"]["predLines"] for r in rows)
    mt = sum(r["reading"]["matched"] for r in rows)
    n = len(rows)
    tot = sum(r["reading"]["total"] for r in rows)
    due = sum(r["reading"]["amountDue"] for r in rows)
    item = sum(r["reading"]["itemized"] for r in rows)
    caught = Counter(k for r in rows for k in r["caught"])
    missed = Counter(k for r in rows for k in r["missed"])
    fa = Counter(k for r in rows for k in r["falseAlarms"])
    clean = [r for r in rows if r["clean"]]
    clean_fa = sum(1 for r in clean if r["falseAlarms"])
    perfect = sum(1 for r in rows if not r["missed"] and not r["falseAlarms"])

    by_variant = defaultdict(list)
    for r in rows:
        by_variant[r["variant"]].append(r)

    md = [f"# Recount eval: {label}", "", f"{n} bills ({len(clean)} clean, {n - len(clean)} with planted errors)", ""]
    md += ["## Reading", "", "| metric | value |", "|---|---|",
           f"| line precision (code, charge) | {pct(mt, pl)} ({mt}/{pl}) |",
           f"| line recall (code, charge) | {pct(mt, tl)} ({mt}/{tl}) |",
           f"| total charges exact | {pct(tot, n)} ({tot}/{n}) |",
           f"| amount due exact | {pct(due, n)} ({due}/{n}) |",
           f"| itemized flag correct | {pct(item, n)} ({item}/{n}) |", ""]
    if len(by_variant) > 1:
        md += ["| variant | bills | line recall | total exact |", "|---|---|---|---|"]
        for v, rs in sorted(by_variant.items()):
            vt = sum(r["reading"]["truthLines"] for r in rs)
            vm = sum(r["reading"]["matched"] for r in rs)
            md.append(f"| {v} | {len(rs)} | {pct(vm, vt)} | {pct(sum(r['reading']['total'] for r in rs), len(rs))} |")
        md.append("")
    md += ["## Findings", "", "| kind | planted | caught | missed | false alarms |", "|---|---|---|---|---|"]
    for k in ERROR_KINDS:
        md.append(f"| {k} | {caught[k] + missed[k]} | {caught[k]} | {missed[k]} | {fa[k]} |")
    allc, allm, allf = sum(caught.values()), sum(missed.values()), sum(fa.values())
    md.append(f"| **all** | {allc + allm} | {allc} | {allm} | {allf} |")
    md += ["", f"- caught: {pct(allc, allc + allm)} of planted errors",
           f"- clean bills with any false alarm: {clean_fa}/{len(clean)}",
           f"- bills fully right (nothing missed, no false alarm): {perfect}/{n}"]
    bad = [r for r in rows if r["missed"] or r["falseAlarms"]]
    if bad:
        md += ["", "### Bills with misses or false alarms", "", "| bill | missed | false alarms | lines matched |", "|---|---|---|---|"]
        for r in bad:
            rd = r["reading"]
            md.append(f"| {r['id']} | {', '.join(r['missed']) or '-'} | {', '.join(r['falseAlarms']) or '-'} | {rd['matched']}/{rd['truthLines']} |")
    summary = {
        "label": label, "bills": n, "cleanBills": len(clean),
        "reading": {"linePrecision": mt / pl if pl else None, "lineRecall": mt / tl if tl else None,
                    "totalExact": tot / n if n else None, "amountDueExact": due / n if n else None,
                    "itemizedCorrect": item / n if n else None},
        "findings": {k: {"caught": caught[k], "missed": missed[k], "falseAlarms": fa[k]} for k in ERROR_KINDS},
        "caughtRate": allc / (allc + allm) if allc + allm else None,
        "cleanBillsWithFalseAlarm": clean_fa,
        "perBill": rows,
    }
    return "\n".join(md) + "\n", summary


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--truth", type=Path, default=HERE / "out")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--pred", type=Path, help="directory with <id>.parsed.json files")
    g.add_argument("--oracle", action="store_true", help="use the truth bills as predictions")
    a = ap.parse_args()

    truths = sorted(a.truth.glob("bill-*.truth.json"))
    if not truths:
        raise SystemExit(f"no truth files in {a.truth}; run generate.py first")
    rows, skipped, computed = [], [], 0
    for tp in truths:
        truth = json.loads(tp.read_text())
        bid = truth["id"]
        ref_path = a.truth / truth["ref"]
        ref = json.loads(ref_path.read_text()) if ref_path.exists() else None
        if a.oracle:
            pred = truth["bill"]
            findings = check_bill(pred, ref)
            computed += 1
        else:
            pp = a.pred / f"{bid}.parsed.json"
            if not pp.exists():
                skipped.append(bid)
                continue
            pred = json.loads(pp.read_text())
            fp = a.pred / f"{bid}.findings.json"
            if fp.exists():
                findings = json.loads(fp.read_text())
            else:
                findings = check_bill(pred, ref)
                computed += 1
        rows.append(score_bill(truth, pred, findings))
    if not rows:
        raise SystemExit("no predictions matched any truth file")

    label = "oracle (perfect reading, rules only)" if a.oracle else f"predictions in {a.pred}"
    md, summary = summarize(rows, label)
    notes = []
    if computed:
        notes.append(f"- findings for {computed} bills computed with checks.py (mirror of convex/lib/checks.ts)")
    if skipped:
        notes.append(f"- {len(skipped)} bills had no prediction and were skipped: {', '.join(skipped)}")
    if notes:
        md += "\n" + "\n".join(notes) + "\n"
    summary["skipped"] = skipped
    out_dir = a.truth if a.oracle else a.pred
    stem = "score-oracle" if a.oracle else "score"
    (out_dir / f"{stem}.md").write_text(md)
    (out_dir / f"{stem}.json").write_text(json.dumps(summary, indent=1))
    print(md)


if __name__ == "__main__":
    main()
