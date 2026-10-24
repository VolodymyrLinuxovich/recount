# How Recount works

A five-minute code tour. Links go straight to the lines. Backend line numbers are checked against `main` at `e999ff1` (merged into `ui` at `0df2f55`). Frontend files under `src/` are still being edited, so for those we name the function instead of the line.

## The flow

```mermaid
flowchart TD
  A[Patient takes a photo of the ER bill] --> B[Browser shrinks big photos<br/>src/components/prepareFile.ts]
  B --> C[Upload to Convex file storage<br/>cases.generateUploadUrl + cases.create]
  C --> D[Agent action readAndCheck<br/>convex/agent.ts]
  D --> D1[1. Claude reads the bill into ParsedBill]
  D1 --> D2[2. Apify Actor pulls the hospital's price file<br/>and assistance policy live, or a saved snapshot]
  D2 --> D3[3. Rules check every line<br/>convex/lib/checks.ts]
  D3 --> D4[4. Statewide audit findings for this hospital]
  D4 --> E[Patient answers 3 questions<br/>household size, income, insured?]
  E --> F[Rules decide eligibility<br/>convex/lib/eligibility.ts]
  F --> G[Letters: Claude drafts them,<br/>or a fixed template]
  G --> H[Patient edits and approves.<br/>Nothing is sent by Recount]
```

The browser subscribes to the case with a Convex query, so every step shows up live in the step log as the action writes it.

**Live today:** Claude reads real photos (the sample photo reads 8 of 8 lines, $12,741 total). Claude writes the letters. The published Apify Actor (ID `NXiKTRZKK6p6qCSXk`) fetches prices and policy live in about 17 seconds.

## Where Claude is used, and where it is not

