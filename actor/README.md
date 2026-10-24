# Hospital Price & Charity Care Finder

Give this Actor a hospital's website and the billing codes from a bill. It returns:

- **What the hospital itself says those services cost.** It reads the hospital's federally required price transparency file and returns the gross charge, the discounted cash price, and the minimum and maximum negotiated rates for each code.
- **Who qualifies for free or discounted care.** It finds the hospital's financial assistance (charity care) policy and pulls out the income limits as a percent of the Federal Poverty Level (FPL). Each number comes with the exact sentence it was read from.
- **Where to apply.** It returns the financial assistance phone number and a link to the application form.

It was built for **Recount** at Cal Hacks 13.0. Recount is an app for uninsured and underinsured patients in California: you photograph a hospital bill, and the app checks each line against the hospital's own published prices and checks whether you qualify for charity care. The app runs this Actor live for each bill.

## Why this is hard to do by hand

- Since 2021, US hospitals have had to publish a machine-readable file (MRF) with all their standard charges (45 CFR 180.50). These files often run to **hundreds of megabytes**. They come as JSON or as one of two different CSV layouts, and they are usually hidden behind Box links, CDNs or vendor pages.
- CMS also requires a `cms-hhs-pricetransparency.txt` file at the root of the hospital's domain that points to the MRF. Many hospitals don't have one: none of the 15 California hospital sites we checked had one.
- Charity care policies are long PDFs. They mix the hospital's current limits with history ("in 2019 the limit was increased to 500%") and restatements of the law ("emergency physicians are required by law to give discounts up to 400%"). A plain regex for "% FPL" picks up the wrong number.

## How it works

1. **Find the price file.**
   - It reads `/cms-hhs-pricetransparency.txt` on the root domain (with and without `www`).
   - It also runs a small best-first crawl of the hospital site. The crawl only follows links about prices, billing and financial assistance, plus one hop onto a price transparency vendor's domain.
   - It scores candidate links: "machine readable", "standard charges", `.json` or `.csv` links, Box or CDN downloads, and a name match against the hospital. When a health system publishes one file per hospital, the best-scoring file is used and the others are listed in `warnings`.
2. **Stream the price file.** Nothing is loaded fully into memory.
   - JSON (CMS v2/v3 schema) is parsed incrementally with `ijson` (C backend).
   - CSV ("tall" and "wide" CMS templates) is read row by row.
   - It handles a UTF-8 BOM and gzip compression, and it skips chargemaster (CDM) and revenue codes that happen to equal the requested code.
   - It stops early once every code has a gross charge and negotiated rates. It never reads past `maxMrfMB`.
   - Example: UCSF's 91 MB JSON file streams in about 11 seconds.
3. **Find the financial assistance policy.**
   - For California hospitals, it looks the hospital up in the state's **HCAI Hospital Fair Pricing Policy Lookup**, where every hospital must file its current charity care and discount payment policies and applications.
   - It also collects policy documents found while crawling the hospital's site.
   - It downloads the PDFs and HTML pages and extracts their text with `pypdf`/BeautifulSoup. It only extracts text from these documents and never runs or renders anything in them.
4. **Extract the FPL limits with evidence.**
   - It splits the policy into sentences and keeps only the percentages that are tied to the FPL.
   - It tells upper limits ("may not exceed 138%") apart from lower limits ("at or above 139%"). It also handles ranges ("201% to 400%") and table rows.
   - It works out whether each sentence is about free care or discounted care, using the sentence itself or the nearest section heading before it.
   - It ignores history and legal boilerplate.
   - It detects "no FPL limit" discount programs.
   - Every value is returned with the exact sentence and the URL of its source.
5. **Push one dataset item.** If a value can't be found, the Actor returns `null` with a warning. It never guesses.

## Input

| Field | Type | Description |
|---|---|---|
| `hospitalUrl` | string, required | The hospital's homepage or any page on its site, e.g. `https://zuckerbergsanfranciscogeneral.org` |
| `hospitalName` | string | Optional. Helps when a health system publishes several hospitals (e.g. `"California Pacific Medical Center Van Ness Campus"`). |
| `codes` | string[] | CPT / HCPCS codes to price (MS-DRG and NDC codes also work), e.g. `["99284","80053","85025"]` |
| `maxMrfMB` | integer | Stop streaming the price file after this many MB (default 300). |
| `maxCrawlPages` | integer | Page budget for the site crawl (default 30). |
| `useHcaiRegistry` | boolean | Look the hospital up in California's HCAI policy registry (default `true`). |

