"""Score EOB reading and the bill-vs-EOB findings against the generator's answer key.

  python -I score.py --pred preds/      # preds/<id>.eob.json [+ <id>.findings.json]
  python -I score.py --oracle           # truth EOBs as predictions: tests the answer key and rules alone

Predictions per pair, in --pred:
  <id>.eob.json        the ParsedEob the reader returned
  <id>.findings.json   optional, the app's EOB findings (Finding[] from checkEob). If missing, findings
                       are computed with eobchecks.py from the predicted EOB and the truth bill, so a
                       miss is the EOB reading's fault, not the bill's.

(a) Reading: exact match of the money totals (billed, allowed, plan paid, patient owes), network,
    claimStatus, emergency, isEob and service dates; line precision/recall on (code, billed);
    per-line money fields on matched lines.
(b) Findings: per kind, planted / caught / missed / false alarms, and whether a caught finding has
    the right amount (to the cent). NOT_ON_EOB must also point at the same bill line.
Writes score.md and score.json next to the predictions (score-oracle.* in out/ for --oracle).
"""

from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_HERE = _Path(__file__).resolve().parent
_sys.path[:0] = [str(_HERE)]  # -I leaves the script dir off sys.path

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

from eobchecks import EOB_KINDS, check_eob, norm_code

HERE = _HERE
TOTALS = ["totalBilled", "totalAllowed", "totalPlanPaid", "totalPatientOwes"]
FIELDS = ["isEob", "network", "claimStatus", "emergency", "serviceDateFrom", "serviceDateTo"]
LINE_MONEY = ["allowed", "planPaid", "patientOwes", "notCovered"]


def money_eq(a, b) -> bool:
    if a is None or b is None:
        return a is None and b is None
    return abs(float(a) - float(b)) < 0.005


def line_key(l: dict) -> tuple:
    b = l.get("billed")
    return (norm_code(l.get("code")) or "", None if b is None else round(float(b), 2))


def match_lines(truth: list[dict], pred: list[dict]) -> dict[int, int]:
    """Greedy in-order multiset match on (code, billed). Returns {pred_index: truth_index}."""
    free: dict[tuple, list[int]] = defaultdict(list)
    for i, l in enumerate(truth):
        free[line_key(l)].append(i)
    out = {}
    for j, l in enumerate(pred):
        slots = free.get(line_key(l))
        if slots:
            out[j] = slots.pop(0)
    return out


def remark_code(r) -> str:
    return (r or "").split(" ", 1)[0].upper()


def score_reading(t: dict, p: dict) -> dict:
    tl, pl = t.get("lines") or [], p.get("lines") or []
    m = match_lines(tl, pl)
    line_fields = Counter()
    for j, i in m.items():
        for k in LINE_MONEY:
            line_fields[k] += money_eq(tl[i].get(k), pl[j].get(k))
        line_fields["remark"] += remark_code(tl[i].get("remark")) == remark_code(pl[j].get("remark"))
    return {
        "totals": {k: money_eq(t.get(k), p.get(k)) for k in TOTALS},
        "fields": {k: t.get(k) == p.get(k) for k in FIELDS},
        "truthLines": len(tl), "predLines": len(pl), "matched": len(m),
        "lineFields": dict(line_fields),
    }


def score_findings(truth: dict, found: list[dict]) -> dict:
    planted = truth["findings"]
    preds = [f for f in found if f.get("kind") in EOB_KINDS]
    used = [False] * len(preds)
    caught, missed, wrong_amount = [], [], []
    for e in planted:
        hit = None
        for k, f in enumerate(preds):
            if used[k] or f["kind"] != e["kind"]:
                continue
            if e["kind"] == "NOT_ON_EOB" and set(f.get("lines") or []) != set(e["lines"]):
                continue
            hit = k
            break
        if hit is None:
            missed.append(e["kind"])
            continue
        used[hit] = True
        caught.append(e["kind"])
        if not money_eq(e["amount"], preds[hit].get("amount")):
            wrong_amount.append({"kind": e["kind"], "want": e["amount"], "got": preds[hit].get("amount")})
    return {"caught": caught, "missed": missed, "wrongAmount": wrong_amount,
            "falseAlarms": [preds[k]["kind"] for k in range(len(preds)) if not used[k]]}


def pct(a: float, b: float) -> str:
    return "n/a" if b == 0 else f"{100 * a / b:.1f}%"


