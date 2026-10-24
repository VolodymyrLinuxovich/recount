# Numbers check

Checked 2026-10-24 against the live site (recount-nu.vercel.app, fetched 09:04 PT), `README.md`, `DEVPOST.md`, `DEMO.md`, `public/audit/findings.json` (generated 12:51 UTC), `convex/lib/hospitalIndex.json`, `convex/lib/snapshots/*.json`, `convex/lib/sampleBill.json`, `convex/lib/reference.ts`, `convex/lib/privacy.ts`, the cited web sources, and the Opus 5.5 price list. No files were changed.

**Every headline number is correct.** There are 4 WRONG items: two broken claims (/privacy and the "break the law" wording) and two overstatements (file sizes and the lien rule). There are also 4 minor wording notes.

## WRONG

| Claim | Where | Shown | True | Source | Fix |
|---|---|---|---|---|---|
| /privacy page exists | DEVPOST "A /privacy page states what is kept"; task brief | live `/privacy` returns **404** | The page exists only in `recount-ui` (`src/app/privacy`), not in `recount` main or the deployment | `curl https://recount-nu.vercel.app/privacy` | Deploy the recount-ui privacy page, or drop the sentence |
| "Breaks state law" wording | Live home: "14 break state law"; /audit: "breaks state law", "The three rules hospitals break most", "{n} break the law"; README line 7: "own policy breaks state law"; in-bill card `policy.headBreaks` | "break(s) the law" | DEMO.md says to say "conflicts with state law", never "breaks the law", and claims "The home page and /audit use this wording". They don't. | `en.json` keys `landing.stat4`, `audit.figConflict`, `audit.foundSub`, `audit.ruleSplit`, `policy.headBreaks`, `policy.foot.some` | Change to "conflicts with state law" (and Spanish), or correct DEMO.md |
| Price file size | DEVPOST line 13 "price files of **100 MB** or more"; README "90 MB or more"; DEVPOST "often 90 MB or more" | 100 MB / 90 MB+ | Largest tested file is UCSF at **91 MB**. ZSFG is 3.9 MB and CPMC is 16.9 MB. | `actor/README.md` "Tested hospitals" table | "up to 90 MB" or "some over 90 MB" |
| Lien rule | README "Since January 2025, hospitals … **can't put a lien on your home**" | applies to everyone | HSC 127425(h) bans liens on real property only for patients **eligible for charity or discount care**. The audit rule text was corrected for this today. | HSC 127425(h); audit `rules[LIENS].lawQuote` | "…can't put a lien on the home of a patient who qualifies for help" |

## Minor wording (true but loose)

| Claim | Where | Shown | Note |
|---|---|---|---|
| Medical debt | Home stat | "About 20 million **people**" | Source says "20 million **people** (nearly 1 in 12 **adults**)", owing over $250, as of Dec 2021 (brief published Feb 2024). Fine as is. "adults" would be more exact. |
| 14 of 470 | Home stat "14 of 470… We checked the policies of 470 California hospitals" | 470 | 463 were readable. The /audit hero handles this correctly ("463 … of 470"). Consider "14 of 463". |
| "every California hospital" | /audit hero `audit.heroAll` | every | 463 of 470. The subline says so. |
| ZSFG free care | Home `landing.why`: "free care **below** 138%" | below | The policy says income "may not exceed 138%", so up to and including 138%. The meter on the same screen says "up to 138%". |

## Checked OK