```json
{
  "hospitalUrl": "https://zuckerbergsanfranciscogeneral.org",
  "codes": ["99284", "80053"]
}
```

## Output

This is a real run against Zuckerberg San Francisco General (Oct 24, 2026), trimmed to two codes. The per-code `lines` array is also left out:

```json
{
  "hospitalName": "PRISCILLA CHAN & MARK ZUCKERBERG SAN FRANCISCO GENERAL HOSPITAL & TRAUMA CENTER",
  "hospitalUrl": "https://zuckerbergsanfranciscogeneral.org",
  "sourceUrls": [
    "https://www.zuckerbergsanfranciscogeneral.org/services/billing-assistance/",
    "https://sanfranciscogeneralhospitalfou.box.com/shared/static/bj0pj6iqcpc6bmb4yp7kobuz772j0jtl.csv",
    "https://hcai.ca.gov/affordability/hospital-billing-policies/priscilla-chan-mark-zuckerberg-san-francisco-general-hospital-trauma-center/",
    "https://api.hdc.hcai.ca.gov/Public/Extract/Attachment?id=41121f62-1c1d-4c2f-a324-a8cbfe537143"
  ],
  "mrf": {
    "url": "https://sanfranciscogeneralhospitalfou.box.com/shared/static/bj0pj6iqcpc6bmb4yp7kobuz772j0jtl.csv",
    "foundOn": "https://www.zuckerbergsanfranciscogeneral.org/services/billing-assistance/",
    "lastUpdated": "3/19/2026",
    "format": "csv-tall",
    "schemaVersion": "3.0.0",
    "hospitalNameInFile": "PRISCILLA CHAN & MARK ZUCKERBERG SAN FRANCISCO GENERAL HOSPITAL & TRAUMA CENTER",
    "prices": {
      "80053": {
        "code": "80053", "codeType": "CPT",
        "description": "HC Comprehensive Metabolic Panel",
        "setting": "outpatient",
        "grossCharge": 528.0, "discountedCash": 528.0,
        "min": 13.18, "max": 528.0,
        "payerRateLow": 10.56, "payerRateHigh": 13.98, "payerRateCount": 6,
        "minMaxSetting": "outpatient", "totalLines": 2
      },
      "99284": {
        "code": "99284", "codeType": "CPT",
        "description": "HC ER Ex/Tx Rm Level IV",
        "setting": "outpatient",
        "grossCharge": 6084.0, "discountedCash": 6084.0,
        "min": 49.6, "max": 6084.0,
        "payerRateLow": 49.6, "payerRateHigh": 49.6, "payerRateCount": 2,
        "minMaxSetting": "outpatient", "totalLines": 6
      }
    },
    "scan": { "bytesRead": 3934073, "recordsScanned": 14320, "complete": true,
              "stoppedBecause": "end-of-file", "seconds": 0.8, "httpStatus": 200 }
  },
  "fap": {
    "url": "https://api.hdc.hcai.ca.gov/Public/Extract/Attachment?id=41121f62-1c1d-4c2f-a324-a8cbfe537143",
    "freeCareMaxFplPct": 138.0,
    "discountMaxFplPct": null,
    "discountHasNoFplCap": true,
    "quotes": [
      { "kind": "freeCare", "fplPct": 138.0,
        "text": "A patient’s household income may not exceed 138% of the Federal poverty level.",
        "sourceUrl": "https://api.hdc.hcai.ca.gov/Public/Extract/Attachment?id=41121f62-1c1d-4c2f-a324-a8cbfe537143" },
      { "kind": "discountNoCap", "fplPct": null,
        "text": "There is no FPL limit for a patient to qualify.",
        "sourceUrl": "https://api.hdc.hcai.ca.gov/Public/Extract/Attachment?id=41121f62-1c1d-4c2f-a324-a8cbfe537143" },
      { "kind": "discountOther", "fplPct": 400.0,
        "text": "The clinical practice group shall limit expected payment for services it provides to a patient at or below 400% of the FPL, eligible under its discount payment policy, to the amount of payment the group would expect to receive from Medicare or Medi-Cal, whichever is greater.",
        "sourceUrl": "https://api.hdc.hcai.ca.gov/Public/Extract/Attachment?id=41121f62-1c1d-4c2f-a324-a8cbfe537143" }
    ],
    "phone": "(628) 206-3275",
    "phoneSourceUrl": "https://www.zuckerbergsanfranciscogeneral.org/services/billing-assistance/",
    "applicationUrl": "https://api.hdc.hcai.ca.gov/Public/Extract/Attachment?id=2267a223-573d-4668-b7a6-7a74fef82104",
    "policyEffectiveDate": "11/14/2025",
    "hcaiPageUrl": "https://hcai.ca.gov/affordability/hospital-billing-policies/priscilla-chan-mark-zuckerberg-san-francisco-general-hospital-trauma-center/",
    "hcaiHospitalName": "PRISCILLA CHAN & MARK ZUCKERBERG SAN FRANCISCO GENERAL HOSPITAL & TRAUMA CENTER"
  },
  "warnings": [
    "No /cms-hhs-pricetransparency.txt file found on the hospital domain (CMS requires it); fell back to crawling the site."
  ],
  "run": { "pagesCrawled": 21, "totalSeconds": 4.7 }
}
```

