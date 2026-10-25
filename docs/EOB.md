# Insured patients: checking a bill against the insurance EOB

Branch `insured`, worktree `~/Code/recount-insured`. This file is the contract between the people building it. Read all of it before changing code.

## Why

Recount today compares a bill with the hospital's cash prices and California charity care law. That mostly helps uninsured patients. Most patients have insurance, and their most common, most fixable problems are between the bill and the insurer's statement (the EOB):

- The hospital asks for more than the EOB says the patient owes.
- The plan paid, but the bill doesn't show the payment.
- An emergency at an out-of-network hospital is billed above in-network cost sharing, which the federal No Surprises Act forbids.
- The plan denied a line, and the patient can appeal to the insurer.
- The claim is still pending, so the patient shouldn't pay yet.

## The flow

1. The bill is read as today (status `needs_household`).
2. A new screen `eob` comes right after the findings screens and before `q1`: "Do you have insurance? Add your Explanation of Benefits." Buttons: take a photo, choose a file, or "Type the amounts instead"; "Skip, no insurance or no statement". There is no sample statement button, not even for the sample bill. The patient can also add it later from the answer screen and from "More", any time before approving.
3. Upload goes through the same `prepareFile` and upload URL as the bill. Then `cases.addEob({ id, token, fileId, fileType })`, or `cases.addSampleEob({ id, token })` for a sample case (kept for scripts/preflight.mjs; no screen calls it). Typed totals go to `cases.setEobManual({ id, token, patientOwes, planPaid?, network?, payer? })`: it builds a statement with no lines (`typedEob` in lib/eob.ts, `typed: true`, `eobSource: "typed"`), sets `eobStatus: "done"` and runs the same rules as a read statement, so only the total rules (3, 4, 5) can fire.
4. The mutation sets `eobStatus: "reading"` and schedules `agent.readEob`. The action reads the file with the model (task `"read"`, schema `ParsedEob`, prompt `EOB_PROMPT`), or loads `SAMPLE_EOB` for a sample case. If it's not an EOB (`isEob: false`), it sets `eobStatus: "error"`, `eobError: "NOT_AN_EOB"`.
5. The action runs `checkEob(bill, eob, hospital, lang)` and recomputes the case's findings with `allFindings(...)` (see below). It sets `eob`, `eobStatus: "done"`, `findings`. If the household was already answered and `household.insured` is false, set it to true and re-run `assess`. If letters already exist (status `ready`), set status `drafting` and schedule `agent.draftLetters` again. Never touch an approved case: `addEob` refuses with a ConvexError once the case is approved.
6. Every step is logged to `steps` like today, with `kind` (`ai` for the read, `rule` for the checks).
7. `cases.removeEob({ id, token })` deletes the file, clears the EOB fields, recomputes findings, and redrafts letters if they exist.
8. `cases.remove` also deletes `eobFileId`.

## Findings

`allFindings(bill, hospital, eob, lang) = [...checkBill(bill, hospital, lang), ...(eob ? checkEob(bill, eob, lang) : [])]` lives in `convex/lib/eobChecks.ts`. Everything that computes findings today must call it instead of `checkBill`: `finishCheck`, `correctLine`, `draftLetters` (`findingsEn`), and anything else that calls `checkBill` for a case. `potentialSavings` must count each dollar once: EOB findings that overlap (`OWES_MORE_THAN_EOB` and `SURPRISE_BILL`) never both appear.

A finding uses the existing `Finding` shape from `checks.ts`. `lines` are indexes into `bill.lines` (may be empty). `amount` is dollars the patient could stop owing (0 if unknown). Every finding's `evidence` cites the EOB field and the bill field it compares, for example `{ label: "Your insurance says you owe", value: "$250.00", source: "EOB from Blue Shield, claim 123" }`. Text in English or Spanish by `lang`, plain words, short sentences.

