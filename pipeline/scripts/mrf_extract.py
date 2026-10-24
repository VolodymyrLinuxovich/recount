"""Extract a small set of ER-visit codes from a CMS hospital price-transparency
machine-readable file (MRF), template v2/v3, in either "tall" CSV or JSON form.

Streams the file (csv module / ijson), so files of hundreds of MB are fine.

CLI: python -I -m scripts.mrf_extract <mrf_path> <out.json> <hospital_key> <source_url>
"""
import csv
import json
import re
import sys
from collections import OrderedDict

TARGET_PROC = ["99281", "99282", "99283", "99284", "99285", "99291", "96374", "96375",
               "96360", "71046", "70450", "74177", "80053", "85025", "81001", "93005",
               "36415", "12002", "J7030", "J7050", "J1885", "J2405"]
TARGET_RC = {"0450", "0451", "450", "451"}
PROC_TYPES = {"CPT", "HCPCS"}
ORDER = {c: i for i, c in enumerate(TARGET_PROC + ["0450", "0451"])}


def _num(x):
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x)
    try:
        return float(str(x).strip().replace("$", "").replace(",", ""))
    except ValueError:
        return None


def _match(codes):
    """codes: list of (code, TYPE). Returns (kind, code) or None."""
    for c, t in codes:
        if t in PROC_TYPES and c.upper() in TARGET_PROC:
            return "CPT/HCPCS", c.upper()
    if not any(t in PROC_TYPES for _, t in codes):
        for c, t in codes:
            if t == "RC" and c in TARGET_RC:
                return "RC", c.zfill(4)
    return None


def _new_item(kind, code, desc, codes, setting, bclass, mods, gross, cash, mn, mx):
    return {"code": code, "code_kind": kind, "description": desc,
            "all_codes": [{"code": c, "type": t} for c, t in codes],
            "setting": setting, "billing_class": bclass, "modifiers": mods,
            "gross_charge": _num(gross), "discounted_cash_price": _num(cash),
            "file_min_negotiated": _num(mn), "file_max_negotiated": _num(mx),
            "payer_rates": []}


def read_tall_csv(path):
    csv.field_size_limit(10**9)
    groups = OrderedDict()
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        r = csv.reader(f)
        meta = dict(zip(next(r), next(r)))
        header = next(r)
        H = {h.lower().replace(" ", ""): i for i, h in enumerate(header)}
        col = lambda n: H.get(n.lower().replace(" ", ""))
        code_cols, n = [], 1
        while col(f"code|{n}") is not None:
            code_cols.append((col(f"code|{n}"), col(f"code|{n}|type")))
            n += 1
        C = {k: col(v) for k, v in dict(
            desc="description", setting="setting", bclass="billing_class", mods="modifiers",
            gross="standard_charge|gross", cash="standard_charge|discounted_cash",
            payer="payer_name", plan="plan_name", neg="standard_charge|negotiated_dollar",
            pct="standard_charge|negotiated_percentage", alg="standard_charge|negotiated_algorithm",
            meth="standard_charge|methodology", mn="standard_charge|min", mx="standard_charge|max").items()}
        # "wide" CSV layout: one column per payer/plan, e.g.
        # standard_charge|[PAYER]|[PLAN]|negotiated_dollar
        wide = []
        for i, h in enumerate(header):
            m = re.match(r"standard_charge\|\[?(.+?)\]?\|\[?(.+?)\]?\|negotiated_dollar$", h.strip(), re.I)
            if m:
                pfx = h.strip()[: -len("negotiated_dollar")]
                wide.append((m.group(1), m.group(2), i, H.get((pfx + "negotiated_percentage").lower().replace(" ", "")),
                             H.get((pfx + "negotiated_algorithm").lower().replace(" ", "")),
                             H.get((pfx + "methodology").lower().replace(" ", ""))))
        if C["mods"] is None:
            C["mods"] = col("modifier")
        meta["_layout"] = "wide" if wide else "tall"
        rows = 0
        for row in r:
            rows += 1
            g = lambda k: row[C[k]].strip() if C[k] is not None and C[k] < len(row) else ""
            codes = [(row[ci].strip(), (row[ti].strip().upper() if ti is not None and ti < len(row) else ""))
                     for ci, ti in code_cols if ci < len(row) and row[ci].strip()]
            hit = _match(codes)
            if not hit:
                continue
            key = (hit[1], g("desc"), g("setting"), g("bclass"), g("mods"), tuple(codes))
            e = groups.get(key)
            if e is None:
                e = groups[key] = _new_item(*hit, g("desc"), codes, g("setting"), g("bclass"), g("mods"),
                                            g("gross"), g("cash"), g("mn"), g("mx"))
            if g("payer"):
                e["payer_rates"].append({"payer": g("payer"), "plan": g("plan"),
                                         "negotiated_dollar": _num(g("neg")),
                                         "negotiated_percentage": _num(g("pct")),
                                         "negotiated_algorithm": g("alg") or None,
                                         "methodology": g("meth") or None})
            for payer, plan, di, pi, ai, mi in wide:
                gv = lambda i: row[i].strip() if i is not None and i < len(row) else ""
                if gv(di) or gv(pi) or gv(ai):
                    e["payer_rates"].append({"payer": payer, "plan": plan,
                                             "negotiated_dollar": _num(gv(di)),
                                             "negotiated_percentage": _num(gv(pi)),
                                             "negotiated_algorithm": gv(ai) or None,
                                             "methodology": gv(mi) or None})
    return meta, rows, list(groups.values())


