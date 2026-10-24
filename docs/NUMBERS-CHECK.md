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