| Claim | Where | Value shown | True value | Source |
|---|---|---|---|---|
| Hospitals checked | README, DEVPOST, DEMO, /audit hero | 463 of 470 | 463 / 470 | `findings.json` `hospitalsChecked` / `hospitalsTotal`; live JSON is identical |
| Conflict hospitals | home, /audit, docs | 14 | 14 (worst verdict per hospital) | `findings.json`, same logic as `AuditApp.tsx:279` |
| Likely hospitals | home, /audit, docs | 47 | 47 | same |
| Ask hospitals | README, DEVPOST, DEMO | 192 | 192 | same |
| Conflict findings | DEMO | 21 | 21 | `findings.json` |
| Top rule 1 | /audit card | credit reporting 33 | 33 (6 conflict + 27 likely) | `AuditApp.tsx:293-306` logic on live JSON |
| Top rule 2 | /audit card | assets 21 | 21 (11 + 10) | same |
| Top rule 3 | /audit card | deadlines 14 | 14 (1 + 13) | same |
| Sentences reviewed | README, DEVPOST, DEMO | 997 | 997 | `packetsReviewed` |
| Policy documents | README, DEVPOST, DEMO | 2,333 | 2,333 downloaded with text (of 2,340 found) | `audit/corpus/summary.json`. These are document slots. Charity and discount slots often share one PDF, so unique files ≈ 1,451. |
| Scanned policies | DEVPOST "7 hospitals with scanned policies" | 7 | 470 − 463 = 7 | `findings.json` |
| Free care cutoffs | README, DEVPOST, DEMO | 159 of 470 | 159 | `hospitalIndex.json` non-null `freeCareMaxFplPct`. ZSFG is null there; the app gets its 138% from `snapshots/zsfg.json`. |
| 2026 poverty line | DEMO | $15,960 | $15,960 (+$5,680 per person) | HHS 2026 guidelines, Federal Register 2026-01-15; `reference.ts` |
| 400% for one person | README | $63,840 | 4 × 15,960 = 63,840 | |
| 138% for one person | README | about $22,000 | $22,025 | |
| Sample income | DEMO, README, home | 125% / 125.3% FPL | 20,000 / 15,960 = 125.3% | |
| ZSFG free care cutoff | README, DEMO, home | 138% | 138% | `snapshots/zsfg.json` and the HCAI policy quote "may not exceed 138% of the Federal poverty level" |
| Sample bill total | everywhere | $12,741 | $12,741 (8 lines sum exactly) | `sampleBill.json` |
| Lines read | README, DEVPOST, home | 8 of 8 | 8 lines | `sampleBill.json`; LOGBOOK 03:36 |
| Duplicate CBC | DEMO, README, home | $269 | 85025 on lines 5 and 6, $269 each; ZSFG list $269 | `sampleBill.json`, `zsfg.json` |
| Chest X-ray | DEMO, README, home | billed $482 vs list $402 | 71046 billed 482; ZSFG gross 402 | same |
| Total to question | DEMO, home ("You could save" counts up to it) | $349 | 269 + 80 = 349 | `Landing.tsx:297 useCountUp(349)` |
| "You likely owe $0" | home, README | $0 | counts down from 12,741 to 0 | `Landing.tsx:348`. The server HTML shows the start values ($0 saved, $12,741 owed) before the animation runs. |
| PIH Whittier quotes and dates | DEMO | p.4 / p.3, effective 2026-07-10 | matches | `findings.json` |
| CA AG alert | home stat link | "California Attorney General, 2022" | June 14, 2022 consumer alert; says hospitals "are failing to fulfill their obligations" and aren't giving charity care notices patients understand | oag.ca.gov link (works) |
| 43,000 patients | home stat link | "One California hospital agreed to contact about 43,000 former patients about refunds" | Santa Clara Valley Medical Center "plans to start notifying 43,000 former patients" under a settlement (Aug 14, 2023) | kffhealthnews.org link (works) |
| KFF 20 million | home stat link | 20 million | 20 million | healthsystemtracker.org link (works) |
| Codes per hospital | README, DEVPOST | 17 to 23 | ZSFG 17, CPMC 22, UCSF 23, Saint Francis 23 | `snapshots/*.json` |
| Price checks | README, DEVPOST | 4 SF hospitals | 4 snapshots | `reference.ts`. Saint Francis is `live: false`, so it uses the saved snapshot only. "Live" is a little loose for it. |
| Actor run time | README, DEVPOST | about 17 s | about 17 s | LOGBOOK 03:36 |
| Planted errors | README, DEVPOST | 24 of 24, 0 false alarms | 30 bills, 24 planted errors, 8 clean | `eval/out/*.truth.json`. Caveat: eval/README says the oracle run is "100% by design", because `generate.py` rejects any bill the rules can't catch and it scores `checks.py`, a copy of `checks.ts`. It shows the rules and answer key agree. It is not an accuracy score. The current wording ("with a perfect reading") is accurate. Don't present it as accuracy. |
| $647 duplicate | README QA | $647 | CPMC bill-001, 96374 twice at $647 | `eval/out/bill-001.truth.json` |
| Cost per read | README, DEVPOST | $0.04 (2,449 in, 1,422 out) | 2,449 × $4/M + 1,422 × $20/M = $0.038 | Opus 5.5 pricing $4 / $20 per MTok |
| Upload rate limit | DEVPOST | 60 per minute | 60 per 60 s, shared by all users (one global key) | `convex/cases.ts:53` |
| Stack versions | README | Next.js 16, React 19 | next 16.4.3, react 19.3.0 | `package.json` |

## Privacy page vs privacy.ts

