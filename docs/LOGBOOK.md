# Recount logbook

Cal Hacks 13. Submission deadline **Sun Oct 25 2026, 9:00 AM PDT**.
Tracks: Microsoft "Built for the Real World", Anthropic "Claude for Public Benefit", Cal Hacks People-First, plus the Apify and Convex prizes.

> **How to add an entry.** Put the newest entry at the top of the Timeline, under today's date. One line each, in this form:
> `- HH:MM **who** what changed, and why. (commit hash, issue #)`
> If a decision changed, edit its line under Decisions rather than adding a second one. When an issue is closed, mark it done in Open issues with the closing commit.
> `git log --format='%h %ad %s' --date=format:'%m-%d %H:%M'` gives the hashes and times.

## Plan to the deadline (Sun Oct 25, 9:00 AM PDT)

Goal: a product a real California patient can use on their own phone, not a demo. Quality bar: an older person or a Spanish speaker can go from photo to approved letter alone, without getting stuck.

| Phase | When | What | Who | Status (Sat 05:30) |
|---|---|---|---|---|
| 1. Real | now → Sat 12:00 | Live public URL with real Claude + Apify. Any of the 470 CA hospitals (match bill → HCAI record, its own free-care cutoff, its audit findings; "Is this your hospital?" confirm). Delete a bill + per-case secret. Fix QA round 2 (real photos). | deploy chat; main (backend); UI session; QA chat | **Mostly done.** Claude and Apify are live. Statewide matching with a confirm step (`c2172a8`), per-case secret and delete (`c2172a8`, `af1ca5d`), retake and out-of-state screens (`a9090cd`, `69ca54c`) are all in. Left: prod sits behind staging tests after two rollbacks, and QA round 2 is still running |
| 2. Complete | Sat 12:00 → 20:00 | Print/mail-ready letters + how-to-send guide + install to home screen. Edit after approve (#7). Cold tests with real people (older, Spanish) and fix what confuses them. Failure states when Claude/Apify are slow or down. | UI helpers; main; Vova | **Started early.** Print letters, send checklist, install hint and unapprove (#7) are done (`af1ca5d`, `6e1e076`). Display mode, Lupa and onboarding are also in (`fee03ab`). Faster flow with background lookups (`c6e2ac8`). Left: cold tests with real people, and checking failure states on prod |
| 3. Freeze | Sat 20:00 → Sun 06:00 | Feature freeze at 20:00, bug fixes only. Final QA both languages on the live URL. README, logbook, code guide. Record a 2-min video of a real person using it. Devpost text. | everyone; Vova records | Not started. README is with the deploy session (`151b891`). Logbook and code guide are kept current |
| 4. Submit | by Sun 07:00 | Submit with 2 h buffer. No code changes after. | Vova | Not started |

Not before the deadline: accounts (My bills stays per phone), insurance appeals, price checks beyond hospitals where the lookup works (labeled honestly).

## Now

As of Sat Oct 24, about 05:30. `ui` is at `74cd5f0`. `origin/main` is at `494f50e`. Each has commits the other doesn't yet: `ui` has the new flow (`fee03ab`) and `74cd5f0`; `main` has the faster lookups (`c6e2ac8`), admin cleanup (`e38aea4`), README and logo.

**Live now:** Claude reads real photos (the sample photo reads 8 of 8 lines, $12,741). Claude writes the letters, one call per letter in parallel. The published Apify Actor (ID `NXiKTRZKK6p6qCSXk`) fetches prices and policy live. For the SF hospitals the app answers from checked saved data at once and refreshes live in the background.

**How we deploy:** `ui` is pushed to `main`. The deploy session then tests on staging before prod. This rule came after two rollbacks over the `FILL_IN` approve check.

| Who | Where | On it |
|---|---|---|
| Main session | `~/Code/recount`, branch `main` | Backend, pipeline, the mobile app (`mobile/`) |
| UI session | `~/Code/recount-ui`, branch `ui` | The step-by-step flow, Display mode, Lupa, onboarding |
| Deploy session | | Convex cloud and Vercel, staging then prod. Owns `README.md` |
| QA chat (-7e) | | QA round 2 with real photos |
| Scribe | `docs/` | This logbook, `HOW-IT-WORKS.md`, GitHub issues |

Drafts by another chat, not committed: `DEVPOST.md` and `DEMO.md` in the main checkout. Note for whoever finishes them: `DEMO.md` still says "7 San Francisco hospitals so far" and quotes ZSFG's "verifiable source of income" line. The statewide audit now covers 470 hospitals, and the second review cleared that ZSFG line. ZSFG now shows one "ask" (liens).

## Decisions

- **Rules decide eligibility, never the model.** A wrong "you qualify" can cost a patient money. Plain code in `convex/lib/eligibility.ts` decides, and every answer shows the rule and source it used. Claude helps only with input data: it filled 70 hospital cutoffs the rule extractor missed, each kept only with a word-for-word quote that contains the number (`fece012`).
- **Bill checks are rules too.** Each flag must point at a bill line and a number the hospital published itself, so the patient can show it to billing. Hand-checked snapshot prices win over live rows, so a different variant of a code can't make a false flag (`a9090cd`).
- **Nothing is sent automatically.** The patient reads, edits and approves the letters, then sends them. There is no send code at all. Approve needs every blank filled in, except signature lines, which are signed by hand.
- **Honest source labels.** Every number says where it came from: read by Claude, sample data, live lookup or pipeline snapshot, Claude draft or template. When we have no price file for a hospital, the app says so.
- **Audit headline counts confirmed and likely separately.** 15 plain conflicts is the claim we stand behind. 135 likely and 117 worth asking are shown apart, never added into one scary number.
- **Two reviews for every accusation, milder verdict wins.** A flag must quote the policy's own words. Every conflict and likely flag was reviewed twice, and the second review argues the hospital's side. "Worth asking" flags were reviewed once, and are shown as questions, not violations. We'd rather miss a problem than accuse a hospital wrongly.
- **Scope follows the data.** The audit headline says "statewide", "San Francisco" or a count, based on what the loaded file covers (`33ad925`).
- **No login before the deadline, privacy by design.** No accounts means no stored identities, emails or passwords. Each case has a random secret kept on the phone, and the patient can delete a bill with its photo. "My bills" and the details profile stay on the phone (#9).
- **No native Swift or Kotlin.** The Expo app in `mobile/` covers iPhone and Android from one codebase, on the same backend as the web.
- **Keep Lupa, the mascot.** The design research favored a faceless icon. The founder chose to keep the mascot, kept calm and making no promises. The helper's prompt forbids claiming eligibility or saying anything was sent.
- **Letters to the hospital stay in English.** Billing offices read English. Everything the patient reads can be Spanish, and a Spanish case gets a read-only Spanish copy of each letter, "Lo que dice su carta".
- **One step per screen.** Older readers do better with one question or one problem at a time, a big primary button, and a Back that works like the phone's Back (see `docs/DESIGN-RESEARCH.md`).
- **Live lookups only where verified.** Each known hospital has a `live` flag. Statewide matching needs a clear winner, or the patient picks, so a bill is never silently matched to the wrong hospital.
- **Test on staging before prod.** After two rollbacks over the `FILL_IN` check, every `main` push goes to staging first.
- **Fallbacks keep the demo alive.** If the model or the Actor is down, the sample bill, saved snapshots and template letters still work, and the UI says so.

## Open issues

On GitHub, private repo `VolodymyrLinuxovich/recount`. Filed Oct 24 from a QA pass and from reading the code.

**Open**

| # | Title | Area |
|---|---|---|
| [#9](https://github.com/VolodymyrLinuxovich/recount/issues/9) | Accounts so My bills follows the person across devices | product. Not before the deadline, by decision |
| [#10](https://github.com/VolodymyrLinuxovich/recount/issues/10) | Audit could not read 7 hospitals | data |

**Closed** (Oct 24)

| # | Title | Fixed in |
|---|---|---|
| [#1](https://github.com/VolodymyrLinuxovich/recount/issues/1) | Real uploads fail locally because Convex has no ANTHROPIC_API_KEY | key set on Convex; Claude reads live |
| [#2](https://github.com/VolodymyrLinuxovich/recount/issues/2) | Sample bill image does not match the sample bill data | `109104d` (PNG rendered from `sampleBill.json`) |
| [#3](https://github.com/VolodymyrLinuxovich/recount/issues/3) | Sources warns about missing codes that are not on the bill | `109104d` (`warningsForBill`) |
| [#4](https://github.com/VolodymyrLinuxovich/recount/issues/4) | Step log savings total counts the same line twice | `109104d` (`potentialSavings`) |
| [#5](https://github.com/VolodymyrLinuxovich/recount/issues/5) | Template letter says "My household has 1 people" | `109104d` |
| [#6](https://github.com/VolodymyrLinuxovich/recount/issues/6) | Case pages are readable by anyone with the link | `c2172a8` (per-case secret token, upload limits) |
| [#7](https://github.com/VolodymyrLinuxovich/recount/issues/7) | Approved letters can't be edited and there is no undo | `c2172a8`, `af1ca5d` (`unapprove`) |
| [#8](https://github.com/VolodymyrLinuxovich/recount/issues/8) | Spanish text from the backend and a Spanish copy of the letters | `109104d`, `52bd035` |
| [#11](https://github.com/VolodymyrLinuxovich/recount/issues/11) | Snapshots lose the hospital's free care cutoff and policy link | `e999ff1` (ZSFG 138%, others 400%) |
| [#12](https://github.com/VolodymyrLinuxovich/recount/issues/12) | Live Apify result has no name field, labels show undefined | `e999ff1` (`fromActor`, bill codes passed in) |
| [#13](https://github.com/VolodymyrLinuxovich/recount/issues/13) | Saved lookup label says Apify run but snapshots come from the pipeline | `e999ff1` |
| [#14](https://github.com/VolodymyrLinuxovich/recount/issues/14) | Hospital name matching is too broad (Sutter, St. Francis) | `e999ff1`, then statewide matching in `c2172a8` |

Fixed in the QA pass before filing (`aa928ae` and later UI commits): plain error screen, big photo resize, file type checks, "28k" read as $28,000, form hints, policy box wording, sample photo label.

## Timeline

Times are PDT, from `git log` on `ui` and `origin/main`. Merges of `main` into `ui` are left out after 03:40.

### Sat Oct 24

- **QA chat (-7e)** running QA round 2 with real photos.
- **Deploy session** testing on staging before each prod deploy, after two rollbacks over the `FILL_IN` approve check.
- 05:30 **Scribe** updated both docs for the step-by-step flow, statewide matching, the chat and the mobile app. Backend line ranges checked against `494f50e`.
- 05:26 **Main** Logo: a paper bill with a red check, as web, iOS and Android icons. (`494f50e`)
- 05:25 **Deploy** README shows how it works as a phone recording (`docs/how-it-works.gif`). (`cd2c29f`)
- 05:23 **Main** Faster: SF hospitals answer from saved data and refresh live in the background, letters drafted in parallel, medium-effort reading. Mobile uploads resized photos natively. (`c6e2ac8`)
- 05:22 **UI** The start page resets after opening a bill. (`74cd5f0`)
- 05:19 **Deploy** README: what Recount does, architecture, audit results, path to production, how to run. (`151b891`)
- 05:12 **Main** Internal `adminRemove` deletes a case, its log, chat and file. (`e38aea4`)
- 05:09 **UI** New version of the flow. Back and the primary button side by side in `StepFrame`, slide transitions. Display mode for low vision (`src/components/a11y/`). Lupa, the helper mascot with chat (`src/components/helper/`). Before-you-start screens (`src/components/onboarding/`). (`fee03ab`)
- 05:05 **UI** Required details with a saved profile (`profile.ts`). Approve only when every blank is filled (`requireFilled`). A check mark when letters are ready, then the 4-step send checklist (`SendGuide.tsx`). (`6e1e076`)
- 05:02 **Main** Mobile: Android APK build profile. (`be85572`)
- 05:02 **UI** Retake and out-of-state screens. Price cards read list and cash prices from the evidence. (`69ca54c`)
- 05:00 **Main** No false price flags: hand-checked snapshot prices win over live rows. RETAKE and OUT_OF_STATE states. Plain-language unreadable notes. One finding per overpriced line. Likely vs confirmed policy counts. Opt-in approve check. (`a9090cd`)
- 04:59 **UI** Retake screen, "Change my answers", friendlier page for bad links, tighter map taps. (`af1b19d`)
- 04:56 **Main** Patient-facing errors are `ConvexError`, so production shows the real message. Corrections clear stale notes. Patient's city breaks ties between hospital matches. (`ef8a7e0`)
- 04:56 **UI** Unreadable bills can be deleted. Step labels match each screen. (`349af13`)
- 04:52 **Main** Mobile: publish with EAS Update. (`54c6659`)
- 04:50 **UI** `docs/DESIGN-RESEARCH.md`: design research for older, low-vision and Spanish-speaking patients. (`1758e52`)
- 04:48 **UI** Clean look for My bills, "More about this bill", the audit page and the policy note. Old pen components removed. (`089816b`)
- 04:46 **Main** Approve check: signature lines never block approval. (`00c1217`) Mobile shows the fill-in message plainly. (`384df07`)
- 04:46 **Main** Helper chat: streamed replies with case context, an injection-safe safety prompt, per-conversation limits (`convex/chat.ts`, `convex/chatAgent.ts`). Patient address read from the bill. Approve can require filled-in blanks. (`94a066f`)
- 04:42 **Main** Expo mobile app in `mobile/`: camera upload, step-by-step case flow, letters with share and copy, My bills on the phone, English and Spanish. (`99514a0`)
- 04:31 **UI** One letter per screen with details, approve and the send guide. The answer no longer loops back to findings. Screens move on by themselves only from waiting screens. (`9d25988`)
- 04:22 **Main** Actor output schema for the Apify Store. (`52cd4a9`)
- 04:08 **UI** Clean finding cards, one problem per screen. Calmer landing page. (`b2e4dcd`)
- 04:07 **UI** Solid pinned bottom bar. (`38af824`)
- 04:06 **UI** Step-by-step bill flow begins (`src/components/flow/`, step in the link hash `#t=&s=`). Fill-in details for letters, Spanish letters first, honest no-price-list text, My bills copy link, audit search and sorting. (`123eff4`)
- 03:58 **Main** Rejects non-bills (NOT_A_BILL). The total check is safe against misreads. `correctLine` lets the patient fix a misread amount. (`3ef7f99`)
- 03:58 **UI** Audit map: a tap on a crowded spot lists the hospitals there. (`f674d24`)
- 03:56 **Main** Step log counts conflicts vs worth asking. Formatted money. Family medical costs. Letters never claim eligibility. (`3e9456d`)
- 03:54 **UI** Private bill links with a token, delete a bill, pick the hospital, change letters after approving, print-ready letters, send guide, install to home screen, grouped findings. (`af1ca5d`)
- 03:51 **Main** Claude fills income cutoffs the rule extractor missed, kept only with a word-for-word quote that contains the number. "Full or partial" wording never becomes free care. (`fece012`)
- 03:46 **UI** "Step 1 of 4" progress on each bill. (`0618d22`)
- 03:45 **Main** Any of 470 California hospitals: statewide hospital index with free-care cutoffs (441 of 470), matching with a confirm step. Per-case secret token, delete, unapprove, upload limits. (`c2172a8`)
- 03:44 **Lead** Plan to the deadline added to this logbook. (`d95c67d`)
- 03:42 **UI** Spanish for My bills and audit rule titles. (`18169f3`)
- 03:41 **Scribe** Logbook and code guide pass two committed. (`7b059aa`)
- 03:39 **UI** Smaller audit headline on wide screens. (`cab223b`)
- 03:37 **UI** Merged `main` into `ui`. (`0df2f55`)
- 03:37 **UI** Full Spanish and English UI with a toggle (typed dictionaries in `src/components/i18n/`). Letters stay English with a read-only Spanish copy, "Lo que dice su carta". "My bills" saved on this phone (`src/components/bills/`). Larger, higher-contrast design for older readers (overrides at the end of `src/app/globals.css`). Logbook and code guide added. (`52bd035`)
- 03:36 **Main** Each hospital's own free-care cutoff now reaches eligibility: ZSFG 138%, the others 400% (#11). Live Apify lookups over REST with the bill's codes, and the result is normalized by `fromActor` (#12). Honest labels: live is "Read X's price file and policy live", a snapshot is "Extracted earlier from the hospital's published price file and assistance policy by our data pipeline", and a live failure is its own warn step, `hospital-live` (#13). Specific hospital matching (#14). `cases.approve` checks letter shape and size and only works on ready or approved cases (#6, partly). Credit reporting lines cite SB 1061 (2024) with no code section. (`e999ff1`)
- by 03:36 **Main** `ANTHROPIC_API_KEY` set on Convex. Claude reads real photos: the sample photo reads 8 of 8 lines, $12,741. Claude writes the letters. The Actor runs live in about 17 s (#1).
- 03:32 **Main** Shortened the Actor description for the Apify Store. The Actor is published, ID `NXiKTRZKK6p6qCSXk`. (`5038f8d`)
- 03:28 **Scribe** wrote `docs/LOGBOOK.md` and `docs/HOW-IT-WORKS.md`, and filed issues #1 to #14.
- 03:26 **Main** Spanish for everything the patient reads from the backend (#8). Sample photo rendered from `sampleBill.json` (#2). Savings count each line once (#4). Price warnings only for codes on the bill (#3). "1 person" in the template letter (#5). (`109104d`)
- 03:21 **UI** Header and language provider slots, ready for the language toggle. (`3588f83`)
- 03:21 **UI** QA fixes: plain error screen, resize big photos, check file types, read "28k" as 28,000, form hints. (`aa928ae`)
- 03:20 **UI** Audit page on statewide data: readable names, unread hospitals listed, shorter quote context, larger conflict dots. (`3874a9b`)
- 03:17 **Main** Statewide audit: 470 hospitals, 980 candidate sentences, each given a first review; every conflict and likely flag was reviewed twice, "worth asking" flags once. 15 hospitals with plain conflicts. (`faf9bbb`; the commit message says "reviewed twice")
- 03:16 **Main** Pipeline: real names, city, county and coordinates for the SF hospitals. (`df2c857`)
- 03:13 **Main** Merged `ui`. (`5a8d0cc`)
- 03:13 **UI** Audit headline scope follows the data: statewide, San Francisco, or a count. (`33ad925`)
- 03:12 **Main** Merged `ui`. (`bbc3bed`)
- 03:12 **Main** Statewide HCAI policy crawler and text extraction (`audit/crawl.py`, `audit/extract.py`). This moved the audit from 7 SF hospitals to all 470. (`ea815ba`)
- 03:12 **UI** Audit page: SF wording, confirmed and likely counted apart, map hidden when there are no coordinates. (`fb62e95`)
- 03:07 **UI** Case flow shows the hospital's own policy conflicts and links to the audit. (`6e5d16c`)
- 03:05 **Main** Merged `ui`. (`29890ef`)
- 03:05 **Main** Each case flags its hospital's own policy conflicts and the letters cite them. (`f305209`)
- 03:04 **Main** Unclear policy wording counted separately in the hospital summary. (`82fd605`)
- 03:04 **UI** Statewide audit page: hospital policy map, search, "their policy says" next to "California law says". (`14c71ea`)
- 03:02 **Main** Apify Actor (hospital price file and assistance policy finder) and the data pipeline. (`a7d0d74`)
- 03:01 **Main** Merged `ui` and `eval`. (`651aa51`, `fd07bbf`)
- 03:01 **Main** Hospital price snapshots, sample bill with real ZSFG charges, policy audit rules. (`32bfee1`)
- 02:55 **UI** Phone-first UI: marked-up bill, household questions, answer with sources, editable letters. Paper and red pen design. (`73f5877`)
- 02:53 **Eval** Bill generator, renderer and scoring for the eval set (`eval/`). Synthetic SF bills with planted errors, to measure reading and checks. (`5bf00c7`)
- 02:43 **Main** Convex backend: bill reading with Claude, price checks, charity care eligibility by rules. (`ee7f2eb`)
- 02:38 Project created from Create Next App. (`5d65702`)
