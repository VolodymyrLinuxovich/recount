"""Fill name, city, county and lat/lon into the audit findings for the SF hospitals.

audit/report.py copies these fields from its corpus. An SF-only corpus keyed by the
short keys (zsfg, ucsf_missionbay, ...) has none of them, so the page showed the key
as the name and no map pin. This step fills them from out/hcai_policies.json
(HCAI detail page + Census geocode of the HCAI address). Keys are left unchanged.

Run after audit/report.py:
    python3 -I pipeline/scripts/audit_meta.py [findings.json ...]
Default target: public/audit/findings.json. Hospitals not in hcai_policies.json are left alone.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "out")
APP_ROOT = os.path.dirname(os.path.dirname(HERE))
DEFAULT = os.path.join(APP_ROOT, "public", "audit", "findings.json")
FIELDS = ("name", "city", "county", "lat", "lon")


def load_meta():
    with open(os.path.join(OUT, "hcai_policies.json")) as f:
        hospitals = json.load(f)["hospitals"]
    meta = {}
    for key, h in hospitals.items():
        missing = [k for k in FIELDS if h.get(k) is None]
        if missing:
            raise SystemExit(f"{key}: hcai_policies.json has no {missing}; rerun scripts/hcai.py")
        meta[key] = {k: h[k] for k in FIELDS}
    return meta


def fill(path, meta):
    with open(path) as f:
        data = json.load(f)
    n = 0
    for h in data["hospitals"]:
        m = meta.get(h.get("key"))
        if m:
            h.update(m)
            n += 1
    if n:
        with open(path, "w") as f:
            json.dump(data, f, indent=1)  # same format as audit/report.py
    return n


def main():
    meta = load_meta()
    for path in sys.argv[1:] or [DEFAULT]:
        print(f"{path}: filled {fill(path, meta)} hospitals")


if __name__ == "__main__":
    main()
