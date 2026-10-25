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