Definitions used below:
- `due` = `bill.amountDue`, or if null, `bill.totalCharges - bill.insurancePaid - bill.adjustments - bill.patientPaid`.
- `eobOwes` = `eob.totalPatientOwes`, or if null, the sum of the lines' `patientOwes`. If both are null, the rules that need it are skipped.
- `stillOwes` = `max(0, eobOwes - bill.patientPaid)`.
- `erVisit` = `eob.emergency === true`, or any bill line has revenue code 0450 to 0459, or CPT 99281 to 99285, or a description containing "emergency".
- Money compares round to cents. "More than" means more by at least $1.00.

Rules, in this order:

1. **EOB_MISMATCH** (confidence `check`, amount 0). If the EOB's service dates don't overlap the bill's service dates (bill `serviceDate` or line dates, with 3 days of slack either side), or the provider name shares no word of 4+ letters with the hospital name (ignore "hospital", "medical", "center", "health", "the"). When this fires, stop: return only this finding. Wrong statement, wrong conclusions.
2. **CLAIM_PENDING** (`high`, amount 0). `claimStatus === "pending"`. Stop after this: return only this finding. Tell the patient not to pay until the insurer finishes, and to ask the hospital to hold the bill.
3. **SURPRISE_BILL** (`high`). `eob.network === "out"` and `erVisit` and `due > stillOwes`. Amount `due - stillOwes`. Cite the No Surprises Act (Public Health Service Act section 2799B-1, 42 U.S.C. 300gg-131): for emergency care, an out-of-network hospital can't bill more than the in-network cost sharing. Mention the federal No Surprises Help Desk, 1-800-985-3059.
4. **OWES_MORE_THAN_EOB** (`high`). Only if rule 3 didn't fire: `due > stillOwes`. Amount `due - stillOwes`. Plain words: "Your insurance says you owe $X. The hospital is asking for $Y." For an in-network provider (`network === "in"`), add that in-network providers agree not to bill above the plan's allowed amount (balance billing). For `unknown` network, don't claim that; just ask the hospital to explain the difference.
5. **INSURANCE_NOT_APPLIED** (`high`). `eob.totalPlanPaid > 0` and `bill.insurancePaid === 0`. Amount `min(totalPlanPaid, due)`. Only if neither rule 3 nor rule 4 fired (otherwise the same dollars would count twice; then add one evidence line to that finding instead: "Your plan paid $Z, and the bill shows no insurance payment").
6. **NOT_ON_EOB** (`check`). Only if the EOB has at least one line with a code. For each bill line with a code that matches no EOB line code (compare with `normalizeCode` from hospital.ts, also match revenue codes), one finding per line. Amount 0 (we don't know the patient owes nothing for it; it's a question). Text: ask the hospital whether this charge was sent to insurance.
7. **DENIED_BY_PLAN** (`high`). Lines with `notCovered > 0`, or `claimStatus` is `denied` or `partly_denied`. One finding for all of them. Amount = sum of `notCovered` (or `totalPatientOwes` when the whole claim is denied and line amounts are missing). Evidence: each line's description, amount and `remark`. Text: the patient can appeal to the insurer. In California, after the plan's internal appeal (or right away if urgent), they can ask the state for an Independent Medical Review: DMHC (1-888-466-2219, healthhelp.ca.gov) for HMO and most plans, or the Department of Insurance (1-800-927-4357) for some PPO policies. Medi-Cal and Medicare have their own appeals; for those say "follow the appeal steps on your statement" and don't name DMHC.

`EOB_FINDING_TARGET` in `eob.ts` says which letter a finding belongs in.

## Letters

