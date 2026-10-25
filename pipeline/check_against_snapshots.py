"""The statewide path vs the hand-checked prices: run the Actor's scanner and build_statewide_prices.pick_row
on the exact files behind the four hand-checked snapshots (convex/lib/snapshots/), and compare every code.

A batch price above the hand-checked one is safe (fewer flags). A lower one could flag a fair charge, so
the test suite fails on any lower price that isn't explained by the hospital changing its file.

Usage: python -I pipeline/check_against_snapshots.py   (needs the Actor's requirements: httpx, ijson)
Output: pipeline/out/snapshot_check.json
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "actor"))
from build_statewide_prices import pick_row  # noqa: E402
from src.http import make_client  # noqa: E402
from src.mrf import scan_url  # noqa: E402

SNAPS = ROOT / "convex/lib/snapshots"
OUT = ROOT / "pipeline/out/snapshot_check.json"


def main() -> None:
    client = make_client()
    out, tot = {}, {"compared": 0, "same": 0, "higher": 0, "lower": 0}
    for f in sorted(SNAPS.glob("*.json")):
        snap = json.loads(f.read_text())
        want = snap["mrf"]["prices"]
        mrf = scan_url(client, snap["mrf"]["url"], list(want), 3000)
        codes = {}
        for code, row in want.items():
            if row.get("grossCharge") is None or not mrf["prices"].get(code):
                continue
            got = pick_row(mrf["prices"][code])
            if not got:
                continue
            a, b = got["grossCharge"], row["grossCharge"]
            verdict = "same" if abs(a - b) < 0.005 else ("higher" if a > b else "lower")
            codes[code] = {"snapshot": b, "batch": a, "verdict": verdict, "snapshotRow": row.get("description"), "batchRow": got["description"]}
            tot["compared"] += 1
            tot[verdict] += 1
        out[f.stem] = {"url": snap["mrf"]["url"], "snapshotFileUpdated": snap["mrf"].get("lastUpdated"),
                       "fileUpdatedNow": mrf.get("lastUpdated"), "codes": codes}
        print(f.stem, {v: sum(1 for c in codes.values() if c["verdict"] == v) for v in ("same", "higher", "lower")},
              "file updated", snap["mrf"].get("lastUpdated"), "->", mrf.get("lastUpdated"), flush=True)
    OUT.write_text(json.dumps({"checkedAt": datetime.now(timezone.utc).isoformat()[:19] + "Z", **tot, "snapshots": out},
                              indent=1, ensure_ascii=False) + "\n")
    print(tot)


if __name__ == "__main__":
    main()
