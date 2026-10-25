# Recount pitch (Cal Hacks 13.0)

Judging: Sun 10:30 AM to 12:30 PM at my table. 3 minutes of pitch, 2 minutes of questions.

**The one rule:** every number below has a source in the last table. Don't say a number that isn't here. If a judge asks something I didn't measure, say "I didn't measure that. Here's what I did measure," and give the closest number. I built Recount alone, so say "I", not "we".

**The one sentence judges should repeat to each other:** "He read every California hospital's charity care policy, and 14 of them conflict with state law. Then he built the app that gets patients what the law already gives them."

---

## The five numbers (learn these first, in this order)

| Say | Means | Never say |
|---|---|---|
| **470 hospitals** | Every hospital in the state's HCAI registry. I could read 463; 7 only had scanned PDFs. | "every hospital" without "on file" if pushed |
| **14 conflict** | 14 hospitals whose written policy plainly conflicts with state law. 47 more likely do. | "break the law", "violate", "illegal" |
| **$12,741** | The sample ER bill at SF General. Fictional patient, real published prices. | "a real patient's bill" |
| **$349** | Two billing errors on it: a duplicate blood count ($269) and an X-ray $80 over the hospital's own list price. | "we saved $349" (Recount flags; the patient asks) |
| **$0** | What a single person earning $20,000 likely owes there: 125% of poverty, and SF General's policy gives free care up to 138%. | "you owe $0" (say "likely owes") |

Backup numbers, only if asked: price checks for 240 of 470 hospitals, at 4 of 6 SF hospitals the cash price is the full sticker price on every item, 2,333 policy documents, 997 sentences reviewed, 181 of 181 bill lines read right on 30 test bills, about 4 cents of model cost per bill read, about 17 seconds for a live Actor run.

---

## Words on stage

- **"Conflicts with state law."** I read the written policy, not what billing actually does. A judge from a hospital or a law school will catch "breaks the law".
- **"Likely owes."** Rules give a likely answer from the patient's own answers. The hospital still decides.
- **"Sample bill."** Say it once, early. Alex Rivera is made up. The prices are SF General's real published charges.
- **"Rules decide. AI reads and writes."** Repeat it. It's my answer to half the hard questions.
- **"Recount never sends anything for you."** The patient approves and sends.
- Don't say "HIPAA compliant", "legal advice", "guaranteed", "every hospital follows" or "the AI checked".
- Azure is running in production (checked 2026-10-24, 5 PM): Document Intelligence does the second read of every uploaded bill's charges, Azure OpenAI is the backup model for letters and chat, AI Search finds policy passages for Lupa, and Content Safety screens the chat. Claude still does the main read and writes the letters. Don't say Azure reads the whole bill.
- Don't promise password reset. There is none.
- Don't say Lupa reads photos or files in chat, or that it refuses every off-topic question. Neither is live.

---

## Before judges arrive (10 minutes before)

- [ ] Phone: brightness up, Do Not Disturb on, Wi-Fi checked, charger in.
- [ ] Tab 1: https://recount-nu.vercel.app/audit with **PIH Health Whittier** open (type the full name; "Whittier" alone also matches Whittier Hospital Medical Center).
- [ ] Tab 2: https://recount-nu.vercel.app home, signed out, in English.
- [ ] Run the sample twice end to end, so the backend is warm. Check the bill says "Read by Claude". The hospital line says "Fetched live" with a date when an earlier live Actor run was saved, or "Saved lookup" when the app used its hand-checked copy. Each bill starts a live run in the background, so the second run should say "Fetched live". If it doesn't, the demo still works; just say "saved lookup".
- [ ] Laptop at phone width (390 x 844) with the same two tabs, as a second screen and a backup.
- [ ] The recorded demo video downloaded on the laptop, offline. This is the fallback if the venue Wi-Fi dies.
- [ ] A printed copy of the sample bill on the table, for "try it yourself".

---

## The 3 minutes

The order is: the hidden right, the proof hospitals hide it, one patient using it, why you can trust it, the ask.

### 0:00 to 0:20. The hidden right (no screen, look at the judge)