### Field notes

- `mrf.prices[code]` is the **primary line** for that code. The Actor prefers outpatient over "both" over inpatient, and prefers lines that carry a gross charge. All matching lines (different settings or chargemaster entries) are listed in `lines`, up to 12.
- `min` / `max` are the de-identified minimum and maximum negotiated charges **as published in the file**. Some hospitals, UCSF for example, publish these on a different line than the gross charge. When that happens, `minMaxSetting` says which line they came from.
- `payerRateLow` / `payerRateHigh` / `payerRateCount` are computed from the payer-specific dollar amounts in the file. Rates published only as a percentage or an algorithm have no dollar figure and are not counted.
- `fap.freeCareMaxFplPct` is the income ceiling for free (full charity) care, as a percent of the FPL. `fap.discountMaxFplPct` is the ceiling for discounted care. `discountHasNoFplCap: true` means the policy says discounted care has no income ceiling.
- `fap.quotes[]` holds the evidence: the verbatim sentence (with whitespace normalised), its source URL, and what it supports.
  - `discountOther` is a related figure, such as an expected-payment limit, that is shown for context but not used as the threshold.
- `fap.documentsChecked[]` lists every policy document the Actor opened and what it found there.
- `warnings[]` lists everything that was missing or ambiguous. Treat `null` as "not found", never as zero.

To combine the thresholds with household size, use the HHS poverty guidelines for the current year. In 2026 the guideline for the 48 contiguous states is $15,960 for a household of 1, plus $5,680 for each additional person.

## Tested hospitals (October 2026)

| Hospital | Price file | Codes found | Free care ≤ | Discount ≤ | Run time |
|---|---|---|---|---|---|
| Zuckerberg SF General | 3.9 MB CSV (tall, v3) | 4/4 | 138% FPL | no FPL cap | ~5 s |
| UCSF Medical Center | 91 MB JSON (v3) | 4/4 | 400% FPL | 400% FPL | ~10 s |
| CPMC Van Ness (Sutter) | 16.9 MB CSV (tall, v3) | 3/3 | 400% FPL | not stated | ~8 s |
| Chinese Hospital SF | vendor page loads the file with JavaScript: not found | 0/3 | 200% FPL | 400% FPL | ~6 s |

## Limitations

- **Price files linked only through JavaScript** are not downloaded. Some vendors (e.g. apps.para-hcfs.com) load the file through a script on the page. The Actor reports the vendor page in `warnings` and `sourceUrls` instead.
- ZIP-compressed price files and the pre-2024 v1 JSON layout are not supported. Gzip is supported.
- The FPL extraction is rule-based and conservative. Unusual wording or scanned (image-only) PDFs can leave a threshold `null`, and that gap is always reported in `warnings`. Always show the user the quote, not just the number.
- The HCAI registry only covers California. For other states, the policy must be linked from the hospital's own site.
- A health system file can list several campuses under one license. Pass `hospitalName` to pick the right file.
- Prices are what the hospital published. They are not a quote or a guarantee of what a patient will be billed.

## Running locally

```bash
python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q          # unit tests for the MRF parser and the FPL extractor
apify run --input '{"hospitalUrl":"https://www.ucsfhealth.org","codes":["99284"]}'
```

Calling it from an app via the Apify API (synchronous run that returns the dataset items):

```bash
curl -X POST "https://api.apify.com/v2/acts/<username>~hospital-price-and-charity-finder/run-sync-get-dataset-items?token=$APIFY_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"hospitalUrl":"https://zuckerbergsanfranciscogeneral.org","codes":["99284","80053"]}'
```
