# Recount reference data (built 2026-10-24)

Rebuild everything: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python -I scripts/build_all.py`
(about 25 s with raw files cached; first run downloads about 520 MB of MRFs). Options: `--only zsfg ucsf`, `--skip-mrf`, `--skip-hcai`.

## Files

| file | what | how built | verified |
|---|---|---|---|
| `fpl.json` | 2026 HHS poverty guidelines, 48 states + DC, sizes 1-8 + $5,680 per extra person | parsed from the Federal Register PDF (`scripts/fpl.py`) | yes: PDF parsed, matches ASPE page |
| `ca_law.json` | HSC 127400-127446 rules: definitions, 400% FPL eligibility, no asset test, no deadlines, Medicare/Medi-Cal payment cap, payment plans, collections, credit reporting, ER physician rules, bill changelog (AB 774, AB 1020, AB 2297/SB 1061, AB 1312) | hand-curated (`scripts/curated/ca_law.json`) | see caveat 1 |
| `hospitals.json` | 6 SF hospitals: FAP URL, free-care and discount thresholds as written, MRF URL, format, size, last-updated, billing phones | hand-curated from the FAP PDFs + MRF headers (`scripts/curated/hospitals.json`) | every FAP and MRF opened; a few hospital web pages only cited (marked) |
| `hcai_policies.json` | HCAI policy lookup scrape: all filed charity/discount/debt-collection policy PDFs (with effective dates) for the SF hospitals, plus the 17 SF search results; per hospital also `name` (display name), `hcai_name`, `hcai_id`, `city`, `county`, `lat`, `lon` (Census geocode of the HCAI address; Mission Bay uses an OpenStreetMap fallback) | `scripts/hcai.py` | yes |
| `prices_<key>.json` | ER-code extract from each hospital's CMS MRF: gross, discounted cash, file min/max, every payer rate, plus `summary_by_code` | `scripts/mrf_extract.py` (streams CSV tall/wide and JSON v3) | yes, straight from the files |
| `price_audit.json` | Per price file: cash price = gross share, median cash discount, lowest insurer rate vs cash, min/max consistency, update date, attestation, NPI check digits | `price-audit/` (Rust); findings in `docs/PRICE-FILES.md` | every number recomputed by `price-audit/xcheck.py` (Python), all match |
| `hcai_licenses.json` | CA license number, HCAI ID, aliases and address of all 470 hospitals | `find_price_files.py licenses` (HCAI policy lookup pages) | yes |
| `cms_hpt.json` | Every `/cms-hpt.txt` price file index found at hospital and health system domains | `find_price_files.py txt` | as published |
| `price_file_headers.json` | What each candidate price file says about itself: hospital name, license, locations, addresses | `find_price_files.py probe` (first 3 MB of each file) | as published |
| `price_files.json` | The one file verified as each hospital's own, with the evidence, and why every other candidate was rejected | `find_price_files.py select` | rule in the file |
| `snapshot_check.json`, `price_spot_checks.json` | Statewide price path vs the hand-checked SF files; a second parser vs the statewide prices | `check_against_snapshots.py`, `spot_check_prices.py` | checked by `tests/statewidePrices.test.ts` |

Price files: `zsfg`, `ucsf` (Parnassus/Mission Bay/Mt Zion, one file), `cpmc_vanness`, `stfrancis_hyde`, `stmarys`, `kaiser_sf`.

Each price file has `source_url`, `mrf_last_updated_on` (as written) and `mrf_last_updated_iso`, `codes_found`, `codes_not_found`, `summary_by_code[code].outpatient_facility` (use this one for ER facility bills) and `items[]` (the raw rows, with `payer_rates[]`).

| hospital | MRF updated | format | size |
|---|---|---|---|
| ZSFG | 2026-03-19 | v3.0.0 CSV tall | 3.9 MB |
| UCSF Medical Center | 2026-04-01 | v3.0.0 JSON | 91 MB |
| CPMC Van Ness (Sutter) | 2026-04-01 | v3.0.0 CSV tall | 16.9 MB |
| Saint Francis / UCSF Hyde | 2026-02-28 | v3.0.0 JSON | 100 MB |
| St. Mary's / UCSF Stanyan | 2026-02-28 | v3.0.0 JSON | 91 MB |
| Kaiser SF | 2026-04-01 | v3.0.1 CSV wide | 216 MB |

None of the five hospital domains serve `/cms-hhs-pricetransparency.txt` (all returned 404). That is the proposed-rule name; the required index is `/cms-hpt.txt`, which `find_price_files.py` reads for the statewide prices (see `docs/PRICE-FILES.md`). Each MRF was found from the hospital's price-transparency page instead (see `found_via` in hospitals.json).

## Free care and discount thresholds as written in each FAP

| hospital | free care | discount | notes |
|---|---|---|---|
| ZSFG | <= 138% FPL | >= 139% FPL, no upper limit, size of discount set by FPL (schedule not published) | <= 400% FPL capped at Medicare. ER doctors bill separately (SFGH Medical Group: greater of Medicare or Medi-Cal) |
| UCSF (also filed for Hyde and St. Mary's) | self-pay <= 400% FPL: 100% write-off | no partial tier | insured patients: 100% write-off of patient share if <= 400% FPL or out-of-pocket > 10% of income |
| CPMC Van Ness (Sutter) | uninsured <= 400% FPL: full write-off | no partial tier in the policy text | insured: <= 400% FPL and out-of-pocket > 10% of income. Worksheet mentions a "catastrophic" write-off above 30% of income, not defined in the policy |
| Kaiser SF | 0-200% FPL: 100% | 201-400% FPL: 50% | any income: 12-month medical bills >= 10% of income means full assistance |

## Caveats and gaps

1. **Statute text source.** leginfo.legislature.ca.gov blocks automated fetches (Cloudflare 403). Statute quotes in `ca_law.json` come from FindLaw's mirror ("Current as of January 01, 2026") and HCAI's own PIL 24-03 and Laws & Regulations pages. Re-check exact wording on leginfo before printing it on a legal form.
2. **Payment cap needs Medicare rates.** HSC 127405(d)(1) caps discount-eligible patients (<= 400% FPL) at "Medicare or Medi-Cal, whichever is greater". MRFs do not publish Medicare fee-for-service rates. To compute the cap you still need the CMS OPPS Addendum B (facility APC rates, wage-adjusted for SF) and the physician fee schedule. **Not collected here.** The MRF "negotiated" values are commercial/managed-care contract rates, not that cap.
3. **ZSFG MRF quirks.** Discounted cash price = gross charge on every row. Only 7 payers (Medi-Cal managed care plans, SF Health Plan, Partnership, Canopy). ED E/M outpatient rows show one flat negotiated $49.60 at every level (99281-99285, 99291); inpatient rows differ. The file's `standard_charge|max` column equals gross. **ZSFG's MRF has no rows for 36415, J7030, J7050, J1885 or J2405** (no drug or venipuncture lines at all), and no revenue-code-only 0450 rows.
4. **Hyde and St. Mary's negotiated maxima** for ED codes are very large (for example $23,890-24,548 on 99283), which look like case or bundled rates attached to the line. Use min or median for comparisons, not max.
5. **CPMC (Sutter)** has no payer-specific dollar rates on the ED E/M rows. Discounted cash = gross. No 12002 row.
6. **0451** is not present as a standalone revenue-code row in any file. `0450` entries are rows whose only codes are revenue codes (for example Kaiser's "FACILITY USE-EMERGENCY ROOM, LEVEL 1").
7. Multiple rows per code are normal (inpatient vs outpatient, modifiers like 25, CDM variants such as "Psych Crisis" or "Trauma"). Match on the bill's description when you can.
8. **Ownership changes.** Saint Francis Memorial and St. Mary's are now UCSF Health hospitals (HCAI lists "UCSF Health Hyde Hospital" and "UCSF Health - St. Mary's Hospital"), not CommonSpirit/Dignity. HCAI has the same UCSF policy PDF on file for UCSF Parnassus, Mission Bay, Hyde and St. Mary's (byte-identical). The policy text still says "UCSF Medical Center" throughout.
9. **Policy vs law conflicts to flag for users.** UCSF's policy asks for "best efforts" to apply within 240 days; HSC 127405(e)(3) bans application time limits. ZSFG says patients without a verifiable income source "will be determined ineligible"; the law limits required documentation to pay stubs or tax returns and allows presumptive eligibility.
10. Kaiser's FAP PDF is the national policy NATL.CB.307 with the Northern California addendum (which lists KFH San Francisco). Its thresholds come from that addendum.
11. ER **physician** bills are separate from the hospital bill and follow HSC 127450+ (400% FPL, but the cap is tied to commercial median rates, not Medicare).
12. FPL: 2026 guidelines were published 2026-01-15, so no 2025 fallback is needed.

## HCAI Hospital Fair Billing Program policy database (for an Apify Actor)

Yes. HCAI publishes a public, searchable **Hospital Fair Pricing Policy Lookup**:
<https://hcai.ca.gov/affordability/hospital-fair-billing-program/hospital-fair-pricing-policy-lookup/>

- **No login.** It is plain server-rendered WordPress HTML. When fetched on 2026-10-24 it showed "Displaying 1-16 of 470 results" and "Last import: 10/22/26".
- Search and pagination are GET params: `?hcai_search=san+francisco&hcai_page=2`, plus `hcai_order_by=title&hcai_order=asc|desc`. 16 results per page, about 30 pages total.
- Each hospital has a detail page `https://hcai.ca.gov/affordability/hospital-billing-policies/<slug>/` with address, aliases, license #, HCAI ID, and the current and archived Charity Care Policy, Discount Payment Policy, Debt Collection Policy and Application, each with an effective date.
- Documents are public GETs: `https://api.hdc.hcai.ca.gov/Public/Extract/Attachment?id=<uuid>` returns `application/pdf`.
- `scripts/hcai.py` already implements search, detail parse and PDF download. It worked with plain urllib, with no JavaScript or cookies needed.
- The old SyFPHR site (`https://syfphr.hcai.ca.gov/FacilityList.aspx`) says it no longer accepts submissions and points to this lookup.
- HCAI patient complaint program: <https://hcai.ca.gov/affordability/hospital-fair-billing-program/hospital-bill-complaint-program/>

## Scripts (copy to `pipeline/`)

`scripts/build_all.py` (entry point), `audit_meta.py` (run after `audit/report.py` on an SF-only corpus: fills name/city/county/lat/lon into `public/audit/findings.json` by key), `common.py` (paths, fetch with certifi SSL, PDF text), `fpl.py`, `hcai.py`, `mrf_extract.py` (also a CLI: `python -I scripts/mrf_extract.py <mrf> <out.json> <key> <url>`), and `curated/{ca_law,hospitals}.json`. Paths are relative to the project root. Raw downloads go to `raw/` and are parsed only, never executed. MRFs over 300 MB are deleted after extraction (none currently are; Kaiser's is 216 MB).