| Step | Who does it | Why |
|---|---|---|
| Read the bill photo or PDF into fields | **Claude** ([agent.ts L36-54](../convex/agent.ts#L36-L54)) | Bills are messy photos. Output is forced into a schema ([bill.ts L15-32](../convex/lib/bill.ts#L15-L32)) and unclear fields are listed in `unreadable` |
| Find the price file and policy | Apify Actor, plain code ([actor/src/main.py](../actor/src/main.py)) | No model. It crawls and streams files |
| Flag bad charges | **Rules only** ([checks.ts L34-166](../convex/lib/checks.ts#L34-L166)) | Every flag must point at a bill line and a published number |
| Decide eligibility | **Rules only** ([eligibility.ts L50-153](../convex/lib/eligibility.ts#L50-L153)) | A model must never tell someone they qualify. Each answer lists the rule and source it used |
| Draft letters | **Claude**, with a fixed template as fallback ([agent.ts L234-296](../convex/agent.ts#L234-L296), [letters.ts](../convex/lib/letters.ts)) | Claude gets only the computed facts as JSON and is told not to add law, amounts or names |
| Review audit sentences | **Claude**, with a quote check ([audit/review.py](../audit/review.py), [audit/verify.py](../audit/verify.py)) | Regex finds candidates. Every conflict and likely flag was reviewed twice; "worth asking" flags were reviewed once. A verdict is dropped if its quote isn't in the policy text |
| Send anything | Nobody | The patient sends the letters. There is no send code |

The model id is set once at [agent.ts L19](../convex/agent.ts#L19).

## The pieces

### 1. Upload (frontend)
- `src/components/StartScreen.tsx`: the start page. `StartScreen` gets an upload URL, posts the file, and calls `cases.create` with the patient's language. The sample button fetches `/sample-bill.png` and creates a case with `sample: true`.
- `src/components/prepareFile.ts`: `prepareFile` checks the file type and redraws big or unusual photos (HEIC, huge phone photos) as a JPEG under 3.5 MB, below the model's 5 MB image limit.

### 2. Case records (Convex)
- [convex/schema.ts](../convex/schema.ts): three tables. `cases` holds everything about one bill, including `lang`. `steps` is the live log. `hospitals` caches live Actor results.
- [convex/cases.ts](../convex/cases.ts)
  - `generateUploadUrl` [L7-10](../convex/cases.ts#L7-L10) and `create` [L12-31](../convex/cases.ts#L12-L31). `create` schedules the agent action right away.
  - `get` [L33-45](../convex/cases.ts#L33-L45) returns the case, its steps and the photo URL.
  - `submitHousehold` [L47-64](../convex/cases.ts#L47-L64) runs `assess` (rules) inside a mutation, then schedules the letters.
  - `approve` [L66-83](../convex/cases.ts#L66-L83) checks the letter shape and size, only works on a ready or approved case, saves the patient's edited letters and marks the case approved. It sends nothing.

### 3. The agent action
[convex/agent.ts](../convex/agent.ts) `readAndCheck` [L142-219](../convex/agent.ts#L142-L219):
1. **Read** [L150-182](../convex/agent.ts#L150-L182). `readWithClaude` [L36-54](../convex/agent.ts#L36-L54) sends the image or PDF with `READ_PROMPT` [L21-26](../convex/agent.ts#L21-L26) and parses the reply against the Zod schema `ParsedBill`. If the model fails on the sample, it loads the sample's source data and says so in the step log.
2. **Hospital lookup** [L184-187](../convex/agent.ts#L184-L187) calls `lookupHospital` [L83-130](../convex/agent.ts#L83-L130) with the bill's own codes.
   - It matches the name on the bill against `KNOWN_HOSPITALS` ([reference.ts L19-24](../convex/lib/reference.ts#L19-L24)), with specific patterns per hospital.
   - If `APIFY_TOKEN` and `APIFY_ACTOR_ID` are set and the hospital is marked `live`, it runs the Actor over the Apify REST API (`run-sync-get-dataset-items`, L98-102). `fromActor` [L56-81](../convex/agent.ts#L56-L81) turns the Actor's item into our `HospitalRef`. If the Actor missed the free-care cutoff, the reviewed snapshot's policy facts are kept (L107-109).
   - A live failure is logged as its own warn step, `hospital-live` (L115), and the lookup falls back to the cached live result or a saved snapshot ([convex/lib/snapshots/](../convex/lib/snapshots)).
   - `warningsForBill` [L132-140](../convex/agent.ts#L132-L140) keeps only warnings about codes that are on this bill.
3. **Checks** [L189-201](../convex/agent.ts#L189-L201) call `checkBill`. The "Up to $X" total uses `potentialSavings`, which counts each line once.
4. **Policy findings** [L203-212](../convex/agent.ts#L203-L212) attach what the statewide audit found in this hospital's own policy (`policyFindingsFor`, [reference.ts L48-53](../convex/lib/reference.ts#L48-L53)).

### 4. Bill checks (rules)
[convex/lib/checks.ts](../convex/lib/checks.ts) `checkBill` [L34-166](../convex/lib/checks.ts#L34-L166):
- Summary bill, no lines to check [L38-52](../convex/lib/checks.ts#L38-L52).
- Duplicate line: same code, date and amount [L54-82](../convex/lib/checks.ts#L54-L82). Marked "check", since two doses can be real.
- Above the hospital's own list price, and cash price gap for self-pay patients [L84-140](../convex/lib/checks.ts#L84-L140). Each finding carries the published number and the price file URL.
- Lines don't add up to the printed total [L142-163](../convex/lib/checks.ts#L142-L163).
- `potentialSavings` [L168-183](../convex/lib/checks.ts#L168-L183): the most a patient could save, one amount per line.

Titles and details come in English or Spanish (`lang` argument, helper in [convex/lib/lang.ts](../convex/lib/lang.ts)).

### 5. Eligibility (rules)
[convex/lib/eligibility.ts](../convex/lib/eligibility.ts) `assess` [L50-153](../convex/lib/eligibility.ts#L50-L153):
- Income as a percent of the 2026 federal poverty line (`povertyLine` [L43-46](../convex/lib/eligibility.ts#L43-L46), table in [reference.ts L11-16](../convex/lib/reference.ts#L11-L16)).
- Insured patients qualify only with high medical costs, over 10% of income [L75-98](../convex/lib/eligibility.ts#L75-L98).
- Free care if at or under the hospital's own free-care cutoff [L100-116](../convex/lib/eligibility.ts#L100-L116). The snapshots carry each hospital's cutoff from its own policy: ZSFG 138% of the poverty line, UCSF, CPMC Van Ness and Saint Francis 400%.
- Discount payment up to at least 400% of the poverty line, the state floor [L118-142](../convex/lib/eligibility.ts#L118-L142).
- Otherwise "above the cutoff we found", and still worth asking [L144-152](../convex/lib/eligibility.ts#L144-L152).

Every result carries a `basis` list (rule, plain text, source link). The answer screen prints it under "Why".

### 6. Letters
- Claude path: `draftLetters` [agent.ts L242-296](../convex/agent.ts#L242-L296) with `LETTER_PROMPT` [L234-240](../convex/agent.ts#L234-L240). Input is only the facts JSON (bill, findings, policy findings, eligibility, household).
- Template path: `templateLetters` [letters.ts L172-179](../convex/lib/letters.ts#L172-L179). If the hospital's policy conflicts with state law, the assistance letter quotes it next to the law ([L91-93](../convex/lib/letters.ts#L91-L93), law lines in `LAW_LINE` [L31-56](../convex/lib/letters.ts#L31-L56)). The credit reporting line cites SB 1061 (2024).
- Letters to the hospital are always in English. When the case is in Spanish, each letter also carries a Spanish copy (`subjectPatient`, `bodyPatient`), shown read-only under "Lo que dice su carta".
- `src/components/Letters.tsx`: `Letters` lets the patient edit each letter, then approve. After approval it shows mailto links and the billing phone. Recount never sends.

### 7. The Apify Actor
[actor/](../actor) is a Python Apify Actor, "Hospital Price & Charity Care Finder", published on the Apify Store (ID `NXiKTRZKK6p6qCSXk`).
- `run` in [actor/src/main.py L50-196](../actor/src/main.py#L50-L196): reads `cms-hhs-pricetransparency.txt` and crawls the hospital site in parallel, picks the machine-readable price file, then streams it while it researches the assistance policy.
- `scan_url` in [actor/src/mrf.py L337](../actor/src/mrf.py#L337) streams CSV or JSON price files (some are over 90 MB) and keeps only the codes asked for. The app passes the codes printed on the bill.
- `research_fap` [main.py L199-303](../actor/src/main.py#L199-L303) finds the policy (also through the state HCAI registry, [actor/src/hcai.py](../actor/src/hcai.py)) and pulls free-care and discount cutoffs with `extract_thresholds` ([actor/src/fpl.py L120](../actor/src/fpl.py#L120)).
- It never invents a value. Anything not found is null plus a warning.

### 8. The statewide audit
Goal: check the financial-assistance and debt-collection policies of every California hospital against the 2025 rules.

1. **Crawl** [audit/crawl.py](../audit/crawl.py) walks HCAI's public Hospital Fair Pricing Policy Lookup. 470 hospitals, the latest document of each type, plus geocoding.
2. **Extract** [audit/extract.py](../audit/extract.py) pulls page text from each PDF. Scanned PDFs are marked `needs_ocr`. No OCR yet.
3. **Candidates** [audit/rules.py](../audit/rules.py): six rules (`RULES` [L52-164](../audit/rules.py#L52-L164)): no application deadlines, no asset tests, income proof limited to pay stubs and tax returns, no credit reporting, no liens on homes, no Medi-Cal-first. Each has the legal cite, the law's words, regex patterns, and "complies" patterns that skip plain statements of compliance (`Rule.match` [L39-47](../audit/rules.py#L39-L47)).
4. **Packets** `build_packets` in [audit/review.py L56-98](../audit/review.py#L56-L98): one packet per unique sentence and rule, with three sentences of context on each side. The same wording at many hospitals (system-wide policies) becomes one packet. 980 packets.
5. **First review** (`INSTRUCTIONS` [review.py L38-48](../audit/review.py#L38-L48)): Claude returns conflict, likely, ask or complies, plus the exact words it relied on. Every packet got this review.
6. **Second review** ([audit/verify.py](../audit/verify.py), `VERIFY` [L21-32](../audit/verify.py#L21-L32)): every conflict or likely flag goes to a second Claude review that argues the hospital's side and clears it if there is a fair compliant reading. "Worth asking" flags from the first review do not get this second review.
7. **Merge** `load_decisions` in [audit/report.py L28-42](../audit/report.py#L28-L42): a verdict is kept only if its quote is really in the policy text (`valid`, [review.py L112-117](../audit/review.py#L112-L117)). When the two reviews disagree, the milder verdict wins. We'd rather miss than accuse.
8. **Output** [public/audit/findings.json](../public/audit/findings.json) for the `/audit` page, [convex/lib/auditFindings.json](../convex/lib/auditFindings.json) for patient cases, and [audit/results/summary.md](../audit/results/summary.md).

Result: 463 of 470 hospitals had readable text. **15** hospitals have a plain conflict, **135** more are likely, **117** are worth asking about. These are counted separately on purpose. A "worth asking" count can include flags the second review softened from conflict or likely, and flags that had only the first review.

Frontend: `src/components/audit/AuditApp.tsx` (search and list), `CaMap.tsx` (map), `HospitalView.tsx` ("their policy says" next to "California law says", with page and effective date), data helpers in `src/components/audit/data.ts`.

### 9. Spanish, My bills, and larger type (frontend)
- `src/components/i18n/`: typed English and Spanish dictionaries (`strings.ts`), `I18nProvider` and a `LanguageToggle`. The language is sent with `cases.create`, and the backend writes step labels, findings and eligibility reasons in that language.
- `src/components/bills/`: "My bills". `myBills.ts` keeps case ids in this phone's local storage. No accounts.
- `src/app/globals.css`: a block at the end overrides the base styles for older readers. Larger type, stronger contrast, bigger tap targets.

## Real vs sample vs fallback

| Thing | Real | Sample or fallback | How the UI labels it (English strings; Spanish ones live in `src/components/i18n/strings.ts`) |
|---|---|---|---|
| Bill reading | Claude reads the uploaded file | Sample bill loads `convex/lib/sampleBill.json` when there's no key or the model fails. The sample PNG is rendered from the same file | Bill card: "read by Claude from your photo" or "sample bill source data". Sources: "Read by Claude ... Check names and amounts" or "Sample bill, loaded from its source data" |
| The sample patient | Fictional (Alex Rivera) | Charges are ZSFG's real published gross charges, with two planted problems (CBC twice, X-ray $482 vs $402) | "The sample bill" on the photo toggle |
| Hospital prices | Live Apify Actor run | Earlier live result cached in Convex, or a snapshot in `convex/lib/snapshots/` built from the hospitals' real price files by `pipeline/` | Step log: "Read X's price file and policy live", or "Using saved price data" with the detail "From an earlier live lookup" or "Extracted earlier from the hospital's published price file and assistance policy by our data pipeline". A failed live run shows its own warning. Sources: "Fetched live (date)" or "Saved lookup from (date), not fetched just now" |
| Letters | Claude draft | Fixed template | Letters header: "written by Claude" or "standard template" |
| Audit | `public/audit/findings.json`: real HCAI documents, real quotes with page numbers | `public/audit/findings.sample.json` (71 hospitals, made up for layout work) loads only if the real file is missing | A sample banner shows when the sample file is used (`AuditApp.tsx`). The headline scope follows the data, and confirmed and likely are counted apart |
| `/preview` | Not real | Hard-coded case for design work (`src/components/Preview.tsx`) | Preview page only |

## Data sources
- Prices: each hospital's CMS machine-readable standard-charges file. Six San Francisco hospitals in `pipeline/out/`, four wired into the app.
- Policies: HCAI Hospital Fair Pricing Policy Lookup (public, no login).
- Poverty line: 2026 HHS guidelines, Federal Register 2026-01-15.
- Law: Health and Safety Code 127400 to 127446 as amended by AB 1020 and AB 2297, plus SB 1061 (2024) on credit reporting. Hand-curated in `pipeline/scripts/curated/ca_law.json`, see the caveats in [pipeline/DATA.md](../pipeline/DATA.md).

## Limits we know about
Open ones are tracked on GitHub (see [LOGBOOK.md](LOGBOOK.md#open-issues)).
- Only four San Francisco hospitals are wired up for the bill check. Other hospitals get eligibility, letters and the audit, but no price check. Saint Francis is not run live yet; it uses its snapshot.
- The discount answer gives no dollar estimate. The legal cap is tied to Medicare or Medi-Cal rates, and price files don't publish Medicare fee-for-service rates.
- Cases have no sign-in. Anyone with the link can open one (#6). Anyone can request an upload URL. "My bills" lives on the phone only (#9).
- After Approve, letters can't be edited again (#7).
- The language is fixed when the case is created. Switching the toggle later changes the screens but not text the backend already wrote.
- Audit: 7 hospitals couldn't be read (#10). "Worth asking" flags were reviewed once. Policies on file can be old (some from 2022), and the audit judges the latest one HCAI has.
- ER doctor bills are separate from the hospital bill and follow different rules (HSC 127450 and up). Recount only handles the hospital bill.
- Not legal advice. Statute quotes come from FindLaw and HCAI because leginfo blocks automated fetches.

## Run it
```sh
npm install
npx convex dev          # needs ANTHROPIC_API_KEY set with `npx convex env set` for real photos
npm run dev             # http://localhost:3000
npx vitest run          # rule tests in tests/rules.test.ts
```
Optional: `APIFY_TOKEN` and `APIFY_ACTOR_ID` in Convex env for live lookups.