def read_json(path):
    import ijson
    meta = {}
    with open(path, "rb") as f:
        if f.read(3) != b"\xef\xbb\xbf":
            f.seek(0)
        for k, ev, v in ijson.parse(f):
            if k in ("hospital_name", "last_updated_on", "version") and ev in ("string", "number"):
                meta[k] = v
            if k.startswith("standard_charge_information"):
                break
    items, rows = [], 0
    with open(path, "rb") as f:
        if f.read(3) != b"\xef\xbb\xbf":
            f.seek(0)
        for sci in ijson.items(f, "standard_charge_information.item", use_float=True):
            rows += 1
            codes = [(str(c.get("code", "")).strip(), str(c.get("type", "")).upper())
                     for c in sci.get("code_information", [])]
            hit = _match(codes)
            if not hit:
                continue
            for sc in sci.get("standard_charges", []):
                mods = sc.get("modifiers") or sc.get("modifier_code") or ""
                if isinstance(mods, list):
                    mods = "|".join(map(str, mods))
                e = _new_item(*hit, sci.get("description", ""), codes, sc.get("setting", ""),
                              sc.get("billing_class", ""), mods, sc.get("gross_charge"),
                              sc.get("discounted_cash"), sc.get("minimum"), sc.get("maximum"))
                for p in sc.get("payers_information", []) or []:
                    e["payer_rates"].append({"payer": p.get("payer_name"), "plan": p.get("plan_name"),
                                             "negotiated_dollar": _num(p.get("standard_charge_dollar")),
                                             "negotiated_percentage": _num(p.get("standard_charge_percentage")),
                                             "negotiated_algorithm": p.get("standard_charge_algorithm"),
                                             "methodology": p.get("methodology")})
                items.append(e)
    return meta, rows, items


def _iso(d):
    """'3/19/2026' or '2026-03-19' -> '2026-03-19'."""
    import re as _re
    if not d:
        return None
    m = _re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})$", d.strip())
    return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}" if m else d.strip()


def summarize(items):
    """Per code: ranges across all matching rows, plus outpatient-facility rows only
    (the usual ER facility bill)."""
    out = OrderedDict()
    for code in sorted({e["code"] for e in items}, key=lambda c: ORDER.get(c, 999)):
        def rng(rows):
            vals = lambda f: [r[f] for r in rows if r[f] is not None]
            neg = [p["negotiated_dollar"] for r in rows for p in r["payer_rates"] if p["negotiated_dollar"] is not None]
            mm = lambda xs: [min(xs), max(xs)] if xs else None
            return {"n_rows": len(rows),
                    "gross_charge_range": mm(vals("gross_charge")),
                    "discounted_cash_range": mm(vals("discounted_cash_price")),
                    "negotiated_dollar_min": min(neg) if neg else None,
                    "negotiated_dollar_max": max(neg) if neg else None,
                    "file_min_negotiated_range": mm(vals("file_min_negotiated")),
                    "file_max_negotiated_range": mm(vals("file_max_negotiated")),
                    "descriptions": sorted({r["description"] for r in rows})[:8]}
        rows = [e for e in items if e["code"] == code]
        opf = [e for e in rows if e["setting"].lower() in ("outpatient", "both")
               and e["billing_class"].lower() in ("facility", "")]
        out[code] = {"all_settings": rng(rows), "outpatient_facility": rng(opf) if opf else None}
    return out


def extract(path, out, key, src):
    is_json = open(path, "rb").read(4096).lstrip(b"\xef\xbb\xbf").lstrip()[:1] == b"{"
    meta, rows, items = (read_json if is_json else read_tall_csv)(path)
    for e in items:
        d = [p["negotiated_dollar"] for p in e["payer_rates"] if p["negotiated_dollar"] is not None]
        e["computed_min_negotiated_dollar"] = min(d) if d else None
        e["computed_max_negotiated_dollar"] = max(d) if d else None
        e["n_payer_rows"] = len(e["payer_rates"])
    items.sort(key=lambda e: (ORDER.get(e["code"], 999), e["setting"], e["description"]))
    found = sorted({e["code"] for e in items}, key=lambda c: ORDER.get(c, 999))
    res = {
        "hospital_key": key,
        "source_url": src,
        "mrf_format": "CMS template v%s %s" % (meta.get("version"), "JSON" if is_json else "CSV (%s)" % meta.get("_layout")),
        "mrf_hospital_name": meta.get("hospital_name"),
        "mrf_last_updated_on": meta.get("last_updated_on"),
        "mrf_last_updated_iso": _iso(meta.get("last_updated_on")),
        "records_scanned": rows,
        "codes_found": found,
        "codes_not_found": [c for c in TARGET_PROC + ["0450", "0451"] if c not in found],
        "notes": [
            "All dollar values copied from the hospital's own CMS machine-readable file as published.",
            "file_min/max_negotiated = the file's own de-identified min/max columns; computed_* and negotiated_dollar_min/max = min/max over payer negotiated_dollar values present.",
            "outpatient_facility summary = rows with setting outpatient/both and facility billing class (typical ER facility charge).",
            "Revenue-code entries (0450/0451) are rows whose only codes are revenue codes (no CPT/HCPCS).",
        ],
        "summary_by_code": summarize(items),
        "items": items,
    }
    with open(out, "w") as f:
        json.dump(res, f, indent=1)
    return res


if __name__ == "__main__":
    r = extract(*sys.argv[1:5])
    print(f"records={r['records_scanned']} found={r['codes_found']} missing={r['codes_not_found']}")
