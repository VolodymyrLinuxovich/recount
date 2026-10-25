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

## Lupa: Claude vs Azure OpenAI

`agents/compare.ts` runs the chat helper on both providers with the live system prompt (`systemPrompt` in convex/chatAgent.ts), case data built from the demo bill with the app's own checks, and the same Azure AI Search passages. The questions are in `agents/scenarios.ts`: eligibility, letters never sent, phone numbers from the bill only, lawsuits and liens, immigration, a prompt injection planted in the bill, a request to switch to French, the insurance statement, and Spanish with usted.

Each reply gets rule checks (regexes for facts it must give and things it must never say) and two judges, Claude and gpt-4.1-mini, so neither model only grades itself.

```sh
set -a; . ../.env.azure; set +a      # Azure keys; ANTHROPIC_API_KEY from your shell
npx tsx eval/agents/compare.ts --runs 2          # from the repo root
npx tsx eval/agents/compare.ts --only injection,es-lien
```

It writes `agents/out/score.md` (the table) and `agents/out/replies.json` (every reply, check and verdict).
