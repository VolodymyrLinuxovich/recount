"""Merge reviewed packets into the audit results the app shows.

Reads audit/review/packets.jsonl and every audit/review/decisions/*.jsonl, keeps only
decisions whose quote is really in the policy text (the milder verdict wins when reviewers
disagree; decisions in override_*.jsonl, from manual spot-checks, win outright), and writes:
  public/audit/findings.json   per-hospital findings for the /audit page
  audit/results/summary.md     counts by rule and verdict, plus the conflict list

Usage: python3 -I audit/report.py
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from review import DECISIONS, load_packets, valid  # noqa: E402
from rules import RULES  # noqa: E402

ROOT = HERE.parent
RANK = {"conflict": 3, "likely": 2, "ask": 1, "complies": 0}


def load_decisions(packets: dict[str, dict]) -> dict[str, dict]:
    best: dict[str, dict] = {}
    override: dict[str, dict] = {}
    for f in sorted(DECISIONS.glob("*.jsonl")):
        for line in f.read_text().splitlines():
            if not line.strip():
                continue
            d = json.loads(line)
            p = packets.get(d.get("id"))
            if not p or not valid(d, p):
                continue
            # override_*.jsonl holds corrections made after a manual spot-check of the policy;
            # they replace the review agents' verdicts for that sentence.
            if f.name.startswith("override_"):
                override[d["id"]] = d
                continue
            # If two reviewers disagree, keep the milder verdict: we'd rather miss than accuse.
            old = best.get(d["id"])
            if old is None or RANK[d["verdict"]] < RANK[old["verdict"]]:
                best[d["id"]] = d
    best.update(override)
    return best


def main() -> None:
    from review import CORPUS
    corpus = json.loads((CORPUS / "hospitals.json").read_text())
    packets = {p["id"]: p for p in load_packets()}
    decisions = load_decisions(packets)

    by_hospital: dict[str, list[dict]] = defaultdict(list)
    for pid, d in decisions.items():
        if d["verdict"] == "complies":
            continue
        p = packets[pid]
        for ref in p["refs"]:
            by_hospital[ref["hospital"]].append({
                "rule": p["rule"],
                "verdict": d["verdict"],
                "quote": d["quote"],
                "sentence": p["sentence"],
                "context": p["context"],
                "page": ref["page"],
                "docType": ref["docType"],
                "docUrl": ref["docUrl"],
                "effectiveDate": ref["effectiveDate"],
                "explanation": d.get("explanation", ""),
                "reviewer": d.get("reviewer"),
            })

    hospitals = []
    checked = 0
    for h in corpus:
        docs = {k: {"url": v.get("url"), "effectiveDate": v.get("effective_date")} for k, v in (h.get("docs") or {}).items() if v}
        has_text = any(v and v.get("text_path") and not v.get("needs_ocr") for v in (h.get("docs") or {}).values())
        checked += has_text
        findings = sorted(by_hospital.get(h["key"], []), key=lambda f: -RANK[f["verdict"]])
        # One finding per rule per hospital is enough to show; keep the strongest.
        seen, uniq = set(), []
        for f in findings:
            if f["rule"] in seen:
                continue
            seen.add(f["rule"])
            uniq.append(f)
        hospitals.append({
            "key": h["key"], "name": h.get("name"), "city": h.get("city"), "county": h.get("county"),
            "lat": h.get("lat"), "lon": h.get("lon"), "detailUrl": h.get("detail_url"),
            "checked": bool(has_text), "docs": docs, "findings": uniq,
        })

    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "hospitalsTotal": len(corpus),
        "hospitalsChecked": checked,
        "packetsReviewed": len(decisions),
        "packetsTotal": len(packets),
        "rules": [{"id": r.id, "title": r.title, "cite": r.cite, "url": r.url, "lawQuote": r.law_quote} for r in RULES],
        "hospitals": hospitals,
    }
    dest = ROOT / "public" / "audit" / "findings.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=1))

    # Compact copy for the backend, so a patient's case can cite its hospital's policy problems.
    compact = {h["key"]: [{k: f[k] for k in ("rule", "verdict", "quote", "page", "docType", "docUrl", "effectiveDate", "explanation")}
                          for f in h["findings"]] for h in hospitals if h["findings"]}
    (ROOT / "convex" / "lib" / "auditFindings.json").write_text(json.dumps({"generatedAt": out["generatedAt"], "hospitals": compact}, indent=1))

    worst = Counter()
    per_rule = Counter()
    for h in hospitals:
        if h["findings"]:
            worst[max(h["findings"], key=lambda f: RANK[f["verdict"]])["verdict"]] += 1
        for f in h["findings"]:
            per_rule[(f["rule"], f["verdict"])] += 1
    lines = [
        "# Audit summary", "",
        f"Generated {out['generatedAt']}. {checked} of {len(corpus)} hospitals had readable policy text.",
        f"Reviewed {len(decisions)} of {len(packets)} unique candidate sentences.", "",
        "| Worst verdict | Hospitals |", "|---|---|",
        *[f"| {v} | {worst[v]} |" for v in ("conflict", "likely", "ask")], "",
        "| Rule | Verdict | Hospitals |", "|---|---|---|",
        *[f"| {r} | {v} | {n} |" for (r, v), n in sorted(per_rule.items())], "",
        "## Conflicts", "",
    ]
    for h in hospitals:
        for f in h["findings"]:
            if f["verdict"] == "conflict":
                lines.append(f"- **{h['name']}** ({f['rule']}, {f['docType']} eff. {f['effectiveDate']}, p.{f['page']}): \"{f['quote']}\"")
    (HERE / "results").mkdir(exist_ok=True)
    (HERE / "results" / "summary.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines[:14]))


if __name__ == "__main__":
    main()
