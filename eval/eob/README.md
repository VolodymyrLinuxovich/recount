# Recount EOB eval

A benchmark for the insured flow in docs/EOB.md:

1. **Reading.** Does the reader turn a photo of an insurance Explanation of Benefits into the right `ParsedEob` (convex/lib/eob.ts)?
2. **Finding problems.** Do the bill-vs-EOB rules (rules 1-7, convex/lib/eobChecks.ts) catch what's wrong without false alarms?

It builds synthetic bill + EOB pairs, plants one known problem in most of them, renders both as images and scores the app's output against the answer key. The bills come from the bill eval (`../generate.py`), so they use the same San Francisco hospitals and published prices.

## Setup

Same packages as the bill eval. Use `../.venv` if it exists, or make one here:

```sh
cd eval/eob
python3 -m venv .venv
.venv/bin/pip install -r ../requirements.txt
```

Run the scripts with `-I`, like the bill eval. With python.org Python on macOS, HTTPS needs `SSL_CERT_FILE=/etc/ssl/cert.pem`.

## Run

```sh
.venv/bin/python -I generate.py              # 30 pairs -> out/ and fixtures/
.venv/bin/python -I render.py                # out/<id>.eob.png and out/<id>.bill.png
.venv/bin/python -I render.py --sample       # convex/lib/sampleEob.json -> public/sample-eob.png
.venv/bin/python -I score.py --oracle        # true EOBs as predictions: must be 100%
SSL_CERT_FILE=/etc/ssl/cert.pem .venv/bin/python -I read.py --env-file ../../.env.local --only pair-001 pair-005 pair-009
.venv/bin/python -I score.py --pred preds    # score the reading and the findings
```

To read with an Azure OpenAI deployment instead: `read.py --provider azure --env ~/Code/recount/.env.azure --dst preds-azure`. `generate.py -n 60 --seed 7` makes a different set. The same seed always gives the same pairs.

## Files

| file | what it does |
|---|---|
| `generate.py` | builds the pairs, plants problems, writes the answer key and the shared fixtures |
| `render.py` | draws an EOB as a clean scan or a phone photo; also renders each pair's bill with `../render.py` |
| `eobchecks.py` | Python copy of `checkEob` (rules 1-7), used to verify the answer key and to score findings |
| `read.py` | sends each EOB image to the same model with the same prompt (`EOB_PROMPT`, read from convex/agent.ts at run time) and schema as the app |
| `score.py` | compares predictions with the answer key, writes `score.md` and `score.json` |
| `fixtures/` | `{bill, eob, expect}` per pair; `tests/eob.fixtures.test.ts` runs the TypeScript rules on them |

## What gets generated

Each pair is an ER bill and the EOB for the same claim from a fictional California plan: Golden Bear Health Plan (HMO, PPO), Fogline Health (PPO, EPO), Redwood Lantern Assurance (PPO), Sierra Larkspur Health Plan (HMO) and Poppyfield Community Health Plan (Medi-Cal). Each plan has its own deductible, ER copay, coinsurance and allowed-amount ratio. Every EOB line adds up: allowed = plan paid + deductible + copay + coinsurance + not covered. A correct bill takes the plan payment and the contractual adjustment, so its amount due is what the EOB says the patient owes, minus what they already paid.

The default 30 pairs:

| kind | pairs | planted | expected findings |
|---|---|---|---|
| clean | 6 | none (in-network, out-of-network ER billed correctly, Medi-Cal, network not printed) | none |
| mismatch_date | 2 | EOB for another visit 3 to 11 weeks away | EOB_MISMATCH |
| mismatch_provider | 1 | EOB for the ER doctors' group, not the hospital | EOB_MISMATCH |
| pending | 2 | claim still in process, bill asks for full charges | CLAIM_PENDING |
| surprise | 3 | out-of-network ER, hospital balance bills | SURPRISE_BILL |
| owes_more | 3 | in-network bill skips all or part of the plan discount | OWES_MORE_THAN_EOB |
| owes_more_unknown | 1 | same, network not printed | OWES_MORE_THAN_EOB |
| not_posted | 1 | plan payment missing from the bill | OWES_MORE_THAN_EOB |
| not_applied | 2 | plan payment lumped into adjustments, none shown | INSURANCE_NOT_APPLIED |
| not_on_eob | 2 | a bill line the claim doesn't list | NOT_ON_EOB |
| not_on_eob_billed | 1 | same, and billed at full charge | OWES_MORE_THAN_EOB, NOT_ON_EOB |
| denied_line | 2 | one or two lines not covered (PR-204, PR-96, PR-50) | DENIED_BY_PLAN |
| denied_claim | 2 | whole claim denied (PR-27), sometimes with blank line amounts | DENIED_BY_PLAN |
| sample_like | 2 | like the demo: full charges, no payment shown, one line denied | OWES_MORE_THAN_EOB, DENIED_BY_PLAN |

About 60% of the EOBs and bills are phone photos. Per pair:

- `out/<id>.bill.json`, `out/<id>.eob.json`: the true ParsedBill and ParsedEob
- `out/<id>.truth.json`: both, plus the kind, plan, the per-line deductible/copay/coinsurance split (`shares`), `expect` and the mirror's `findings`
- `out/<id>.eob.png`, `out/<id>.bill.png`
- `fixtures/<id>.json`: `{bill, eob, expect}` with `expect` = `[{kind, amount}]`

`generate.py` stops with an error if eobchecks.py doesn't find exactly the planted findings and amounts on a pair.

## What gets scored

Predictions go in a folder as `<id>.eob.json` and optionally `<id>.findings.json` (the app's findings). If findings are missing, `score.py` runs eobchecks.py on the predicted EOB and the true bill, so a miss is the EOB reading's fault.

- **Reading:** exact match of the four money totals, network, claimStatus, emergency, isEob and service dates; line precision and recall on (code, billed); allowed, plan paid, patient owes, not covered and remark code on matched lines; split by clean scan and photo.
- **Findings:** per kind, planted, caught, missed, wrong amount and false alarms; clean pairs with a false alarm; pairs fully right. `NOT_ON_EOB` must point at the same bill line.

## Caveats

- eobchecks.py is a copy of eobChecks.ts. `npx vitest run tests/eob.fixtures.test.ts` checks the two agree on every fixture; if it fails after a rule change, update eobchecks.py and regenerate.
- The PARSED_EOB schema in read.py is a copy of eob.ts. The prompt is not a copy: it is read from convex/agent.ts each run (with a fallback copy if that fails, and a warning).
- The `--oracle` run is 100% by design. It checks the answer key and the rules, not the reader.
- All insurer names, member IDs, claim numbers, phone numbers and addresses are made up.
