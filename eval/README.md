# Recount eval

A benchmark for the two things Recount has to get right:

1. **Reading.** Does the reader turn a photo of a bill into the right `ParsedBill` (convex/lib/bill.ts)?
2. **Finding problems.** Do the checks (convex/lib/checks.ts) catch the errors on a bill without crying wolf on clean ones?

It generates synthetic San Francisco ER bills priced from each hospital's own published charges, plants known errors in some of them, renders them as images, and scores the app's output against the answer key.

## Setup

```sh
cd eval
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Run the scripts with `-I`. They read price files downloaded from hospital websites, and `-I` keeps Python from importing anything from the current folder.

## Run

```sh
.venv/bin/python -I generate.py            # 30 bills -> out/
.venv/bin/python -I generate.py --demo     # demo bill -> out/demo-bill.* and public/sample-bill.png
.venv/bin/python -I score.py --oracle      # rules alone, given a perfect reading
.venv/bin/python -I read.py                # read out/*.png with the app's model and prompt -> preds/
.venv/bin/python -I score.py --pred preds  # score the reading and the findings
.venv/bin/python -I test_score.py          # scorer tests
```

`generate.py -n 60 --seed 7` makes a different set. The same seed always gives the same bills.

## Files

| file | what it does |
|---|---|
| `prices.py` | loads `~/Code/recount-data/out/prices_<hospital>.json` (override with `RECOUNT_DATA_DIR`) and picks the outpatient ER facility row for each code |
| `generate.py` | builds the bills, plants errors, writes the answer key, renders images |
| `render.py` | draws a bill as a clean scan, a phone photo (desk, tilt, shadow, blur) or a 2-page PDF |
| `checks.py` | Python copy of `checkBill` in checks.ts, used to verify the answer key and for the oracle run |
| `read.py` | sends each image to the same model with the same prompt and settings as `convex/agent.ts` |
| `score.py` | compares predictions with the answer key, writes `score.md` and `score.json` |
| `demo_bill.json` | the demo bill (ZSFG ER visit, fictional patient Alex Rivera) |

`render.py` also works on its own: `python -I render.py demo_bill.json --variant all --out out/demo`.

## What gets generated

Each bill is an ER visit (chest pain, head injury, abdominal pain, laceration or dehydration) at ZSFG, UCSF Parnassus, CPMC Van Ness or Saint Francis. Every line is priced at that hospital's published gross charge times quantity. The default 30 bills are mixed like this:

| kind | share | planted error |
|---|---|---|
| clean | 25% | none, to count false alarms |
| duplicate | 20% | one line entered twice, same code, date and amount (`DUPLICATE_LINE`) |
| above list price | 20% | one line billed 8% to 60% over the published gross charge (`ABOVE_LIST_PRICE`) |
| bad total | 15% | printed total doesn't match the lines: swapped digits, a leftover charge, or +$1,000 (`TOTAL_MISMATCH`) |
| summary only | 13% | charges grouped by department, no codes (`NOT_ITEMIZED`) |
| combo | 7% | a duplicate and a bad total |

About 60% are phone photos, 30% clean scans and 10% also get a 2-page PDF. Each bill gets:

- `out/<id>.png` (and `out/<id>.pdf` for the PDF ones)
- `out/<id>.truth.json`: the `ParsedBill`, the planted `errors` (kind and line indexes), the price source of each line, and `expectedFindings` from checks.py
- `out/refs/<hospital>.json`: the hospital's prices in `HospitalRef` shape, so the checks see the same prices the bills were built from

`generate.py` stops with an error if the checks don't find exactly the planted errors on a bill. That makes every answer key something the rules can actually catch.

## What gets scored

Predictions go in a folder as `<id>.parsed.json` (the reader's `ParsedBill`) and optionally `<id>.findings.json` (the app's `Finding[]`). If findings are missing, `score.py` runs checks.py on the predicted bill.

**Reading**

- line precision and recall on (code, charge) pairs
- total charges and amount due, exact to the cent
- itemized flag
- line recall split by clean, photo and PDF

**Findings**

- per kind: planted, caught, missed, false alarms
- clean bills with any false alarm
- bills fully right

A finding counts as caught when its kind matches and it points at the same line. Predicted line numbers are mapped to answer-key lines through the reading match, so a reader that skips one line doesn't break every index after it. `CASH_PRICE_GAP` is advice, not an error, so it never counts as a false alarm.

## Caveats

- ZSFG's price file has no rows for 36415, J2405 or J7050. The demo bill uses placeholder prices for those three lines ($45, $28/unit, $95), taken from the `PLACEHOLDER_PRICES` table in prices.py. The generator only uses a placeholder when a code is missing, and `lineSources` in each truth file records which lines used one.
- ZSFG and CPMC publish a discounted cash price equal to the gross charge, so their bills get no `CASH_PRICE_GAP` advice. UCSF publishes cash at 30% of gross, so every UCSF line gets one.
- checks.py is a copy of checks.ts. If checks.ts changes, update checks.py to match, or pass the app's own findings files to `score.py`.
- The `--oracle` run is 100% by design. It checks the answer key and the rules, not the reader.

## Hard set (`hard/`)

The 30-bill set above is one layout in printed type, so it says little about real paper. `hard/` makes it harder:

- **Six bill layouts** (`hard/layouts.py`): the classic statement; an itemized statement like big hospital billing systems print (lines grouped by revenue code with a subtotal row per group, payments in their own table, a payment coupon); a summary with revenue codes only; a 2 to 4 page bill with page subtotals and the total only on the last page; a UB-04-like claim form (MMDDYY dates, dollars and cents in separate boxes, totals on line 23 with revenue code 0001); a collection agency letter, with the hospital's itemization or with only the balance.
- **Hard photo conditions** (`hard/conditions.py`, PIL, numpy and OpenCV): crumpled, folded, shot at an angle with up to 12 degrees of tilt, hard hand shadows, low light, blur, glare, cropped edges, pen circles, check marks and notes (some next to a charge, like "450" or "paid 50"), highlighter and coffee rings.
- **24 insurance statement pairs** (`hard/eob_generate.py`): claims from the EOB eval in four EOB layouts (the classic one, a box per service, a dense table with footnoted reason codes, a claim decision letter), some with a second claim (the ER doctors' group) on the same page, under the same conditions. Denied lines, whole denied claims, pending claims, out-of-network ER, a bill that skips the plan discount, a line the plan never got, a statement for another provider.
- **Two splits.** `dev` (25 bills, 12 pairs) is what we looked at and fixed against. `holdout` (25 bills, 12 pairs, other seeds) is only scored.

`hard/run.ts` runs the app's own code, not a copy: `structured()` in convex/lib/model.ts, the prompts read from convex/agent.ts, Document Intelligence through convex/lib/docIntel.ts, the hospital match, and `allFindings`. It repeats only the glue of `readAndCheck` (the two reads, the comparison, the RETAKE and NOT_A_BILL stops). Document Intelligence results are cached in `out/hard-docintel/`.

```sh
python -I hard/generate.py && python -I hard/eob_generate.py            # images + answer keys -> out/hard/, out/hard-eob/
npx tsx eval/hard/run.ts --set bills --oracle                              # the app's rules on the answer keys: must be 50/50
npx tsx eval/hard/run.ts --set bills --env .env.local --docintel-only      # fill the Document Intelligence cache, waiting out 429s
npx tsx eval/hard/run.ts --set bills --env .env.local --out hard-after     # read and check every bill
npx tsx eval/hard/run.ts --set eob --env .env.local --out hard-eob-after
python -I hard/score.py --set bills --pred hard-after                      # out/hard-after/score.md
python -I hard/score.py --set eob --pred hard-eob-after
```

`hard/sample/` has a few of the images, small. The full set (about 15 MB) is generated, not committed.

### Results (2026-10-25, synthetic documents only)

Bills, Claude Opus 5.5 reading, Document Intelligence as the second read, then the rules:

| | lines right | totals right | errors caught | false alarms | clean bills with an alarm | bills fully right | stopped as "retake" |
|---|---|---|---|---|---|---|---|
| before fixes, dev (25) | 261/271 | 23/25 | 19/22 | 10 | 0/4 | 21/25 | 2 |
| before fixes, held out (25) | 250/265 | 23/25 | 19/22 | 5 | 0/4 | 18/25 | 2 |
| after fixes, dev | 266/271 | 25/25 | 22/22 | 4 | 0/4 | 23/25 | 0 |
| **after fixes, held out** | **260/265** | **25/25** | **22/22** | **4** | **0/4** | **23/25** | **0** |

After the fixes, per condition (a bill counts under each of its conditions): crumpled, folded, angle, shadow, glare, crop, coffee and highlighter bills read 100% of their lines; pen marks 120/123; low light 35/45 and blur 33/43. Every false alarm left is on a photo that is both dim and blurred, where the reader misread an amount (and said it was unsure). Per layout: classic, multi-page and collection letters 100%; itemized-by-department 65/69; UB-04 57/60; summary 28/31.

The "after" run reuses the "before" run's Claude reads (the read prompt didn't change), so the difference is the fixes alone. The second read lined up with the first, line for line, on 34 of 50 bills. On the rest it found fewer lines (a crumpled or angled photo, a 3-page PDF on the free tier, which reads only 2 pages, or no table at all on 8 bills, where the app falls back to a Claude read of the charges column), so the comparison is skipped and the app says so.

Insurance statements (24 pairs, read bill + read statement, then the rules): **22 of 22** planted problems caught with the right dollar amount, **0** false alarms, 129 of 129 statement lines read. The "you may owe" total was right on 23 of 24; the miss is a crumpled, cropped statement with two claims on one page, where the reader mixed the claims. The fixes didn't change these numbers.

### What the hard set found, and the fixes

1. **UB-04 split cents.** "11963 00" (dollars and cents in separate boxes) was parsed as $1,196,300 by stripping the space, so every line looked far above the list price. `convex/lib/amount.ts` now reads printed amounts one way for every read: split cents, a pen mark next to a charge ("135.00 45" was read as 135.0045 by the table parser), parentheses, and nothing else.
2. **Collection letters and summaries with only a balance** were sent back as "retake the photo" because no lines were read. `balanceOnly` (convex/lib/bill.ts) lets them through, and the checks ask for an itemized bill.
3. **When the two reads disagree,** the app used to take the second read's amount. On these photos the full read was right on 18 of 25 disagreeing lines and the second read on 3, so the app now keeps the full read's amount and still asks the patient to pick.
4. Not fixed: Document Intelligence on the free tier answers 429 under load (the app falls back to a Claude read of the charges column), and dim plus blurred photos are still misread now and then. The reader flags those as hard to read, so the total check says the gap may be our misreading.

## Lupa: Claude vs Azure OpenAI

`agents/compare.ts` runs the chat helper on both providers with the live system prompt (`systemPrompt` in convex/chatAgent.ts), case data built from the demo bill with the app's own checks, and the same Azure AI Search passages. The questions are in `agents/scenarios.ts`: eligibility, letters never sent, phone numbers from the bill only, lawsuits and liens, immigration, a prompt injection planted in the bill, a request to switch to French, the insurance statement, and Spanish with usted.

Each reply gets rule checks (regexes for facts it must give and things it must never say) and two judges, Claude and gpt-4.1-mini, so neither model only grades itself.

```sh
set -a; . ../.env.azure; set +a      # Azure keys; ANTHROPIC_API_KEY from your shell
npx tsx eval/agents/compare.ts --runs 2          # from the repo root
npx tsx eval/agents/compare.ts --only injection,es-lien
```

It writes `agents/out/score.md` (the table) and `agents/out/replies.json` (every reply, check and verdict).
