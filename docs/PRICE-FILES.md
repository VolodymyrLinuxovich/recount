# Price file audit: what uninsured patients are quoted

Checked 2026-10-24 with `pipeline/price-audit` (Rust) on the price transparency files of the six San Francisco hospitals in `pipeline/out/hospitals.json`. Every number below is in `pipeline/out/price_audit.json`, and every one was recomputed by a separate Python script (`pipeline/price-audit/xcheck.py`) with the same result.

## The finding

**At 4 of 6 San Francisco hospitals, the "discounted cash price" for a patient paying without insurance is the full sticker price on every item in the file.**

| Hospital | Items with both prices | Cash price = gross charge | Median cash discount |
|---|---:|---:|---:|
| Zuckerberg San Francisco General | 12,835 | 100% | 0% |
| CPMC Van Ness | 14,200 | 100% | 0% |
| Saint Francis Memorial | 8,685 | 100% | 0% |
| St. Mary's Medical Center | 10,600 | 100% | 0% |
| UCSF Medical Center | 70,952 | 0.5% | 70% |
| Kaiser San Francisco | 324,874 | 0.2% | 44% |

Meanwhile insurers pay far less, in the same files:

| Hospital | Items with a cash price and insurer rates | Lowest insurer rate as % of cash (median) | Cash price above every insurer |
|---|---:|---:|---:|
| Zuckerberg San Francisco General | 12,835 | 4.4% | 92.1% |
| St. Mary's Medical Center | 10,600 | 22% | 49.7% |
| Kaiser San Francisco | 9,860 | 32.2% | 51.7% |
| Saint Francis Memorial | 8,685 | 54% | 0% |
| CPMC Van Ness, UCSF | not paired | | |

One line from our own sample bill: SF General's chest X-ray (71046) has a gross charge of $402 and a cash price of $402. The insurers in the same file, Medi-Cal plans, pay $10.31 to $27.48 for it.

## What this means for a patient

- At these four hospitals, "pay cash" saves nothing. The real discount for an uninsured patient is charity care and discount payment under California law, which is why Recount checks those first.
- California caps what a discount-eligible patient (at or below 400% of the poverty line) pays at the greater of what Medicare or Medi-Cal would pay (HSC 127405(d)(1); see `pipeline/DATA.md`). The insurer rates above show how far that is below the sticker price.

## Caveats

- **Insurer rates aren't what a patient pays.** They're the contract rates the hospital agreed with each plan. SF General's file has only 7 payers, mostly Medi-Cal managed care plans, so its 4.4% mostly compares the cash price with Medi-Cal rates.
- **"Not paired."** CPMC and UCSF list chargemaster lines (with gross and cash prices) and billing code lines (with insurer rates) as separate items with different descriptions. We don't guess which lines go together.
- **Six hospitals, one city.** These are the files we already use for line-by-line price checks. It isn't a statewide result.
- **Legal is not the same as fair.** Federal rules require a cash price to be listed, not discounted. Nothing here says these hospitals broke a rule.

## The files themselves

- **Format:** all six pass the official CMS validator (`@cmsgov/hpt-validator-cli` 1.10.8, data dictionary v3.0) with 0 errors. Kaiser gets one alert, because its version reads 3.0.1.
- **Freshness:** all six were updated between 2026-02-28 and 2026-04-01, within the 12 months 45 CFR 180.50(e) allows. All six attest that the data is true, accurate and complete.
- **NPIs:** all 23 Type 2 NPIs listed pass the NPI check digit.
- **SF General's min and max don't hold.** CMS defines the de-identified maximum as the highest negotiated rate for an item. SF General's file sets it to the gross charge instead, so on 869 items the "minimum" is above the "maximum", and 1,666 items have a payer rate outside the file's own range. Example: a complex wound repair lists a $273 maximum next to a $6,707.20 negotiated rate. The official validator doesn't check this.
- Saint Francis (86 items) and St. Mary's (83 items) also have payer rates outside their own min and max. We didn't look into why.

## Reproduce

```bash
cd pipeline/price-audit && cargo build --release
./target/release/price_audit --today 2026-10-24 --json ../out/price_audit.json key=<file> ...
python -I xcheck.py <folder with key.raw files>   # needs ijson; prints the same numbers
```

The six files total about 520 MB. Their download links are the `mrf.url` fields in `pipeline/out/hospitals.json`. The Rust tool reads all six in about 1.3 seconds.


## Statewide price files

Checked 2026-10-25. Line-by-line price checks now work for **340 of 470** California hospitals: the four hand-checked
San Francisco snapshots plus **336** from each hospital's own price file. On 2026-10-24 it was 240 (4 + 236).