> If you go to an ER in California without insurance and you make under about sixty-four thousand dollars a year, state law says the hospital has to discount your bill. At SF General, under about twenty-two thousand, it's free.
> Almost nobody knows. And I wanted to know: do the hospitals' own policies even say so?

### 0:20 to 0:55. The audit (Tab 1, phone toward the judge)

> I pulled the financial assistance policies of all 470 California hospitals on file with the state. 2,333 documents. Code found the suspicious sentences, Claude reviewed each one against the statute and had to quote the exact words, and a second review argued the hospital's side. When they disagreed, the milder verdict won.
> 14 hospitals' written policies plainly conflict with state law. 47 more likely do.
> Here's PIH Health Whittier.

Scroll to the quotes. Read one, slowly.

> "Consider individual or family net worth, including all liquid and non-liquid assets." Since 2025, California hospitals can't count your assets. Same policy: collectors may report you to credit bureaus after 180 days, and may put a lien on the home of a patient under 400% of poverty. The page and the date are right here.

### 0:55 to 1:05. One patient (switch to Tab 2)

> So I built the app for the patient holding the bill.

### 1:05 to 2:10. Live demo (phone in hand, narrate while tapping)

1. **Tap "Try a sample bill".**
   > This is a sample: a $12,741 ER bill at SF General, priced from the hospital's real published charges. Claude reads every line. A second, narrow read copies only the charges column. If the two disagree, the patient is asked to tap the number on their paper. The app checks it against SF General's own price file and policy, which my Apify Actor reads, and a fresh live run starts in the background.
2. **The two findings.**
   > Two problems. The blood count is billed twice, same code, same day: $269. The chest X-ray is $482, and the hospital's own list price is $402. That's $349 to question. This part is plain code, not AI, and each finding links to the hospital's file.
   > And that $402 is also SF General's "discounted cash price". No discount at all. The Medi-Cal plans in the same file pay $10 to $27 for that X-ray.
3. **Three questions: 1 person, 20000, no insurance.**
   > Three questions, not a form. One person, twenty thousand a year, no insurance. That's 125% of the poverty line. SF General's own policy gives free care up to 138%. So Alex likely owes zero. Rules decide that. The model never does. The rule is printed under the answer.
4. **Letters. Tap "Es mía", show the letter, don't fill every field.**
   > Claude drafts the assistance request and the billing dispute, using only the facts on screen. Then code checks every dollar amount in the letter against the bill. Anything it can't match is flagged for the patient. Recount sends nothing. The patient reads, edits and approves.
5. **Tap ES for two seconds.**
   > Every screen is in Spanish too.

### 2:10 to 2:40. Why you can trust it

> Three checks I ran on myself.
> One: I hand-checked every "conflict" flag against the PDF. Every quote was on the page it cited, and every verdict held. I also found two false-positive patterns in the "likely" flags, fixed the rule, and re-reviewed. That's why it's 14 and not more.
> Two: I built 30 test bills from real hospital prices, with 24 planted errors, as scans, phone photos and PDFs. Claude read 181 of 181 lines right, and the app caught all 24 errors with zero false alarms.
> Three: every bill shows who did what. Which steps were rules, which were AI, which model, and how long.

### 2:40 to 3:00. Close

> Recount works today for any California hospital bill. It reads the bill, checks eligibility under state law, and shows if the hospital's own policy conflicts with it. Line-by-line price checks cover 240 of 470 California hospitals. It's live at recount-nu.vercel.app, with an Android app.
> Check your bill. And check your hospital.

Stop talking. Hand them the phone.

---

## 60-second version (judge is in a hurry, or a hallway)