def summarize(rows: list[dict], label: str) -> tuple[str, dict]:
    n = len(rows)
    tl = sum(r["reading"]["truthLines"] for r in rows)
    pl = sum(r["reading"]["predLines"] for r in rows)
    mt = sum(r["reading"]["matched"] for r in rows)
    caught = Counter(k for r in rows for k in r["findings"]["caught"])
    missed = Counter(k for r in rows for k in r["findings"]["missed"])
    fa = Counter(k for r in rows for k in r["findings"]["falseAlarms"])
    wrong = Counter(w["kind"] for r in rows for w in r["findings"]["wrongAmount"])
    clean = [r for r in rows if not r["planted"]]
    clean_fa = sum(1 for r in clean if r["findings"]["falseAlarms"])
    perfect = sum(1 for r in rows if not (r["findings"]["missed"] or r["findings"]["falseAlarms"] or r["findings"]["wrongAmount"]))

    md = [f"# Recount EOB eval: {label}", "", f"{n} bill + EOB pairs ({len(clean)} clean, {n - len(clean)} with planted problems)", ""]
    md += ["## Reading the EOB", "", "| field | exact |", "|---|---|"]
    for k in TOTALS:
        c = sum(r["reading"]["totals"][k] for r in rows)
        md.append(f"| {k} | {pct(c, n)} ({c}/{n}) |")
    for k in FIELDS:
        c = sum(r["reading"]["fields"][k] for r in rows)
        md.append(f"| {k} | {pct(c, n)} ({c}/{n}) |")
    md += ["", "| lines | value |", "|---|---|",
           f"| line precision (code, billed) | {pct(mt, pl)} ({mt}/{pl}) |",
           f"| line recall (code, billed) | {pct(mt, tl)} ({mt}/{tl}) |"]
    for k in LINE_MONEY + ["remark"]:
        c = sum(r["reading"]["lineFields"].get(k, 0) for r in rows)
        md.append(f"| matched lines with {k} exact | {pct(c, mt)} ({c}/{mt}) |")
    md.append("")
    by_variant = defaultdict(list)
    for r in rows:
        by_variant[r["variant"]].append(r)
    if len(by_variant) > 1:
        md += ["| EOB image | pairs | line recall | patient owes exact |", "|---|---|---|---|"]
        for v, rs in sorted(by_variant.items()):
            vt = sum(r["reading"]["truthLines"] for r in rs)
            vm = sum(r["reading"]["matched"] for r in rs)
            vo = sum(r["reading"]["totals"]["totalPatientOwes"] for r in rs)
            md.append(f"| {v} | {len(rs)} | {pct(vm, vt)} | {pct(vo, len(rs))} |")
        md.append("")
    md += ["## Findings", "", "| kind | planted | caught | missed | wrong amount | false alarms |", "|---|---|---|---|---|---|"]
    for k in EOB_KINDS:
        md.append(f"| {k} | {caught[k] + missed[k]} | {caught[k]} | {missed[k]} | {wrong[k]} | {fa[k]} |")
    allc, allm, allf, allw = sum(caught.values()), sum(missed.values()), sum(fa.values()), sum(wrong.values())
    md.append(f"| **all** | {allc + allm} | {allc} | {allm} | {allw} | {allf} |")
    md += ["", f"- caught: {pct(allc, allc + allm)} of planted findings ({allc - allw} with the right amount)",
           f"- clean pairs with any false alarm: {clean_fa}/{len(clean)}",
           f"- pairs fully right (nothing missed, no false alarm, amounts right): {perfect}/{n}"]
    bad = [r for r in rows if r["findings"]["missed"] or r["findings"]["falseAlarms"] or r["findings"]["wrongAmount"]]
    if bad:
        md += ["", "### Pairs with problems", "", "| pair | kind | missed | false alarms | wrong amount |", "|---|---|---|---|---|"]
        for r in bad:
            fd = r["findings"]
            wa = ", ".join(f"{w['kind']} {w['got']} (want {w['want']})" for w in fd["wrongAmount"]) or "-"
            md.append(f"| {r['id']} | {r['kind']} | {', '.join(fd['missed']) or '-'} | {', '.join(fd['falseAlarms']) or '-'} | {wa} |")
    summary = {
        "label": label, "pairs": n, "cleanPairs": len(clean),
        "reading": {
            **{k: sum(r["reading"]["totals"][k] for r in rows) / n for k in TOTALS},
            **{k: sum(r["reading"]["fields"][k] for r in rows) / n for k in FIELDS},
            "linePrecision": mt / pl if pl else None, "lineRecall": mt / tl if tl else None,
            "lineFields": {k: (sum(r["reading"]["lineFields"].get(k, 0) for r in rows) / mt if mt else None)
                           for k in LINE_MONEY + ["remark"]},
        },
        "findings": {k: {"planted": caught[k] + missed[k], "caught": caught[k], "missed": missed[k],
                         "wrongAmount": wrong[k], "falseAlarms": fa[k]} for k in EOB_KINDS},
        "caughtRate": allc / (allc + allm) if allc + allm else None,
        "cleanPairsWithFalseAlarm": clean_fa,
        "pairsFullyRight": perfect,
        "perPair": rows,
    }
    return "\n".join(md) + "\n", summary


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--truth", type=Path, default=HERE / "out")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--pred", type=Path, help="directory with <id>.eob.json files")
    g.add_argument("--oracle", action="store_true", help="use the truth EOBs as predictions")
    a = ap.parse_args()

    truths = sorted(a.truth.glob("pair-*.truth.json"))
    if not truths:
        raise SystemExit(f"no truth files in {a.truth}; run generate.py first")
    rows, skipped, computed = [], [], 0
    for tp in truths:
        t = json.loads(tp.read_text())
        if a.oracle:
            pred = t["eob"]
            found = check_eob(t["bill"], pred)
            computed += 1
        else:
            pp = a.pred / f"{t['id']}.eob.json"
            if not pp.exists():
                skipped.append(t["id"])
                continue
            pred = json.loads(pp.read_text())
            fp = a.pred / f"{t['id']}.findings.json"
            if fp.exists():
                found = json.loads(fp.read_text())
            else:
                found = check_eob(t["bill"], pred)
                computed += 1
        rows.append({"id": t["id"], "kind": t["kind"], "variant": t["variant"]["eob"], "planted": bool(t["expect"]),
                     "reading": score_reading(t["eob"], pred), "findings": score_findings(t, found)})
    if not rows:
        raise SystemExit("no predictions matched any truth file")

    label = "oracle (true EOB, rules only)" if a.oracle else f"predictions in {a.pred}"
    md, summary = summarize(rows, label)
    notes = []
    if computed:
        notes.append(f"- findings for {computed} pairs computed with eobchecks.py (mirror of convex/lib/eobChecks.ts) from the predicted EOB and the true bill")
    if skipped:
        notes.append(f"- {len(skipped)} pairs had no prediction and were skipped")
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