### Why the first statewide run missed hospitals

The first run (2026-10-24, one Actor run per hospital, sites picked from Google results) left 230 hospitals without prices:

| Reason recorded | Hospitals | What was behind it |
|---|---:|---|
| Price file not found | 161 | The Actor looked for `/cms-hhs-pricetransparency.txt`, a name from the proposed rule. CMS requires `/cms-hpt.txt`, so it never found the index. 61 sites link their file through JavaScript. Many of the other 100 were the wrong website (a cruise line, a county locator page, a Kaiser page for a non-Kaiser hospital) or refuse automated clients. |
| File has none of the ER codes | 40 | 30 files were read to the end without ER codes (psychiatric and rehab hospitals). 6 were ZIP files the Actor couldn't open, 3 stopped at the 300 MB limit, 1 failed. |
| File may belong to another hospital | 26 | Health system files for a different campus. |
| Not run | 3 | No website found. |

No run ended in a timeout. The original batch had already retried failed and timed-out runs once.

A review also found that **42 of the 236 priced hospitals used a file that doesn't name them**: another hospital's file,
or the main campus's file for a campus that shares its license. The name check needed one shared word, so Mercy General in
Sacramento got the file of a Mercy hospital in Iowa, St. Joseph's in Stockton got one from Texas, and Sharp Chula Vista got
Sharp Memorial's. 22 of them now use their own file. The other 20 lost their price check until a file names them.

### What changed

- **The federal index.** `pipeline/find_price_files.py` reads `/cms-hpt.txt` (and the old name) at every hospital and
  health system domain we know. 193 domains serve one, listing 821 files. A system's index lists every hospital it runs.
- **Each file must say whose it is.** The script reads the first 3 MB of every candidate file. It keeps a file only when
  its header states the hospital's California license number from HCAI (322 hospitals), or names the hospital and states
  no other California hospital's license (14). A file that states another hospital's license is never used. When
  several hospitals share a license, the file must also name the campus. One hospital's prices are never copied to another.
- **The Actor re-ran in batch mode** with the verified file for each hospital (178 hospitals in 4 runs). Files the cloud run
  couldn't read (ZIP files, a server whose certificate chain is incomplete for Python, an `http://` link that only answers on
  `https://`) were read with the same scanner on a laptop, downloading with curl.
- **A scanner bug.** A second, independent parser (`pipeline/spot_check_prices.py`, using `pipeline/scripts/mrf_extract.py`)
  found that the scanner merged rows with the same description and kept the first price. At Kindred San Diego a metabolic
  panel showed $2.90 while the file also lists it at $531.66, which could flag a fair charge. Actor 0.3 keeps those rows
  apart and reads ZIP files. Every verified file was re-read with it on a laptop, since the published Actor is still 0.2.

### Checks

- **Hand-checked files** (`pipeline/check_against_snapshots.py`): on the four San Francisco files behind the snapshots,
  the statewide path read 80 of 81 prices exactly, 1 higher and 0 lower.
- **Second reader** (`pipeline/spot_check_prices.py`): 12 newly priced hospitals, picked at random among tall CSV and
  JSON files, re-read whole. 202 of 204 prices are the same. The other 2 are higher, from rows the second parser doesn't match. The test suite fails if the app's price is ever below the highest
  matching row the second reader finds.

### Still without a price check (130)

| Reason the app shows | Hospitals | Examples |
|---|---:|---|
| The price files we found aren't clearly this hospital's | 71 | 19 are campuses whose license file names only the main campus (Los Robles East, Sharp Mary Birch, the Providence Santa Rosa campuses). The rest only had other hospitals' files, or a file that states a license HCAI gives another hospital (the UCLA files). |
| This hospital's file doesn't list the ER codes we check | 36 | Psychiatric, rehab and long-term care hospitals. |
| We couldn't find this hospital's price file | 18 | Sites that refuse automated downloads (Enloe, Cottage, PIH, Torrance Memorial, Tahoe Forest, Mammoth) and county or state hospitals without a file we could find. |
| We found the file but couldn't read it | 5 | CHLA and Montage (Community Hospital of the Monterey Peninsula) refuse downloads, MPTF's link is dead, UC San Diego's file is over 3 GB, Aurora Las Encinas isn't a CMS template file. |

Reproduce: `python -I pipeline/find_price_files.py licenses|txt|probe|select <results>`, then
`python -I pipeline/build_statewide_prices.py <results> [<newer results> ...]`.