The page text (`recount-ui/src/components/privacy/privacy.json`) matches `PRIVACY_FACTS` in `convex/lib/privacy.ts` point by point. The two copies of `privacy.ts` (recount and recount-ui) are identical. The page adds one true line, "The web app is hosted on Vercel", which `privacy.ts` (used by Lupa) doesn't have.

Code spot checks, all true:

| Claim | Code |
|---|---|
| Delete removes bill, photo, steps and chat | `cases.ts:208-216` deletes `steps`, `chatMessages`, the storage file and the case |
| Account delete removes profile, sessions, tokens and accounts, and optionally bills | `account.ts:6-34` |
| SSN-like and long numbers removed from chat before storage | `chat.ts:49 redact()`, applied at `chat.ts:91` |
| Actor gets only hospital name, website and codes | `agent.ts:118` body `{ hospitalUrl, hospitalName, codes }` |

One wording risk: "We don't sell or **share** your information" sits next to "sent to Anthropic's Claude API". These are processors, but a judge may notice. "We don't sell your information or share it with anyone except the services that run Recount" is safer.

The page isn't deployed yet (404), so this matters only once it ships.

## Follow-up (10/24 evening)

- **Fixed in README (de):** "up to 90 MB", "conflicts with state law", the lien ban scoped to patients who qualify, and a note that 24 of 24 tests the rules.
- **Fixed in DEVPOST (06):** "up to 90 MB" / "some over 90 MB". The privacy lines no longer cite a /privacy page.
- **Still a deploy gap**, rechecked live:
  - `/privacy` and `/account` both return 404.
  - The live home page still says "break state law". The "conflicts" wording exists only in recount-ui.
  - DEVPOST now opens with a "CHECK BEFORE SUBMITTING" note (from 1d) listing the account sentences to cut if accounts aren't live. README already says "No accounts", which matches the live site. If accounts ship, README lines 37, 248 and 320 must change.
- **Placeholder:** DEVPOST line 11 still has `[STORY: …]`. Fill it in or delete it before submitting.

## Live recheck after a1dda20 deploy

- `/privacy`, `/account` and `/audit` all return 200. "Sign in" now appears in the header.
- **Home page:** "14 conflict with state law" and "up to 138%" (twice). No "break" or "below 138%" left.
- **JS bundles (/audit + Spanish):** "conflicts with state law" plurals, "Conflicts with state law", and "no cumple(n) con la ley (estatal / de California)". No "break(s) the law" wording anywhere.
- **/privacy:** matches `privacy.ts`. The sell/share line now reads "We don't sell your information. We only share it with the services above that run the app." Small typo: there is no space before "We don't send" ("app.We").
- **Now stale:**
  - README lines 37 ("No account"), 248 ("Privacy without accounts") and 320 ("No accounts") contradict the live optional accounts.
  - DEVPOST's "CHECK BEFORE SUBMITTING" note is resolved. Keep the account sentences and delete the note.

## /how page and "who did what" (claims check round 2)

Checked 2026-10-24 against `main` at 67b1377 (`convex/agent.ts`, `convex/lib/model.ts`, `convex/lib/pipeline.ts`, `convex/lib/checks.ts`, `convex/lib/eligibility.ts`, `convex/lib/letterCheck.ts`, `convex/cases.ts`, `convex/chatAgent.ts`, `audit/review.py`, `audit/report.py`, `src/components/flow/*`). Prod model map came from the public `pipeline:map` query on zealous-grouse-384. Live `/how` returns 200 and its text matches `en.json`. No files other than this one were changed.

### WRONG

| Claim | Key | Truth | Source | Fix |
|---|---|---|---|---|
| "If the main model fails, a backup takes over." | `how.modelsLede` | Prod has **no backup** for any task. `pipeline:map` returns `fallback: null` for read, column, letters and chat. The code supports one (`MODEL_FALLBACK_*`, and per task since 67b1377), but none is set. The "Backup:" line on the page already hides itself, so only this sentence is wrong. | `model.ts choose()`; live `pipeline:map` | Drop the sentence, or show it only when `map.models[*].fallback` is set. Or: "If no model answers, letters use a fixed template." |
| "Every flag points to a line and a published number." | `how.s5.p` | True only for price flags (`ABOVE_LIST_PRICE` and `CASH_PRICE_GAP` cite the published charge). `DUPLICATE_LINE` points to two lines but no published number. `TOTAL_MISMATCH` and `NOT_ITEMIZED` have `lines: []` and cite only the bill. | `checks.ts:41,67,98,121,163` | "Every flag shows the lines and numbers it's based on. Price flags cite the hospital's published price." |
| "Household size, yearly income, and insurance. Nothing else." | `how.s7.p` | Insured patients must also enter medical costs paid in the last 12 months (`outOfPocket12mo`). The form won't submit without it. | `MainScreens.tsx:134,155,227`; `cases.ts:118` | "...and insurance. If you have insurance, also what you paid for medical care this past year." |

