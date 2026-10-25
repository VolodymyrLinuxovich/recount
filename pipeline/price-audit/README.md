# price-audit

A Rust command-line tool that reads a hospital's price transparency file and reports what an uninsured patient is quoted next to what insurers pay.

Federal rules (45 CFR 180.50) make every US hospital publish one machine-readable file with its gross charge, its discounted cash price and every payer's negotiated rate for every item. The official CMS validator checks that the file follows the format. This tool reads the numbers inside it.

## What it reports, per file

- **Cash vs full price.** How often the "discounted cash price" for a self-pay patient equals the gross charge (no discount at all), and the median discount where there is one.
- **Cash vs insurers.** For items that list both a cash price and payer dollar rates, the lowest insurer rate as a share of the cash price (median), and how often the cash price is above every insurer's rate.
- **Consistency.** Items whose de-identified minimum is above their maximum, and items with a payer rate outside the file's own min and max. CMS defines min and max as the lowest and highest negotiated dollar rates, so both should never happen.
- **File facts.** Template version, last update date and whether it's older than the 12 months 45 CFR 180.50(e) allows, the attestation flag, and a check digit test on every Type 2 NPI.

When a file lists cash prices and insurer rates as separate items (CPMC and UCSF do this: chargemaster lines carry the prices, billing code lines carry the payer rates), the tool says "not paired" rather than guess which lines go together.

## Run it

```bash
cargo build --release
./target/release/price_audit --today 2026-10-24 --json ../out/price_audit.json \
  zsfg=path/to/zsfg.csv ucsf=path/to/ucsf.json kaiser_sf=path/to/kaiser.csv
cargo test
```

It reads CMS template v2 and v3 files in all three layouts (CSV tall, CSV wide, JSON) and detects which one from the file itself. Each file is read once, front to back. Wide CSV and JSON use constant memory (11 MB for Kaiser's 216 MB file). Tall CSV keeps one small record per item, since it repeats an item once per payer.

## How we checked it

- **Format, by CMS's own tool.** All six San Francisco files pass the official validator (`@cmsgov/hpt-validator-cli` 1.10.8, library 2.6.0, data dictionary v3.0) with 0 errors. Kaiser gets one alert because its version reads 3.0.1. So the findings below are about the numbers, not formatting.
- **Every number, by a second implementation.** `xcheck.py` recomputes the same figures in Python from scratch (csv and ijson, no shared code). On all six files, every number matches: items, cash = gross share, paired items, the medians, min above max, and rates outside min and max.
- **Unit tests** cover number parsing (CMS forbids "$" and thousands separators), cash and insurer comparisons, medians, dates (ISO and M/D/YYYY) and the NPI check digit.

## Results (6 San Francisco hospitals, 2026-10-24)

See [`docs/PRICE-FILES.md`](../../docs/PRICE-FILES.md) for the findings and what they mean for a patient. The machine-readable report is `pipeline/out/price_audit.json`.
