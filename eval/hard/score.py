"""Score the hard eval: reading, totals, planted errors caught and false alarms, overall and per layout,
per photo condition and per split.

  python -I score.py --set bills --pred hard-preds          # ../out/hard-preds -> score.md, score.json there
  python -I score.py --set eob --pred hard-eob-preds

--pred is a folder under eval/out written by run.ts. A case whose run stopped (RETAKE, NOT_A_BILL, an
error) counts every planted error as missed and every truth line as not read.

Bills
  lines right    a truth line counts when a predicted line has the same code (or revenue code, for a
                 summary line) and the same charge to the cent; "full" also needs the same date and quantity
  totals right   total charges (when printed) and amount due, both to the cent
  caught         a finding of the planted kind on the same lines (predicted lines are mapped to truth lines
                 through the line match, so a skipped line doesn't shift every index after it)
  false alarm    any other finding, except CASH_PRICE_GAP, which is advice
EOB pairs
  read bill + read EOB, then the app's rules: a planted finding is caught when the kind matches (NOT_ON_EOB
  also on the same bill line); "amount right" when its dollar amount matches to the cent. The same rules on
  the true bill with the read EOB are reported too, to show what the EOB read alone gets right.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "out"


def norm(code) -> str | None:
    if not code:
        return None
    c = re.sub(r"[^A-Z0-9]", "", str(code).strip().upper())
    return c if len(c) >= 4 else None


def cents(x) -> int | None:
    return None if x is None else round(float(x) * 100)


def key(l: dict) -> tuple:
    return (norm(l.get("code")) or ("REV" + (norm(l.get("revCode")) or "")), cents(l.get("charge")))


def match(truth: list[dict], pred: list[dict]) -> dict[int, int]:
    """{pred index: truth index}, greedy in order on (code, charge)."""
    free = defaultdict(list)
    for i, l in enumerate(truth):
        free[key(l)].append(i)
    m = {}
    for j, l in enumerate(pred):
        slots = free.get(key(l))
        if slots:
            m[j] = slots.pop(0)
    return m


def load(p: Path):
    return json.loads(p.read_text()) if p.exists() else None


def pct(a, b) -> str:
    return "–" if not b else f"{100 * a / b:.0f}%"


# ---------- bills ------------------------------------------------------------------------------------

def score_bill(t: dict, pred_dir: Path) -> dict:
    bid = t["id"]
    meta = load(pred_dir / f"{bid}.meta.json") or {"outcome": "MISSING"}
    pb = load(pred_dir / f"{bid}.parsed.json")
    finds = load(pred_dir / f"{bid}.findings.json") or []
    tb = t["bill"]
    tl = tb["lines"]
    ok = meta.get("outcome") == "ok" and pb is not None
    pl = pb["lines"] if ok else []
    m = match(tl, pl)
    full = sum(1 for j, i in m.items() if pl[j].get("date") == tl[i].get("date") and float(pl[j].get("quantity") or 1) == float(tl[i].get("quantity") or 1))
    tot_ok = ok and (tb["totalCharges"] is None or cents(pb.get("totalCharges")) == cents(tb["totalCharges"]))
    due_ok = ok and cents(pb.get("amountDue")) == cents(tb["amountDue"])
    preds = [f for f in finds if f["kind"] != "CASH_PRICE_GAP"] if ok else []
    used = [False] * len(preds)
    caught, missed = [], []
    for e in t["errors"]:
        hit = None
        for k, f in enumerate(preds):
            if used[k] or f["kind"] != e["kind"]:
                continue
            if e["lines"]:
                mapped = {m.get(j, -1 - j) for j in f["lines"]}
                if mapped != set(e["lines"]):
                    continue
            hit = k
            break
        if hit is None:
            missed.append(e["kind"])
        else:
            used[hit] = True
            caught.append(e["kind"])
    fa = [preds[k]["kind"] for k in range(len(preds)) if not used[k]]
    checks = len((pb or {}).get("amountChecks") or []) if ok else 0
    return {"id": bid, "split": t["split"], "layout": t["layout"], "kind": t["kind"], "medium": t["medium"], "conditions": t["conditions"],
            "outcome": meta.get("outcome"), "compare": meta.get("compare"), "hospital": meta.get("hospital"),
            "truthLines": len(tl), "predLines": len(pl), "linesRight": len(m), "linesFull": full,
            "totalRight": bool(tot_ok), "dueRight": bool(due_ok), "planted": len(t["errors"]), "caught": caught, "missed": missed,
            "falseAlarms": fa, "amountChecks": checks, "clean": not t["errors"],
            "allRight": ok and len(m) == len(tl) == len(pl) and tot_ok and due_ok and not missed and not fa,
            "unreadableNotes": len((pb or {}).get("unreadable") or []) if ok else 0}


def agg_bills(rows: list[dict]) -> dict:
    tl = sum(r["truthLines"] for r in rows)
    return {
        "bills": len(rows),
        "stopped": sum(r["outcome"] != "ok" for r in rows),
        "lines": f"{sum(r['linesRight'] for r in rows)}/{tl}",
        "linesPct": pct(sum(r["linesRight"] for r in rows), tl),
        "extraLines": sum(max(0, r["predLines"] - r["linesRight"]) for r in rows),
        "linesFull": f"{sum(r['linesFull'] for r in rows)}/{tl}",
        "totals": f"{sum(r['totalRight'] and r['dueRight'] for r in rows)}/{len(rows)}",
        "caught": f"{sum(len(r['caught']) for r in rows)}/{sum(r['planted'] for r in rows)}",
        "falseAlarms": sum(len(r["falseAlarms"]) for r in rows),
        "cleanWithFA": f"{sum(bool(r['falseAlarms']) for r in rows if r['clean'])}/{sum(r['clean'] for r in rows)}",
        "allRight": f"{sum(r['allRight'] for r in rows)}/{len(rows)}",
        "asked": sum(r["amountChecks"] > 0 for r in rows),
    }


BILL_COLS = [("bills", "bills"), ("lines right", "lines"), ("%", "linesPct"), ("extra lines", "extraLines"), ("totals right", "totals"),
             ("errors caught", "caught"), ("false alarms", "falseAlarms"), ("clean bills w/ alarm", "cleanWithFA"),
             ("bills all right", "allRight"), ("stopped", "stopped"), ("asked patient", "asked")]


# ---------- EOB pairs -------------------------------------------------------------------------------

EOB_KINDS = {"EOB_MISMATCH", "CLAIM_PENDING", "SURPRISE_BILL", "OWES_MORE_THAN_EOB", "INSURANCE_NOT_APPLIED", "NOT_ON_EOB", "DENIED_BY_PLAN"}


def match_findings(expect: list[dict], found: list[dict], truth_findings: list[dict], line_map=None) -> tuple:
    preds = [f for f in found if f["kind"] != "CASH_PRICE_GAP"]
    used = [False] * len(preds)
    caught, missed, amount_ok = [], [], 0
    tf = {f["kind"]: f for f in truth_findings}
    for e in expect:
        hit = None
        for k, f in enumerate(preds):
            if used[k] or f["kind"] != e["kind"]:
                continue
            if e["kind"] == "NOT_ON_EOB":
                lines = {line_map.get(j, -1 - j) if line_map is not None else j for j in f["lines"]}
                if lines != set(tf.get("NOT_ON_EOB", {}).get("lines", [])):
                    continue
            hit = k
            break
        if hit is None:
            missed.append(e["kind"])
        else:
            used[hit] = True
            caught.append(e["kind"])
            amount_ok += abs(preds[hit]["amount"] - e["amount"]) < 0.005
    return caught, missed, amount_ok, [preds[k]["kind"] for k in range(len(preds)) if not used[k]]


def score_pair(t: dict, pred_dir: Path) -> dict:
    pid = t["id"]
    meta = load(pred_dir / f"{pid}.meta.json") or {"outcome": "MISSING", "eobOutcome": "MISSING"}
    pe = load(pred_dir / f"{pid}.eob.json")
    pb = load(pred_dir / f"{pid}.parsed.json")
    te = t["eob"]
    eob_ok = meta.get("eobOutcome") == "ok" and pe is not None
    totals = {k: eob_ok and cents(pe.get(k)) == cents(te.get(k)) for k in ["totalBilled", "totalAllowed", "totalPlanPaid", "totalPatientOwes"]}
    fields = {k: eob_ok and pe.get(k) == te.get(k) for k in ["network", "claimStatus", "emergency", "serviceDateFrom", "serviceDateTo"]}
    el = te["lines"]
    pel = (pe or {}).get("lines") or [] if eob_ok else []
    ekey = lambda l: (norm(l.get("code")), cents(l.get("billed")))
    free = defaultdict(list)
    for i, l in enumerate(el):
        free[ekey(l)].append(i)
    em = 0
    for l in pel:
        if free.get(ekey(l)):
            free[ekey(l)].pop(0)
            em += 1
    # Bill reading in the pair.
    bill_ok = meta.get("outcome") == "ok" and pb is not None
    bm = match(t["bill"]["lines"], pb["lines"] if bill_ok else [])
    e2e = load(pred_dir / f"{pid}.findings.json") or []
    tbf = load(pred_dir / f"{pid}.findings-truebill.json") or []
    c1, m1, a1, f1 = match_findings(t["expect"], e2e if bill_ok else [], t["findings"], bm)
    c2, m2, a2, f2 = match_findings(t["expect"], tbf if eob_ok else [], t["findings"])
    return {"id": pid, "split": t["split"], "kind": t["kind"], "eobLayout": t["eobLayout"] + (" +2nd claim" if t.get("secondClaim") else ""),
            "conditions": t["eobConditions"], "eobOutcome": meta.get("eobOutcome"), "billOutcome": meta.get("outcome"),
            "totals": totals, "fields": fields, "eobLines": len(el), "eobLinesRight": em, "eobPredLines": len(pel),
            "billLines": len(t["bill"]["lines"]), "billLinesRight": len(bm),
            "planted": len(t["expect"]), "caught": c1, "missed": m1, "amountRight": a1, "falseAlarms": f1,
            "caughtTrueBill": c2, "amountRightTrueBill": a2, "falseAlarmsTrueBill": f2, "clean": not t["expect"]}


def agg_pairs(rows: list[dict]) -> dict:
    n = len(rows)
    return {
        "pairs": n,
        "eobStopped": sum(r["eobOutcome"] != "ok" for r in rows),
        "owes": f"{sum(r['totals']['totalPatientOwes'] for r in rows)}/{n}",
        "allTotals": f"{sum(all(r['totals'].values()) for r in rows)}/{n}",
        "status": f"{sum(r['fields']['claimStatus'] for r in rows)}/{n}",
        "network": f"{sum(r['fields']['network'] for r in rows)}/{n}",
        "eobLines": f"{sum(r['eobLinesRight'] for r in rows)}/{sum(r['eobLines'] for r in rows)}",
        "billLines": f"{sum(r['billLinesRight'] for r in rows)}/{sum(r['billLines'] for r in rows)}",
        "caught": f"{sum(len(r['caught']) for r in rows)}/{sum(r['planted'] for r in rows)}",
        "amounts": f"{sum(r['amountRight'] for r in rows)}/{sum(r['planted'] for r in rows)}",
        "falseAlarms": sum(len(r["falseAlarms"]) for r in rows),
        "cleanWithFA": f"{sum(bool(r['falseAlarms']) for r in rows if r['clean'])}/{sum(r['clean'] for r in rows)}",
        "caughtTB": f"{sum(len(r['caughtTrueBill']) for r in rows)}/{sum(r['planted'] for r in rows)}",
        "faTB": sum(len(r["falseAlarmsTrueBill"]) for r in rows),
        "allRight": f"{sum(not r['missed'] and not r['falseAlarms'] and r['amountRight'] == r['planted'] for r in rows)}/{n}",
    }


EOB_COLS = [("pairs", "pairs"), ("EOB 'you owe' right", "owes"), ("all 4 EOB totals", "allTotals"), ("claim status", "status"),
            ("network", "network"), ("EOB lines", "eobLines"), ("bill lines", "billLines"), ("planted caught", "caught"),
            ("amount right", "amounts"), ("false alarms", "falseAlarms"), ("clean w/ alarm", "cleanWithFA"),
            ("pairs all right", "allRight"), ("caught, true bill", "caughtTB"), ("FA, true bill", "faTB")]


# ---------- report ----------------------------------------------------------------------------------

def table(groups: list[tuple[str, list[dict]]], agg, cols, label: str) -> str:
    head = f"| {label} | " + " | ".join(c for c, _ in cols) + " |"
    sep = "|---|" + "---|" * len(cols)
    body = []
    for name, rows in groups:
        if not rows:
            continue
        a = agg(rows)
        body.append(f"| {name} | " + " | ".join(str(a[k]) for _, k in cols) + " |")
    return "\n".join([head, sep, *body])


def by(rows: list[dict], field: str, multi: bool = False) -> list[tuple[str, list[dict]]]:
    names = sorted({x for r in rows for x in (r[field] if multi else [r[field]])})
    return [(n, [r for r in rows if (n in r[field] if multi else r[field] == n)]) for n in names]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", choices=["bills", "eob"], default="bills")
    ap.add_argument("--pred", required=True, help="folder under eval/out written by run.ts")
    ap.add_argument("--split", default="all")
    a = ap.parse_args()
    src = OUT / ("hard" if a.set == "bills" else "hard-eob")
    pred = OUT / a.pred
    truths = [json.loads(p.read_text()) for p in sorted(src.glob("*.truth.json"))]
    truths = [t for t in truths if a.split == "all" or t["split"] == a.split]
    if a.set == "bills":
        rows = [score_bill(t, pred) for t in truths]
        agg, cols = agg_bills, BILL_COLS
        sections = [("split", by(rows, "split")), ("layout", by(rows, "layout")), ("condition", by(rows, "conditions", True)),
                    ("medium", by(rows, "medium"))]
    else:
        rows = [score_pair(t, pred) for t in truths]
        agg, cols = agg_pairs, EOB_COLS
        sections = [("split", by(rows, "split")), ("EOB layout", by(rows, "eobLayout")), ("EOB condition", by(rows, "conditions", True)),
                    ("planted kind", by(rows, "kind"))]
    md = [f"# Hard eval: {a.set}, predictions in out/{a.pred}", "", "Synthetic documents only (see eval/hard/README.md).", "",
          table([("all", rows)], agg, cols, "set"), ""]
    for name, groups in sections:
        md += [f"## By {name}", "", table(groups, agg, cols, name), ""]
    md += ["## Per case", ""]
    for r in rows:
        if a.set == "bills":
            md.append(f"- {r['id']} {r['layout']}/{r['kind']} [{'+'.join(r['conditions'])}] {r['outcome']}: lines {r['linesRight']}/{r['truthLines']}"
                      f" (+{max(0, r['predLines'] - r['linesRight'])} extra), totals {'ok' if r['totalRight'] and r['dueRight'] else 'WRONG'},"
                      f" caught {r['caught'] or '-'} missed {r['missed'] or '-'} false alarms {r['falseAlarms'] or '-'}; reads {r['compare']}; hospital {r['hospital']}")
        else:
            bad = [k for k, v in {**r["totals"], **r["fields"]}.items() if not v]
            md.append(f"- {r['id']} {r['kind']} eob {r['eobLayout']} [{'+'.join(r['conditions'])}] eob {r['eobOutcome']} bill {r['billOutcome']}: "
                      f"wrong fields {bad or '-'}, caught {r['caught'] or '-'} (amount right {r['amountRight']}/{r['planted']}) missed {r['missed'] or '-'} "
                      f"false alarms {r['falseAlarms'] or '-'}")
    (pred / "score.md").write_text("\n".join(md) + "\n")
    (pred / "score.json").write_text(json.dumps({"summary": agg(rows), "sections": {n: {g: agg(rs) for g, rs in gs} for n, gs in sections}, "cases": rows}, indent=1))
    print("\n".join(md[:6 + 0]))
    print(table([("all", rows)], agg, cols, "set"))
    for name, groups in sections:
        print(f"\nBy {name}")
        print(table(groups, agg, cols, name))


if __name__ == "__main__":
    main()
