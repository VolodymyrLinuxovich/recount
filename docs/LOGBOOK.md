# Recount logbook

Cal Hacks 13. Submission deadline **Sun Oct 25 2026, 9:00 AM PDT**.
Tracks: Microsoft "Built for the Real World", Anthropic "Claude for Public Benefit", Cal Hacks People-First, Best Solo Hack, plus the Apify and Convex prizes.

> **How to add an entry.** Put the newest entry at the top of the Timeline, under today's date. One line each, in this form:
> `- HH:MM **who** what changed, and why. (commit hash, issue #)`
> If a decision changed, edit its line under Decisions rather than adding a second one. When an issue is closed, mark it done in Open issues with the closing commit.
> `git log --format='%h %ad %s' --date=format:'%m-%d %H:%M'` gives the hashes and times.

## Plan to the deadline (Sun Oct 25, 9:00 AM PDT)

Goal: a product a real California patient can use on their own phone, not a demo. Quality bar: an older person or a Spanish speaker can go from photo to approved letter alone, without getting stuck.

| Phase | When | What | Who | Status (Sat 21:50) |
|---|---|---|---|---|
| 1. Real | now → Sat 12:00 | Live public URL with real Claude + Apify. Any of the 470 CA hospitals (match bill → HCAI record, its own free-care cutoff, its audit findings; "Is this your hospital?" confirm). Delete a bill + per-case secret. Fix QA round 2 (real photos). | deploy chat; main (backend); UI session; QA chat | **Done.** Live on prod with Claude, Apify and statewide matching. Price checks now reach 240 of 470 hospitals (`5587e59`) |
| 2. Complete | Sat 12:00 → 20:00 | Print/mail-ready letters + how-to-send guide + install to home screen. Edit after approve (#7). Cold tests with real people (older, Spanish) and fix what confuses them. Failure states when Claude/Apify are slow or down. | UI helpers; main; Vova | **Mostly done.** Letters, send guide, follow-up and complaint are live. Failure states are handled: timeouts, a watchdog and Try again (`83a824e`, `2f7ef78`). Cold tests with real people are not recorded here |
| 3. Freeze | Sat 20:00 → Sun 06:00 | Feature freeze at 20:00, bug fixes only. Final QA both languages on the live URL. README, logbook, code guide. Record a 2-min video of a real person using it. Devpost text. | everyone; Vova records | **In progress, freeze slipped.** Chat attachments, 6-page bills and typed insurance amounts landed after 20:00 (`c5504d6`, `3abd8a6`, `58240f0`). Since 21:10 only review fixes. Devpost, pitch, demo script and README are updated (`354b05b`, `d65bebe`, `330f32d`). Video not recorded yet. `docs/HOW-IT-WORKS.md` was last updated at 05:32 |
| 4. Submit | by Sun 07:00 | Submit with 2 h buffer. No code changes after. | Vova | Not started |

Earlier this said accounts, insurance appeals and wider price checks would wait until after the deadline. All three shipped on Saturday: optional accounts (`d5ee092`), insured patients with an appeal letter (`ca43d02`), and price checks for 240 hospitals (`5587e59`).

## Now

As of Sat Oct 24, about 21:50. `origin/main` is at `f8ed6f6`.

**Live:** prod Convex `zealous-grouse-384` and https://recount-nu.vercel.app run `main` at `f8ed6f6`. Claude reads the bill and writes the letters. The Apify Actor (0.2, ID `NXiKTRZKK6p6qCSXk`) supplies prices and policies. Bills can have up to 6 photo pages. Optional accounts with email or Google sign-in. Follow-up after sending: check-in day, outcome and a complaint to HCAI.

**Azure on prod:**
- Content Safety screens the Lupa chat.
- AI Search index `recount-policies-v2` (997 docs, int8 compressed) lets Lupa quote hospital policies.
- gpt-4.1-mini is the fallback for chat, letters and complaints. Claude goes first.
- Document Intelligence (layout model) gives the second read of the charges column. Claude's column read is its backup.

**Insured patients:** the patient adds an insurance statement (EOB), by photo or by typing the amounts. The bill is checked against it with the same total rules, and an appeal letter can be drafted. The sample statement was removed from the UI (`58240f0`).

**Dashboard:** `/dashboard` shows live agent metrics, Azure services in their own rows, a timing chart and screencasts. A read-only MCP server runs at `/api/mcp`.

**Notifications:** live in the backend and on the web. The patient is notified when a bill check finishes (`dcec1e6`). Android build `e6725966` with `expo-notifications` is in the EAS queue. Android remote push is not set up, because the FCM `google-services.json` is missing. iOS needs its own build.

**Lupa, Claude vs Azure:** the same chat helper with the live prompt, run on both models (`eval/agents/out/score.md`). Claude passed 47 of 47 rule checks. gpt-4.1-mini passed 42 of 48 and was faster (2.5 s vs 4.6 s).

**Review fixes:** a code review of the day's work led to `82db412`, `32ee209`, `83a824e`, `75755f4` and `f8ed6f6`. They add rate limits, EOB money fixes, the stuck-run watchdog, chat attachment checks and safer storage deletes.

**Checks:** `node scripts/preflight.mjs` passes 17 of 17 on prod. The first run failed the insured findings once, a timing race in the script.

| Area | Where | State |
|---|---|---|
| Web and backend | `~/Code/recount`, `main` | Live at `f8ed6f6`. Bug fixes only |
| Mobile | `mobile/` (Expo) | Lupa chat and accounts live as OTA updates. Android build `e6725966` queued |
| Deploy | prod `zealous-grouse-384`, staging `avid-lion-854`, Vercel | Prod deploys are run by Vova |
| Docs | `docs/`, `DEVPOST.md`, `PITCH.md`, `DEMO.md` | Updated for the live app |

## Decisions

- **Rules decide eligibility, never the model.** A wrong "you qualify" can cost a patient money. Plain code in `convex/lib/eligibility.ts` decides, and every answer shows the rule and source it used. Free-care cutoffs come from a hospital's own policy only where the quoted sentence shows that exact free tier, 159 of 470 (`7a92cb0`).
- **Bill checks are rules too.** Each flag must point at a bill line and a number the hospital published itself, so the patient can show it to billing. Hand-checked snapshot prices win over live rows, so a different variant of a code can't make a false flag (`a9090cd`).
- **Two reads of the charges.** The amounts are read a second time, by Azure Document Intelligence when it is set and by a separate Claude column read otherwise. When the two reads disagree, the patient is asked which amount is on the bill (`3134eaa`, `d617468`, `bd01b40`).
- **Nothing is sent automatically.** The patient reads, edits and approves the letters, then sends them. There is no send code at all. Approve needs every blank filled in, except signature lines, which are signed by hand.
- **Every dollar in a letter comes from the bill or our checks.** A rule check compares the amounts in each drafted letter and complaint. If one doesn't match, the template is used instead (`a8383df`, `bad2f17`).
- **One model layer.** Every AI call goes through `lib/model.ts`. Claude is the default, with gpt-4.1-mini on Azure as the fallback, and each call is logged per bill in "Who did what" (`029506e`, `96f6ad9`).
- **Honest source labels.** Every number says where it came from: read by Claude, sample data, live lookup or pipeline snapshot, Claude draft or template. When we have no price file for a hospital, the app says so.
- **Audit headline counts confirmed and likely separately.** 14 hospitals with a plain conflict is the claim we stand behind. 47 likely and 192 worth asking are shown apart, never added into one scary number.
- **Two reviews for every accusation, milder verdict wins.** A flag must quote the policy's own words. Every conflict and likely flag was reviewed twice, and the second review argues the hospital's side. "Worth asking" flags were reviewed once, and are shown as questions, not violations. We'd rather miss a problem than accuse a hospital wrongly.
- **Scope follows the data.** The audit headline says "statewide", "San Francisco" or a count, based on what the loaded file covers (`33ad925`).
- **Accounts are optional.** A bill still works with only its random secret on the phone. Signing in (email and password, or Google) lets My bills follow the person to other devices. A Google sign-in never merges into a password account with the same email. Bills are kept until the patient deletes them, and deleting the account removes them (`d5ee092`, `6dc53e0`).
- **No native Swift or Kotlin.** The Expo app in `mobile/` covers iPhone and Android from one codebase, on the same backend as the web.
- **Keep Lupa, the mascot.** The design research favored a faceless icon. The founder chose to keep the mascot, kept calm and making no promises. The helper's prompt forbids claiming eligibility or saying anything was sent. Off-topic questions get a fixed refusal from a topic check (`c5504d6`).
- **Letters to the hospital stay in English.** Billing offices read English. Everything the patient reads can be Spanish, and a Spanish case gets a read-only Spanish copy of each letter, "Lo que dice su carta".
- **One step per screen.** Older readers do better with one question or one problem at a time, a big primary button, and a Back that works like the phone's Back (see `docs/DESIGN-RESEARCH.md`).
- **Live lookups only where verified.** Each known hospital has a `live` flag. Statewide matching needs a clear winner, or the patient picks, so a bill is never silently matched to the wrong hospital.
- **Test before prod.** After two rollbacks over the `FILL_IN` check, changes go to staging or a local backend first. `node scripts/preflight.mjs` checks the live app after each deploy.
- **Fallbacks keep the demo alive.** If the model or the Actor is down, the sample bill, saved snapshots and template letters still work, and the UI says so. A watchdog ends stuck runs, so a bill never stays reading forever (`83a824e`).

## Open issues

On GitHub, private repo `VolodymyrLinuxovich/recount`. Filed Oct 24 from a QA pass and from reading the code. Checked against GitHub at 21:50: no new issues since #14.

**Open**

| # | Title | Area |
|---|---|---|
| [#9](https://github.com/VolodymyrLinuxovich/recount/issues/9) | Accounts so My bills follows the person across devices | product. Built as optional accounts in `d5ee092`, but the issue is still open on GitHub |
| [#10](https://github.com/VolodymyrLinuxovich/recount/issues/10) | Audit could not read 7 hospitals | data. Still open; the README lists it as a known gap |

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

Times are PDT, from `git log` on `origin/main`. Merge commits are left out after 03:40. After 05:32 one line covers a group of related commits, and "who" is the area of the code.

### Sat Oct 24

- 21:50 **docs** Logbook brought up to date from 05:32.
- 21:44 **backend** A bill check keeps an insurance statement read that finished while it ran. The second read of a multi-photo bill takes only the table that continues onto the next page. Web chat uses the server's file limits. (`f8ed6f6`)
- 21:15 **deploy** Review fixes live on prod Convex and Vercel. Preflight 17 of 17 on the rerun. (`75755f4`)
- 21:10 **backend** Review fixes: a chat attachment can't reuse a bill page, pages are checked by their stored type, a failed send deletes its upload, everyday words go to the topic check, push only for bills with a phone, one storage delete path. (`75755f4`)
- 20:59 **docs** README: new How it works GIF of the current app, feature line and Claude table updated. (`330f32d`)
- 20:55 **mobile** Android build `e6725966` with `expo-notifications` started on EAS. It waits in the free queue. (no commit)
- 20:47 **docs** Demo script for tonight's app: two-page upload, sample bill, Lupa with an attachment and the topic check, audit, phone apps. (`d65bebe`)
- 20:40 **deploy** `354b05b` live with chat attachments, 6-page bills, typed insurance amounts and notifications. Phone OTA update `12dadb34`. (`354b05b`)
- 20:36 **docs** Devpost and pitch match the live app: price checks for 240 of 470 hospitals, Azure roles, follow-up, EOB, dashboard, phone app, chat attachments. Placeholders and `/how` mentions dropped. (`551c1b8`, `354b05b`)
- 20:26 **UI** Insurance step: no sample statement. The patient types the amounts instead, checked by the same total rules (`setEobManual`). (`58240f0`)
- 20:25 **UI** The complaint screen ends with Back to my bills and Back to home. (`d1c381b`)
- 20:21 **backend** Bills of up to 6 photo pages, read as one bill, with Document Intelligence per page. Pages screen on web and phone. (`3abd8a6`)
- 20:17 **backend** Lupa: attach a photo or PDF to a chat message, deleted after 30 days. A topic check refuses off-topic questions. (`c5504d6`)
- 19:58 **eval** Lupa on Claude vs Azure gpt-4.1-mini, with the live prompt, rule checks and two judges. Claude 47 of 47 rule checks, gpt-4.1-mini 42 of 48. The lawsuit check no longer flags "can't say if you will win". (`75aa911`, `ef6778b`)
- 19:42 **backend** Notify the patient when a bill check finishes (push tokens, `convex/notify.ts`). (`dcec1e6`)
- 19:31 **UI** My bills empty state centred. Try again on an unreadable bill opens the camera in place. Get the app link lands at the section's top. (`6b31fa4`, `32595d6`, `2690c46`)
- 19:29 **backend** Review fixes merged into `main`. (`ceef5c8`)
- 19:26 **backend** Insurance statement money checks fixed, so savings never exceed the bill. (`32ee209`)
- 19:25 **backend** Bills can't stay stuck. A watchdog ends stuck runs, failures end in template letters or an error, Try again after 3 minutes, chat replies always finish. Each upload step has a 25 second limit. The fallback model takes over sooner. (`83a824e`, `2f7ef78`, `ec564ad`)
- 19:18 **backend** Rejected photos show in a red frame labeled Not a valid document, on web and Android. Per-bill limits on drafting, chat caps, account delete removes the insurance statement. Preflight script for the live app. (`82db412`, `93c7410`, `db23391`)
- 19:03 **UI** Audit headline centred with the three counts on one line. (`eab29a2`)
- 18:42 **UI** Get the app for Android and iPhone. Audit hero stacked, centred footer. Dashboard: Azure services in their own rows, Content Safety timed, MP4 screencasts. (`0182d4d`)
- 18:40 **deploy** Phone sign in and the Get the app section live, with EAS update `431d8b48`. (`5af57e0`)
- 17:58 **backend** Policy search index `recount-policies-v2`: int8 vector compression and no stored vector copy, 60 MB to 14 MB. Prod and staging point to it. (`897b483`)
- 17:49 **mobile** Android app: sign up and sign in like the website. Home page QR code and `/app` download link. (`5af57e0`)
- 17:48 **UI** Dashboard rework: animated hero, how-it-works rows with screencasts, one timing chart. (`9cf2fbd`)
- 17:40 **deploy** Insured patients and Document Intelligence live on prod. A real EOB read exactly, and the second read came from Azure. Dashboard and 240-hospital prices followed. (`868ccba`, `edaddaf`)
- 17:39 **docs** README logo and a results plot. Pitch with a source for every number. (`b8e05f2`, `b20c773`)
- 17:34 **eval** Rust price file audit of 6 SF hospitals, cash price vs gross and insurer rates, cross-checked in Python. (`b20c773`)
- 17:34 **mobile** Lupa chat on the phone with the same helper as the web. Ask button on every bill screen. (`69f8d7b`)
- 17:32 **docs** Devpost: CRS track dropped, Best Solo Hack added, first person. Azure and the reading results described as they run. (`f9a6e39`, `74fb546`, `4b47bb7`)
- 17:24 **UI** Dashboard: live agent metrics, what each part does, performance over time, a read-only MCP server, screencasts. Asked for by Microsoft engineers. (`09de43e`, `74d4d3f`)
- 16:37 **backend** Second read of the charges with Azure Document Intelligence (layout model). Claude's column read is its backup. 181 of 181 lines on the eval set. (`bd01b40`)
- 16:14 **UI** Lupa's replies type out a few words at a time. (`17ecee6`)
- 15:53 **backend** Insured patients: EOB contract (`docs/EOB.md`), read the statement and check the bill against it, appeal letter. The EOB form has fewer nullable fields so structured output accepts it. 14 of 14 eval statements read exactly on staging. (`2a15532`, `ca43d02`, `fb1edfd`)
- 15:42 **UI** The `/how` page was removed and now goes to the home page. The landing how-it-works section was removed, then restored. (`9b7f10e`, `63856f1`, `8da6cd9`)
- 14:52 **backend** Price checks for 236 more California hospitals from a statewide Actor run, 240 of 470 in all. 73 of 75 prices matched the hand-checked snapshots exactly. (`5587e59`)
- 13:10 **deploy** Follow-up after sending live on prod, checked in English through approve. (`bad2f17`)
- 13:09 **backend** Complaint drafting goes through the shared model layer, with the dollar amount check. (`bad2f17`)
- 13:00 **deploy** Azure live on prod: Content Safety, AI Search and the gpt-4.1-mini fallback. (`618c888`, `d93bd67`)
- 12:57 **backend** Timeouts use a plain timer. `AbortSignal.timeout` fired at once in Convex and failed every Azure call. (`d93bd67`, `25397fe`)
- 12:31 **backend** Actor 0.2: batch mode for many hospitals, a known price file URL, streamed crawl so large files can't exhaust memory. (`a705011`, `69b8186`)
- 12:18 **docs** Devpost, pitch and demo drafts. Audit re-review batch. Landing shows three key stats. (`618c888`, `84008f7`)
- 11:47 **backend** Privacy text follows which Azure services are on. Crisis reply for self-harm. Timeouts on every outside call. (`3dade05`, `cd8ee2e`)
- 11:39 **UI** Exact claims on `/how`, Spanish review round 3, no English flash for Spanish readers. (`c8b8da4`, `7bf4da9`)
- 11:35 **backend** Azure setup: deployment name default, per-task fallback, policy search for the helper, index builder, Azure reads in the eval. (`67b1377`, `e68ac6a`)
- 11:19 **backend** Letters: a rule check that every dollar amount comes from the bill or our checks, naming any it couldn't match. Optional Content Safety on the chat. (`a8383df`, `c0d70d8`)
- 11:16 **backend** One model layer for every AI call: Claude by default, Azure or OpenAI-compatible by env, with fallback and a per-bill log. Who did what on each bill. (`029506e`, `5abe4a9`, `96f6ad9`)
- 10:50 **UI** Sign in with Google when its keys are set, never merged into a password account. Profile menu and page, name and email from the account, birthday from a calendar. (`6dc53e0`, `20e1d87`, `1f3fa0c`, `9abe741`, `14ca209`)
- 09:43 **mobile** Ask which amount is on the bill when two reads disagree. Fix a crash opening a bill. Details step fills the letters. Delete from findings. Link to what happens next. (`d8e486d`, `9b0482b`, `6629ada`, `415aed1`, `5831060`)
- 09:42 **backend** Follow-up after sending: check-in day with a calendar file, outcome question, complaint to HCAI's Hospital Bill Complaint Program, in English and Spanish. (`22252f6`, `8fb0241`, `f458550`, `d542595`, `df8dcc7`, `cb8e7f4`)
- 09:32 **eval** Eval reader mirrors the app's two reads. README shows live reading scores. (`f0a8508`, `a64a621`)
- 09:26 **UI** Account as a round picture in the header. Plain error for oversized files, Spanish letter titles. (`8dcd0d0`, `1ad137b`, `15a264b`)
- 09:09 **backend** A separate read of the charges column checks the amounts. The patient is asked when the two reads disagree. (`3134eaa`, `d617468`)
- 09:09 **backend** Optional accounts with email and password (Convex Auth): claim bills, owner access, My bills from the server, profile, account deletion. Existing emails refused at sign-up. (`d5ee092`, `b70f9e4`, `83f7f1c`, `5fa7b45`)
- 09:00 **UI** QA fixes on the home and audit pages: confirmed conflicts first, no layout shift, readable high-contrast chips, cash table fits on phones. (`4f20257`, `30b9d99`, `89f3512`)
- 08:41 **backend** Re-read amounts when lines don't add up. Hospital mailing address in letters. Helper knows privacy facts and reply timing. Privacy page in plain words. (`5ed0abf`, `840afa7`, `742b19f`, `9e1fcd1`)
- 08:03 **UI** Translations in `en.json` and `es.json`, with a test that Spanish never misses a phrase. (`4558902`)
- 07:22 **UI** New look: white and deep purple, Plus Jakarta Sans and Lexend, new logo and Lupa avatar. New home page and audit page for laptop and phone. (`9fbcd62`, `e276781`, `6434371`, `3452f05`)
- 06:58 **mobile** New design to match the web. (`0619748`)
- 06:30 **UI** Accessibility: focus follows screen changes, Escape closes Lupa, the audit map is one Tab stop. (`ba22207`)
- 06:10 **UI** Persona fixes: insured savings wording, call from your phone on desktop, date of birth check, errors only after typing. (`218fe20`, `16a85c1`)
- 05:57 **backend** Lien rule stated as the law does, only for patients who qualify. Helper knows collections timing, immigration scope and hospital phone numbers. A waiting bill can be deleted. (`67bc378`, `1a6e8f1`, `f37f110`, `beaef74`)
- 05:51 **UI** One type scale and spacing scale, Atkinson Hyperlegible, one-row header. A photo picked from the intro is no longer lost. (`3b1c10b`, `04f4806`)
- 05:48 **backend** Free-care cutoffs only where the policy's own words show that exact tier, which fixes 400% table misreads. Audit decisions committed. Audit now 14 conflict, 47 likely, 192 worth asking. (`7a92cb0`, `db1069b`, `5516113`, `a227103`)
- 05:42 **backend** Chat bound to its case with token checks, redacts SSN and account numbers, never stuck pending. Policy effective dates shown. (`430909f`, `ddf483a`)
- 05:40 **docs** Lupa red-team and audit spot-check reports. Spanish review fixes. (`f7b2418`, `ce9efb9`, `89182d7`, `0ff9221`)
- 05:33 **UI** The screen always matches the step. (`bcb62bb`)
- 05:32 **docs** Logbook and code guide for the new version. (`4ec741e`)
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
