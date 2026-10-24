# Recount logbook

Cal Hacks 13. Submission deadline **Sun Oct 25 2026, 9:00 AM PDT**.
Tracks: Microsoft "Built for the Real World", Anthropic "Claude for Public Benefit", Cal Hacks People-First, plus the Apify and Convex prizes.

> **How to add an entry.** Put the newest entry at the top of the Timeline, under today's date. One line each, in this form:
> `- HH:MM **who** what changed, and why. (commit hash, issue #)`
> If a decision changed, edit its line under Decisions rather than adding a second one. When an issue is closed, mark it done in Open issues with the closing commit.
> `git log --format='%h %ad %s' --date=format:'%m-%d %H:%M'` gives the hashes and times.

## Now

As of Sat Oct 24, about 03:40. `main` is at `e999ff1` (pushed). `ui` is at `0df2f55`, which merges `main`.

**Live now:** Claude reads real photos (the sample photo reads 8 of 8 lines, $12,741). Claude writes the letters. The published Apify Actor (ID `NXiKTRZKK6p6qCSXk`) fetches prices and policy live in about 17 seconds.

| Who | Where | On it |
|---|---|---|
| Main session | `~/Code/recount`, branch `main` | Backend, pipeline and deploy |
| UI session | `~/Code/recount-ui`, branch `ui` | Frontend polish after the Spanish, My bills and larger type commit (`52bd035`) |
| Helpers | branch `ui` | Spanish translation (`src/components/i18n/`) and "My bills" (`src/components/bills/`), both now committed |
| QA chat (-7e) | | Rerunning QA with real photos now that Claude reads live |
| Deploy chat | | Setting up Convex cloud and Vercel |
| Scribe | `docs/` | This logbook, `HOW-IT-WORKS.md`, GitHub issues |

Drafts by another chat, not committed: `DEVPOST.md` and `DEMO.md` in the main checkout. Note for whoever finishes them: `DEMO.md` still says "7 San Francisco hospitals so far" and quotes ZSFG's "verifiable source of income" line. The statewide audit now covers 470 hospitals, and the second review cleared that ZSFG line. ZSFG now shows one "ask" (liens).

## Decisions

- **Rules decide eligibility, never the model.** A wrong "you qualify" can cost a patient money. Plain code in `convex/lib/eligibility.ts` decides, and every answer shows the rule and source it used.
- **Bill checks are rules too.** Each flag must point at a bill line and a number the hospital published itself, so the patient can show it to billing.
- **Nothing is sent automatically.** The patient reads, edits and approves the letters, then sends them. There is no send code at all.
- **Honest source labels.** Every number says where it came from: read by Claude, sample data, live lookup or saved lookup, Claude draft or template. Judges and patients can tell real from fallback at a glance.
- **Audit headline counts confirmed and likely separately.** 15 plain conflicts is the claim we stand behind. 135 likely and 117 worth asking are shown apart, never added into one scary number.
- **Two reviews for every accusation, milder verdict wins.** A flag must quote the policy's own words. Every conflict and likely flag was reviewed twice, and the second review argues the hospital's side. "Worth asking" flags were reviewed once, and are presented as questions, not violations. We'd rather miss a problem than accuse a hospital wrongly.
- **Scope follows the data.** The audit headline says "statewide", "San Francisco" or a count, based on what the loaded file covers (`33ad925`).
- **No accounts yet, bills saved per phone.** Accounts take time and add a privacy burden. "My bills" keeps case ids in the phone's local storage for now (#9, #6).
- **Letters to the hospital stay in English.** Billing offices read English. Everything the patient reads can be Spanish, and a Spanish case gets a read-only Spanish copy of each letter, "Lo que dice su carta".
- **Live lookups only where verified.** Each known hospital has a `live` flag, and matching uses specific name patterns, so a bill is never checked against the wrong hospital's prices (#14).
- **Fallbacks keep the demo alive.** If the model or the Actor is down, the sample bill, saved snapshots and template letters still work, and the UI says so.

## Open issues

On GitHub, private repo `VolodymyrLinuxovich/recount`. Filed Oct 24 from a QA pass and from reading the code.

**Open**

| # | Title | Area |
|---|---|---|
| [#6](https://github.com/VolodymyrLinuxovich/recount/issues/6) | Case pages are readable by anyone with the link | backend, privacy. `cases.approve` is now validated; `cases.get` and `generateUploadUrl` are still open |
| [#7](https://github.com/VolodymyrLinuxovich/recount/issues/7) | Approved letters can't be edited and there is no undo | frontend |
| [#9](https://github.com/VolodymyrLinuxovich/recount/issues/9) | Accounts so My bills follows the person across devices | product |
| [#10](https://github.com/VolodymyrLinuxovich/recount/issues/10) | Audit could not read 7 hospitals | data |

**Closed** (Oct 24)

| # | Title | Fixed in |
|---|---|---|
| [#1](https://github.com/VolodymyrLinuxovich/recount/issues/1) | Real uploads fail locally because Convex has no ANTHROPIC_API_KEY | key set on Convex; Claude reads live |
| [#2](https://github.com/VolodymyrLinuxovich/recount/issues/2) | Sample bill image does not match the sample bill data | `109104d` (PNG rendered from `sampleBill.json`) |
| [#3](https://github.com/VolodymyrLinuxovich/recount/issues/3) | Sources warns about missing codes that are not on the bill | `109104d` (`warningsForBill`) |
| [#4](https://github.com/VolodymyrLinuxovich/recount/issues/4) | Step log savings total counts the same line twice | `109104d` (`potentialSavings`) |
| [#5](https://github.com/VolodymyrLinuxovich/recount/issues/5) | Template letter says "My household has 1 people" | `109104d` |
| [#8](https://github.com/VolodymyrLinuxovich/recount/issues/8) | Spanish text from the backend and a Spanish copy of the letters | `109104d`, `52bd035` |
| [#11](https://github.com/VolodymyrLinuxovich/recount/issues/11) | Snapshots lose the hospital's free care cutoff and policy link | `e999ff1` (ZSFG 138%, others 400%) |
| [#12](https://github.com/VolodymyrLinuxovich/recount/issues/12) | Live Apify result has no name field, labels show undefined | `e999ff1` (`fromActor`, bill codes passed in) |
| [#13](https://github.com/VolodymyrLinuxovich/recount/issues/13) | Saved lookup label says Apify run but snapshots come from the pipeline | `e999ff1` |
| [#14](https://github.com/VolodymyrLinuxovich/recount/issues/14) | Hospital name matching is too broad (Sutter, St. Francis) | `e999ff1` |

Fixed in the QA pass before filing (`aa928ae` and later UI commits): plain error screen, big photo resize, file type checks, "28k" read as $28,000, form hints, policy box wording, sample photo label.

## Timeline

Times are PDT, from `git log`. Commits up to `e999ff1` are on both branches.

### Sat Oct 24

- **QA chat (-7e)** rerunning QA with real photos now that Claude, the letters and the Actor all run live.
- **Deploy chat** setting up Convex cloud and Vercel.
- 03:40 **Scribe** updated both docs: line ranges checked against `e999ff1`, open issues table, audit review wording fixed ("worth asking" flags had one review).
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