### Loose (true in spirit, worth tightening)

| Claim | Key | Note |
|---|---|---|
| "AI only reads your bill and drafts the letters." | `how.lede` | Lupa chat is also AI (`how.may4` says so on the same page). Suggest: "AI reads your bill, drafts the letters and answers questions in chat." |
| "An AI model. Its work is checked before you see it." | `how.legend.ai` | Chat replies stream straight to the patient with no check after them. The bill read and letters are checked. |
| "Every AI step has a check after it..." | `how.why3` | Same as above: chat has none. The second read compares only the charges column, not names or dates. |
| "used AI to review sentences once, offline" | `how.s6.p` | Offline is true, but it wasn't once. There was a first review, then verify and re-review passes (`verify_*`, `rereview_*`), and manual overrides (`override_spotcheck.jsonl`). Suggest "reviewed offline, not on your bill". The second sentence is **true**: `review.py:181 valid()` keeps a decision only if its quote is in the policy text (case- and spacing-insensitive), and `report.py:38` applies it to every file, overrides included. |
| "Each answer shows the rule and source it used." | `how.s8.p` | Every basis row has a rule. `source` is optional: hospital free care and discount rows use `fap?.url ?? undefined`, so a hospital with no policy URL shows no source. |
| "AI may never compute or change any amount" | `how.mayNot3` | Code computes every amount. But the letter model types amounts into the text. `inventedAmounts` **flags** an unmatched amount (`letters.flagged`); it doesn't block or remove it. It also checks only amounts written with "$". The claim describes the rule, and the flag enforces it. OK as written. |

### Checked OK

| Claim | Key | Code |
|---|---|---|
| A second, narrow read copies only the charges column | `how.s2.p` | `agent.ts readChargesColumn`, run in parallel with the full read |
| If the reads disagree, both numbers are shown and you tap one; you can fix any line | `how.s3.p` | `agent.ts:320-335` builds `amountChecks`; `FoundScreens.tsx AmountCheck` has two buttons that call `correctLine`. Fixes are allowed only before the household questions (`cases.ts correctLine`). |
| Code matches the hospital and fetches its price list; no AI | `how.s4.p` | `KNOWN_HOSPITALS` regex, `matchHospital`, the Apify Actor (no model calls in `actor/src`). Price lists exist for the 4 SF hospitals only. |
| A model never tells you that you qualify | `how.s8.p` | Eligibility is `eligibility.ts`. The letter prompt says "Never say the patient qualifies". The chat prompt says "Never say the patient qualifies beyond the app's computed result". Both are prompt rules. |
| Letters drafted from computed facts only; told not to add laws, amounts or names | `how.s9.p` | `LETTER_PROMPT`: "using ONLY the facts", "no invented law, amounts, dates or names" |
| If the model is unavailable, a fixed template is used | `how.s9.p` | `agent.ts draftLetters`: no model configured, an error, a refusal, or a missing letter all lead to `templateLetters()`. The step is then marked "rule". Note: this covers letters only. A real photo can't be read without a model (`agent.ts:356`). |
| Code fills in your name and address and checks nothing required is missing before you can approve | `how.s10.p` | `letterFill.ts fillLetter` puts the patient's details into the [brackets]. `cases.approve` with `requireFilled: true` (sent by `LetterScreens.tsx:201`) refuses any [placeholder] left, except signature lines. The name and address come from the patient (prefilled from the bill or their profile), and code only places them. |
| Recount never sends anything for you | `how.s11.p`, `how.mayNot1` | No email or mail send path in `convex/`. The patient copies, prints or emails the letter themselves. |
| AI may not decide eligibility, change findings or approve | `how.mayNot2,4,5` | Findings come from `checks.ts`. Approval is the `cases.approve` mutation, called only from a user tap. |
| The rules are open to read in our code | `how.why4` | GitHub repo VolodymyrLinuxovich/recount is **public**. The page has no link to it, so consider adding one. |
| Models in use: names and providers | `how.models*`, `who.*` | `pipeline:map` → Anthropic `claude-opus-5-5` for all 4 tasks. `who.backup` fires only on `fallbackUsed`, which can't happen on prod today. |
| "We couldn't match it to your bill or our checks" | `letters.flagged` | `letterCheck.ts inventedAmounts` compares each $ amount with every number in the facts (bill, findings, eligibility, household), to within a cent or the same whole dollars. |