> California law makes hospitals discount ER bills for anyone uninsured under about $64,000 a year, and many give free care below about $22,000. Most patients never hear about it. I read the policies of all 470 California hospitals, and 14 of them plainly conflict with state law.
> [Show PIH Whittier's asset quote.]
> Then I built Recount. Snap your bill. Claude reads every line. Code checks it against the hospital's own prices and the law. On this sample, two billing errors and a likely balance of zero. Then it drafts the letters, and you send them. Rules decide, AI reads and writes, nothing is sent for you.

## 15-second version (someone walking past)

> 14 California hospitals have charity care policies that conflict with state law. I found them, and built an app that tells patients what they're owed. Want to see your hospital?

Then open /audit and let them search.

---

## One sentence per judge (say it at 2:40, before the close)

Pick the judge's company. One sentence only. If several are at the table, use the People-First line.

- **Microsoft (Built for the Real World):** "Every bill is read twice, by two vendors with two methods: Claude reads the whole bill, Azure AI Document Intelligence reads the charges table, and code compares them line by line. On my 30 test bills Azure got 181 of 181 lines right. Azure OpenAI is the backup model, AI Search grounds the chat in hospitals' own policies, and Content Safety screens every message. Everything falls back instead of failing, and every AI call is logged on the bill."
- **Anthropic (Claude for Public Benefit):** "The people are uninsured and underinsured ER patients in California, many Spanish-speaking. Claude does the two things only it can do well, reading messy bill photos and writing plain letters. I kept it out of every money decision on purpose, because a wrong 'you qualify' costs a family real money."
- **Apify (Best Use and Best Actor):** "The Actor does the hardest data work: it finds a hospital's price file, streams it in any of three formats, some over 90 MB, and pulls the income limits out of its charity policy with the sentence behind each one. When it can't find a value, it returns nothing and a warning instead of guessing. It's public on the Apify Store with over 1,200 runs, and 98% succeeded. One statewide batch run gave the app price checks for 236 hospitals beyond San Francisco."
- **Convex:** "Each bill is a reactive document. Scheduled actions do the reading and drafting and write each step to a table the phone subscribes to, so the patient watches each check land instead of staring at a spinner. File storage holds the photo, auth is optional, and a limits table caps uploads."
- **People-First / Cal Hacks:** "One question per screen, Spanish throughout, large type, no account needed, a path for helping a parent with their bill, and nothing ever sent without your approval."

---

## What's real, what's a sample, what isn't built

Say this unprompted if a judge looks skeptical. It earns trust.

| Real and live | Sample or limited | Not built or not live |
|---|---|---|
| The statewide audit: 470 hospitals, real policies, quotes with page and date | The bill on stage: fictional patient, real SF General prices | Price checks for the other 230 hospitals |
| Reading any uploaded bill photo or PDF | Price checks cover common ER codes only: 17 to 23 per SF hospital, up to 20 in the statewide run | Sending letters for the patient (on purpose) |
| Eligibility under state law for any CA hospital; hospital's own free care cutoff for 159 of 470 | Test bills are generated: printed type, one layout | Live price refresh for the 236 statewide hospitals (prices are from one run on 10/24) |
| Price checks for 240 of 470 hospitals: 4 SF hand-checked, 236 from one statewide Actor run | | Price file audit beyond San Francisco |
| Price file audit of 6 SF hospitals (Rust, offline) | | Lupa reading photos or files in chat |
| Live Apify refresh for ZSFG, UCSF and CPMC; public Actor | | Azure reading the whole bill (it reads the charges only) |
| Letters, Spanish, optional accounts (email or Google), My bills, Android app with Lupa, iPhone via Home Screen | | Password reset |
| Insurance statement (EOB) check, follow-up screens and state complaint letter, "Not a valid document" for non-bill photos, browser notifications | | |
| /dashboard with live agent metrics, read-only MCP server at /api/mcp | | |

---

## If the demo breaks

| What happens | Say | Do |
|---|---|---|
| Reading spins past 30 s | "The model is slow from venue Wi-Fi. Here's the same bill finished." | Switch to the laptop tab where the sample already ran. |
| Hospital data says "saved lookup" | "It used the saved copy of the hospital's price file, and it tells you that. A live refresh runs in the background." | Keep going. This is a feature. |
| Letters say "template" | "When the model isn't available, it writes from a fixed template and labels it. It never stalls." | Keep going. |
| Wi-Fi dies | "Let me show you the recording of the same flow." | Play the offline video from 0:30. Keep narrating live. |
| /audit map won't load | "The data is a public file." | Open recount-nu.vercel.app/audit/findings.json, or describe PIH from memory (quotes below). |

---

## Hard questions (answer in one or two sentences, then stop)

### Accuracy

**"What if Claude misreads a number?"**
Two independent reads of the charges. If they disagree, the patient taps the number printed on their paper. Totals are checked against the printed total, any line can be corrected on screen, and eligibility comes from the patient's own answers, not the photo.

**"30 of 30 sounds too good."**
It is good on clean, typical bills, and that's all it shows. They're generated: printed type, one layout, photos with tilt and blur. Crumpled, dim or handwritten bills are harder, and that's why the second read and the tap-to-confirm exist.

**"Isn't 24 of 24 just your rules grading themselves?"**
The rules alone, on a perfect reading, is a sanity check, yes. The meaningful number is end to end: Claude reads the image, then the rules run on what it read. That still caught 24 of 24 with no false alarms on the 8 clean bills.

**"Why Claude and not a cheaper model?"**
I measured. On the same 30 test bills, Azure's gpt-4.1-mini read 95.6% of lines right and caught 18 of 24 planted errors. It missed all 4 bills that weren't itemized and 2 overpriced lines. Claude read 100% and caught 24 of 24. Reading one bill costs about 4 cents. In chat, gpt-4.1-mini passed 42 of 48 rule checks and Claude 47 of 47, so Claude answers first and gpt-4.1-mini is the backup.

### The audit

**"How do you know the audit isn't an AI making accusations?"**
Code only finds candidate sentences. A flag needs an exact quote that's actually in the policy, and code rejects any quote it can't find. A second review argues the hospital's side, and the milder verdict wins. Then I hand-checked every conflict flag against the PDFs.

**"Did it ever get it wrong?"**
Yes, and I fixed it. Two "likely" patterns were false positives across hospital chains. One was the federal definition of a lien, which those hospitals then ban for eligible patients. The other was a multistate policy whose California addendum overrides it. I corrected the rule and re-reviewed. The second review also cleared a flag at SF General.

**"Couldn't a hospital sue you?"**
They're the hospitals' own published words, next to the law, with the page and the date. I say "conflicts with the policy as written", not "breaks the law", and the page says these are my readings of public documents, not legal findings.

**"Maybe the policy is outdated and billing does the right thing."**
Possible, and I say so. But the policy is what the hospital gives the state and the patient. PIH's documents are dated July 2026.

### The law and the user

**"Isn't this legal advice?"**
No. It's like a tax calculator for charity care: it applies published rules to your answers and shows the source for each one. The patient decides and sends.

**"Why would a hospital answer a letter?"**
The letter asks for what the hospital's own published policy already offers, quotes it, and leaves a paper trail. The follow-up screens set a check-in date and draft a complaint to the state if the hospital says no, doesn't answer, or sends the bill to collections. The patient approves it and files it.

**"Who is this for? Did you talk to anyone?"**
Uninsured and underinsured ER patients. I designed it for an older Spanish-speaking parent, or the kid helping them, and ran three review rounds on the Spanish.

**"Why not just call the hospital?"**
You can, and the letter screen tells you to. But you'd need to know the law, the hospital's cutoff, its list price and which lines are wrong before you call. That's what this gives you, in about the time the call is on hold.

**"Bill-checking apps already exist."**
Most explain the bill. Recount checks it against two things the patient can actually use: the hospital's own published prices and its legal duty to discount. And it has the statewide audit, so it can tell you when your hospital's policy itself is the problem.

**"Why not just pay the cash price?"**
At 4 of the 6 San Francisco hospitals I checked, the "discounted cash price" is the full sticker price on every item: SF General, CPMC, Saint Francis and St. Mary's. At SF General, insurers' lowest rate is a median 4.4% of that cash price. So for an uninsured patient the real discount is charity care, which is what Recount goes after.

**"How do you know the price data is right?"**
All six price files pass CMS's own official validator with zero errors. My Rust audit then reads the numbers inside, and a separate Python script recomputed every figure and matched it exactly. It also caught SF General's file contradicting itself: on 869 items its "maximum" negotiated rate is below its minimum.

**"Why Rust?"**
It's one small binary that streams any size price file in constant memory: 11 MB for Kaiser's 216 MB file, all six files in 1.3 seconds. Speed isn't the reason, since Python was fast enough. It's built to run on every hospital in the state next.

### Privacy and safety

**"This is medical data."**
No account is needed. The bill sits behind a secret link only you have. Delete removes the bill, photo, steps and chat. Account delete removes everything. The chat strips anything that looks like a Social Security or bank number before storing it.

### Business and scale

**"How does this survive after the hackathon?"**
Free for patients. The paying side is people who do this by hand today: financial counselors, legal aid, community clinics, patient advocates. The audit is useful to regulators and journalists.

**"Does it scale past San Francisco?"**
Eligibility and the audit already cover the whole state, and price checks cover 240 of 470 California hospitals. Federal rules make every US hospital publish a price file, and the Actor already reads the common formats, so a new hospital means running the Actor, not writing code. Other states have their own charity care laws, and those would be new rule files.

**"What did it cost to run?"**
About 4 cents of model cost to read one bill. The audit was a one-time offline run.

### Technical

**"What was the hardest part?"**
Hospital price files. They come as JSON or two CSV layouts, some over 90 MB, and you need a handful of codes out of them on a phone's time budget. Second hardest: pulling the real income limit out of policies that mix current limits, history and restated law.

**"What would you do with another week?"**
Run the price file audit on every California hospital, refresh the statewide prices on a schedule, and test with real crumpled bills from patients.

---

## PIH Health Whittier quotes (know these if the screen fails)

- Assets, charity care policy p.4: "Consider individual or family net worth including all liquid and non-liquid assets owned"
- Credit reporting, debt collection policy p.3: "Collection agencies may notify the credit reporting agencies of the outstanding balance to the hospital but only after 180 days"
- Lien, debt collection policy p.3: "when income does not exceed 400% FPL, PIH's collection agency may file a lien on a primary residence"
- Both documents effective 2026-07-10. California bans all three for patients who qualify for help.

---

## Sources for every number

Checked 2026-10-24 against main at ef6778b and the live site.

| Number | Value | Source |
|---|---|---|
| Hospitals on file / readable | 470 / 463 | `public/audit/findings.json` `hospitalsTotal`, `hospitalsChecked` (live file is identical) |
| Policy documents | 2,333 | `audit/corpus/summary.json` (document slots; about 1,451 unique files) |
| Sentences reviewed | 997 | `findings.json` `packetsReviewed` |
| Hospitals by worst verdict | 14 conflict, 47 likely, 192 worth asking | `findings.json`, worst verdict per hospital |
| Conflict findings | 21 | `findings.json` |
| Top rules (conflict + likely) | credit reporting 33, assets 21, deadlines 14 | `findings.json` |
| Hand check of conflict flags | every quote on its cited page, every verdict held (all 22 of the first run) | `docs/AUDIT-SPOTCHECK.md` |
| Free care cutoff known | 159 of 470 | `convex/lib/hospitalIndex.json` |
| 2026 poverty line, 1 person | $15,960 | HHS 2026 guidelines; `convex/lib/reference.ts` |
| 400% for 1 person | $63,840 ("about $64,000") | 4 x 15,960 |
| 138% for 1 person | $22,025 ("about $22,000") | 1.38 x 15,960 |
| SF General free care cutoff | 138% | `convex/lib/snapshots/zsfg.json`; policy: "may not exceed 138% of the Federal poverty level" |
| Sample bill | $12,741, 8 lines | `convex/lib/sampleBill.json` |
| Duplicate blood count (85025) | $269 | `sampleBill.json` lines 5 and 6 |
| Chest X-ray (71046) | billed $482, list $402 | `sampleBill.json`, `zsfg.json` |
| Total to question | $349 | 269 + 80 |
| Sample income | 125% of poverty | 20,000 / 15,960 = 125.3% |
| Eval reading (Claude) | 30 of 30 bills, 181 of 181 lines | `eval/score.py --pred preds`, rerun 2026-10-24; README "The bill checks" |
| Eval errors (Claude, end to end) | 24 of 24 caught, 0 false alarms on 8 clean bills | same run |
| Eval (Azure gpt-4.1-mini as reader) | 30 bills, 173 of 181 lines (95.6%), 18 of 24 caught (missed 4 not itemized, 2 above list price), 0 false alarms on clean bills | `eval/score.py --pred preds-azure`, rerun 2026-10-24 evening |
| Lupa comparison | Claude 47 of 47 rule checks (47 of 48 replies came back); gpt-4.1-mini 42 of 48; median full reply 4.6 s vs 2.5 s | `eval/agents/compare.ts --runs 2`, `eval/agents/out/score.md`; commit ef6778b |
| Cost per read | about $0.04 (2,449 in, 1,422 out tokens) | `docs/NUMBERS-CHECK.md` |
| Live Apify lookup | about 17 s | `docs/LOGBOOK.md` 03:36 |
| Price check coverage | 240 of 470: 4 SF snapshots (ZSFG, UCSF, CPMC Van Ness, Saint Francis) + 236 statewide | `convex/lib/snapshots/*.json`; `convex/lib/statewidePrices.json` (236 hospitals, read 2026-10-24); `convex/agent.ts` `resolveRef`; live `/api/mcp` `get_validation_results` shows 240/470 |
| Live Actor refresh | 3 hospitals (ZSFG, UCSF, CPMC; Saint Francis is `live: false`) | `convex/lib/reference.ts` `KNOWN_HOSPITALS`, `convex/agent.ts` `lookupHospital` |
| Statewide batch vs hand-checked prices | 73 of 75 exact, other 2 higher | `actor/README.md` "Statewide run"; `src/components/dashboard/facts.ts` |
| Codes in the statewide run | 20 (2 to 20 found per hospital) | `statewidePrices.json` `codes` |
| Actor runs on Apify | 1,242 total runs | Apify API `acts/enterprising_arboretum_iq2~hospital-price-and-charity-finder` `stats.totalRuns`, 2026-10-24 8 PM PDT |
| Actor success | 98% (1,218 of 1,240 runs ok) | live `dashboard:summary` (30 days), agent `apify`, 2026-10-24 8 PM PDT |
| Largest price file tested | 91 MB (UCSF) | `actor/README.md` |
| Codes per SF snapshot | 17 to 23 | `convex/lib/snapshots/*.json` |
| Production models | read: Claude Opus 5.5. Second read of charges: Azure AI Document Intelligence (prebuilt-layout), Claude backup. Letters and chat: Claude, Azure OpenAI gpt-4.1-mini backup. Azure AI Search and Content Safety on | live `pipeline:map` on zealous-grouse-384, 2026-10-24 5 PM |
| Document Intelligence eval | 181 of 181 lines (code and charge) on 30 bills, 8 of 8 on the sample photo, median 7.4 s, agreed with Claude on every charge | `eval/read_docintel.py`, run 2026-10-24 |
| Upload rate limit | 60 per minute, shared | `convex/cases.ts` |
| SF hospitals where cash price = gross on every item | 4 of 6 (SF General, CPMC, Saint Francis, St. Mary's) | `pipeline/out/price_audit.json`, `docs/PRICE-FILES.md`; matched by `xcheck.py` |
| SF General lowest insurer rate, % of cash (median) | 4.4%; cash above every insurer on 92.1% of items | same |
| SF General chest X-ray (71046) | gross $402 = cash $402; insurer rates $10.31 to $27.48 | `pipeline/out/prices_zsfg.json` |
| SF General min above max | 869 items | `price_audit.json` `consistency` |
| CMS validator on the 6 files | 0 errors (Kaiser: 1 version alert) | `@cmsgov/hpt-validator-cli` 1.10.8, v3.0, run 2026-10-24 |
| Rust audit speed | 6 files, about 520 MB, in 1.3 s; 11 MB peak memory on Kaiser | measured 2026-10-24 |