`convex/lib/letters.ts` exports `letterKinds(facts): Letter["kind"][]`, which `draftLetters` uses instead of its hard-coded list:
- `"assistance"` always (California charity care also covers insured patients with high medical costs).
- `"dispute"` if any finding targets the hospital (today's findings all do, plus the EOB ones with target `hospital`).
- `"appeal"` if any finding targets the insurer (`DENIED_BY_PLAN`). Addressed to the insurer at `eob.appealAddress` (or "[insurer appeals address]"), quoting member ID and claim number.

`Letter["kind"]` becomes `"assistance" | "dispute" | "appeal"`. `LetterFacts` gains `eob?: ParsedEob | null`. The templates (`templateLetters`) cover all three kinds in English with a Spanish copy, like today. The dispute letter includes each hospital-target EOB finding, with the dollar amounts from the facts. `SURPRISE_BILL` in the dispute letter cites the No Surprises Act and asks the hospital to correct the bill to the in-network cost sharing shown on the EOB. `CLAIM_PENDING` in the dispute letter asks the hospital to hold the bill and not send it to collections until the insurer finishes. Spanish titles: "Apelación al seguro" for appeal.

The model prompt (`LETTER_PROMPT` and the per-kind instruction) moves to `letters.ts` as `letterPrompt(kind)` so it can describe the appeal letter. Same rules as today: only facts from the JSON, no invented laws, amounts or names. The law lines for the EOB findings are fixed strings in `letters.ts`, the same way `LAW_LINE` works today, and the prompt tells the model to use them word for word. `inventedAmounts` already scans every number in the facts, so the EOB amounts count as known once `eob` is in the facts.

`cases.approve`'s `LetterV` accepts `kind: "appeal"`.

## Sample

`convex/lib/sampleEob.json` (+ `SAMPLE_EOB` in `sample.ts`) is a made-up EOB for the sample bill's visit (same fictional patient Alex Rivera, same date, ZSFG, plan "Golden Bear Health Plan HMO" — a fictional insurer name). It's built so the demo shows three findings: the hospital asks for more than the EOB says (OWES_MORE_THAN_EOB), the plan paid but the bill shows no payment folded into that finding as evidence, and one denied line (DENIED_BY_PLAN, remark "CO-50 Not medically necessary") so the appeal letter appears. `public/sample-eob.png` is rendered from it.

## Who owns what

Edit only your files. If you need a change in someone else's file, write it down in your final report instead.

| owner | files |
|---|---|
| contract (done) | `convex/lib/eob.ts`, `docs/EOB.md`, the `FindingKind` union in `checks.ts`, the EOB fields in `schema.ts` |
| backend | `convex/lib/eobChecks.ts`, `convex/agent.ts`, `convex/cases.ts`, `convex/lib/sample.ts`, `convex/lib/sampleEob.json`, `convex/lib/pipeline.ts`, `convex/pipeline.ts`, `convex/lib/privacy.ts`, `convex/chatAgent.ts`, `convex/chat.ts`, `tests/eobChecks.test.ts`, `tests/eob.fixtures.test.ts` |
| letters | `convex/lib/letters.ts`, `convex/lib/letterCheck.ts`, `tests/letters*.test.ts` |
| frontend | everything in `src/` |
| eval | `eval/eob/` (new folder), `public/sample-eob.png` |

`convex/_generated/api.d.ts` is hand-edited when a function is added (there's no reachable backend for codegen in the worktree): backend owns it.

## Shared fixtures

`eval/eob/fixtures/*.json` each hold `{ "bill": ParsedBill, "eob": ParsedEob, "expect": [{ "kind": EobFindingKind, "amount": number }] }`. The eval writes them from its generator; the backend's `tests/eob.fixtures.test.ts` runs `checkEob` on each and asserts the kinds and amounts match. That keeps the TypeScript rules and the eval's answer key the same.

## Rules for everyone

- Plain words, short sentences, English and Spanish for anything the patient reads.
- No AI mentions in commit messages. No co-author lines.
- A model never decides an amount or a finding. It only reads the EOB and drafts letter text.
- Run `npx tsc --noEmit -p convex`, `npx vitest run` and, for the frontend, `npx next build` before you say you're done.
