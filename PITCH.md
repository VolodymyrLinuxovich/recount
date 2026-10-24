# Recount pitch (3 min) + judge Q&A (2 min)

Judging: Sun 10:30 AM to 12:30 PM at your table. 3 min pitch, 2 min questions.
Have the live app open on a phone AND a laptop at phone width. Run the sample once right before judges arrive so the backend is warm.

## The 3 minutes

### 0:00 to 0:40. The audit (open on the "whoa" moment)

Phone already on /audit with "PIH Health Whittier" open.

> California law says that if you can't afford a hospital bill, the hospital has to discount it. It can't count your assets, can't report you to credit bureaus, and can't put a lien on your home.
> So we asked: do hospitals follow that in their own written policies? We pulled the policies of all 470 California hospitals from the state registry, 2,333 documents. Claude read 997 suspicious sentences against the statute and had to quote the exact words. A second pass argued the hospital's side.
> 14 hospitals plainly conflict with state law. This one, PIH Health Whittier, says it counts your assets, lets collectors report you to credit bureaus after 180 days, and allows a lien on your home. Here's the quote, page 3.

### 0:40 to 0:55. One person, one bill

> Now picture a patient. You go to the ER at San Francisco General without insurance, and you get a bill for twelve thousand seven hundred dollars. If you make under about sixty-four thousand a year, the law says that hospital has to discount it. Under about twenty-two thousand, it's free. Almost nobody knows. So we built the app that tells you.

(If you talked to someone at the venue, use their story here instead, with their first name and the dollar amount. Judges remember a real person.)

### 0:55 to 2:30. Live demo (phone in hand)

1. Tap "Try a sample bill". **Say:** "Claude reads every line off the photo." While it runs: "Meanwhile our Apify Actor pulls SF General's own price file and charity policy live."
2. Findings. **Say:** "Two problems. The blood count is billed twice: same code, same day, same amount, $269. The chest X-ray is $482, but the hospital's own published price is $402. This part is plain code, not AI. Every finding links to the hospital's file."
3. Three questions: 1 person, 20000, no insurance. **Say:** "That's 125% of the poverty line. SF General's own policy gives free care up to 138%. So the answer is: you likely owe zero. Rules decide that, not the model, and the rule is right there."
4. Letters. **Say:** "Claude drafts the assistance request and the dispute from only the facts on screen. Nothing is sent. The patient reads, edits, approves."
5. Tap Español for two seconds. **Say:** "Everything the patient reads is in Spanish too. The letter stays in English for the billing office, with a Spanish copy so you know what you're signing."

### 2:30 to 3:00. Why it's real + ask

> Recount works today for any California hospital bill: we read it, check eligibility and flag the hospital's policy. Price checks cover the four big SF hospitals. Model reads and writes. Code decides. Every number links to its source. Built on Claude, Convex and Apify, live at recount-nu.vercel.app. Try it with your own bill.

## Tailor the close per judge (one sentence)

- **Microsoft (production, real users):** "Path to production: a hospital-agnostic pipeline, a global upload rate limit, no account and no stored PII beyond the bill, and a known Claude cost: reading one bill measured about 4 cents, so roughly 10 cents per bill with the letters. Next is CMS Medicare rates for the payment cap."
- **Anthropic (named community, Claude used thoughtfully):** "Uninsured and underinsured ER patients in California, many Spanish-speaking. Claude does the two things only it can do, reading messy photos and writing plain letters. We kept it out of eligibility on purpose, because a wrong yes costs a family real money."
- **Apify:** "The Actor is the hardest data work in the project. It finds and streams 90 MB price files in three formats, and extracts income limits from policy PDFs with the quote behind each one. It's public on the Apify Store and runs live in the app in about 17 seconds."
- **Convex:** "Each case is a reactive document. Scheduled actions do the reading and drafting, and the phone subscribes to a step log, so the patient watches each check land instead of a spinner. File storage holds the photo, and a limits table caps uploads per minute."
- **People-First:** "Three questions, not a form. Spanish, large type, no account, nothing sent without approval."

## Hard questions (answer in one or two sentences)

**"What if Claude misreads a number?"**
Blurry fields are marked for the patient to check. Totals are checked against the printed total. A misread line can be corrected on screen. Eligibility uses the patient's own answers, not the photo.

**"Isn't this legal advice? Liability?"**
No. It cites public law and the hospital's own published documents, and the patient sends the letters. It's like a tax calculator for charity care: every number links to its source.

**"How do you know the audit isn't hallucinating accusations?"**
Regex only finds candidates. A flag needs an exact quote that breaks the rule, and a second review argues the hospital's side. When the two disagree, the milder verdict wins. That second review cleared flags, including one at SF General.

**"Why only 4 hospitals for prices?"**
Price files are 90+ MB in three formats. We did four San Francisco hospitals properly. The Actor works on any US hospital's file, so adding hospitals is running it, not rewriting code.

**"Does anyone actually use this / did you talk to users?"**
[Fill in from conversations at the venue: who, what bill, what they did.]

**"How would this make money / survive?"**
Free for patients. The path is financial counselors, legal aid, community clinics and patient advocates who do this by hand today. The audit data is valuable to regulators and journalists.

**"What about privacy? It's medical data."**
No account. The bill sits behind a secret link only you have. "My bills" lives on your phone. Nothing is sent to the hospital by us.

**"What's the hardest technical part?"**
Streaming 90 MB price files in three different formats to find a handful of codes, and pulling the right income limit out of policies that mix current limits with history and restated law.

## Before judging (checklist)

- [ ] Sample run once on the live site, in both languages.
- [ ] Phone brightness up, Do Not Disturb on, browser tabs: /audit with "PIH Health Whittier" open FIRST, then the app start screen.
- [ ] One printed copy of a real-looking bill for "try it yourself" (the sample bill image).
- [ ] Know the 5 numbers by heart, in pitch order: 470 hospitals, 14 conflicts, $12,741 bill, $349 questioned, 138% ZSFG cutoff.
