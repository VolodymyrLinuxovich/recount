# Recount demo script (about 2 minutes 50 seconds)

Record on a phone, or on a laptop at phone width (390 x 844, browser zoom 100%). Everything below is live on https://recount-nu.vercel.app. The video has two bills:

- **A real two-page upload** (0:15 to 0:40), to show that a paper bill can go in as several photos and that two different readers check it. It's a generated UCSF bill priced from real published charges. Its pages are in `~/Desktop/recount-demo-files/bill-page-1.png` and `bill-page-2.png`.
- **The built-in sample bill** (0:40 to 1:50), for the full story, because its numbers are fixed and it reads fast. Alex Rivera is a fictional patient at Zuckerberg San Francisco General (ZSFG). The bill is priced from ZSFG's real published charges. Say once that it's a sample.

## Before recording

- Open the site once and run the sample bill once, so everything is warm. Delete that test bill after (My bills, open it, "Delete this bill").
- Put the three files from `~/Desktop/recount-demo-files/` where the recording device can pick them: the two bill pages and `insurance-statement.png`. On a phone, AirDrop them to Photos. On a laptop, they're already on the Desktop.
- Open https://recount-nu.vercel.app/audit once so the map is cached. You'll type "PIH Health Whittier" (not just "Whittier").
- Do Not Disturb on, brightness up, close other tabs.
- Cut the waiting in editing. Reading a real upload takes about 30 to 60 seconds; keep 2 or 3 seconds of the steps ticking, then cut.

---

## 0:00 to 0:15. The problem

**Screen:** Home page. Hold on the headline, then scroll through the stats band.

> If you can't pay a hospital bill in California, the law says the hospital may have to discount it, or make it free. Most people never find out. And when I checked, 14 California hospitals' own policies conflict with state law.

## 0:15 to 0:40. A real bill, two pages

**Screen:** Tap "Take a photo of your bill" (on a laptop it opens a file picker). Pick `bill-page-1.png`. The "Your bill's pages" screen appears with page 1. Tap "Add another page" and pick `bill-page-2.png`. Show both thumbnails for a second, then tap "Check my bill". Show the reading steps ticking for 2 or 3 seconds, cut to "Both reads agree on every amount".

> Real bills have more than one page, so you can send up to six photos, in order. Two different readers go through it: Claude reads the whole bill, and Azure AI Document Intelligence reads the charges again. Code compares the two, line by line. If they disagree, you tap the number on your paper bill. With only the first page, the lines wouldn't add up to the total on page two. With both, every line is there.

(Optional, 3 seconds: show the line list, then go back home. Don't walk this bill through the questions.)

## 0:40 to 0:55. The sample bill and its problems

**Screen:** Home. Tap "Try a sample bill". Cut the reading. Show the two problem cards: "Billed twice" (blood count) and "Charged more than their own list price" (chest X-ray).

> Here's a sample ER bill for $12,741, priced from the hospital's real published charges. Two problems. The blood count is billed twice: $269. The chest X-ray is $482, and the hospital's own list price is $402. That's $349 to question. These checks are plain code, not AI, and each one links to the hospital's own file.

## 0:55 to 1:10. Three questions, then the answer

**Screen:** "Answer 3 questions": 1 person, 20000 a year, no insurance. The answer: "You likely owe $0".

> Three questions, not a form. One person, twenty thousand a year, no insurance. That's 125% of the poverty line, and this hospital's own policy gives free care up to 138%. So Alex likely owes nothing. Rules decide that, never the model, and the rule is right under the answer.

**Optional, 2 seconds:** tap ES in the header and back to EN. "Every screen is in Spanish too."

## 1:10 to 1:25. Letters

**Screen:** "Is this bill for you or for someone else?", tap "It’s for me", fill the details. Show one letter with the hospital's mailing address filled in. Approve. Show "How to send my letters".

> Claude drafts the request for financial help and the billing dispute, from only the facts on screen. Then code checks every dollar amount against the bill. Recount sends nothing for you. You read, you approve, you send.

## 1:25 to 1:35. Who did what

**Screen:** Back to the answer, tap "More about this bill", scroll to "Who did what on this bill".

> Every bill shows who did what: the steps done by fixed rules, and each AI call with its model and time. Claude read it, Azure read the charges a second time.

## 1:35 to 2:05. Lupa

**Screen:** Tap "Ask" (or "Ask Lupa"). Tap the paperclip ("Attach a photo or PDF"), pick `insurance-statement.png`, type "Is this right?", send. Let the answer stream for a few seconds. Then type "What's the capital of France?" and send. Show the refusal.

> Lupa answers questions about your bill. You can attach a photo, like the statement your insurance sent, and it explains it in plain words. It only answers bill questions. Ask it anything else and it says so, without answering. And it never sends anything for you.

## 2:05 to 2:25. The statewide audit

**Screen:** Tap "Hospital audit" in the header. Show the three numbers (463, 14, 47). Search "PIH Health Whittier". Open it and scroll through its quotes.

> I also read the financial assistance policies of all 470 California hospitals on file with the state. 14 conflict with state law, and 47 more likely do. PIH Health Whittier's own policy counts patients' assets, lets collectors report the debt to credit bureaus after 180 days, and allows a lien on the home of a patient who qualifies for help. The page and the date are right here.

## 2:25 to 2:45. Close

**Screen:** Home page, scroll to "Get the app" (Android and iPhone cards). Optional, 3 seconds: /dashboard with the live agent table.

> Recount works today for any California hospital bill, with price checks for 240 hospitals. It's on the web, on Android, and on iPhone from the Home Screen, in English and Spanish. Check your bill. And check your hospital.

---

## Cuts if you run long

1. The ES toggle (saves 2 s).
2. "Who did what" (saves 10 s); it's also in the pitch.
3. The off-topic question in Lupa (saves 8 s).
4. The /dashboard flash.

Don't cut the two-page upload or the audit: those are the parts nobody else has.

## Optional extra shot: typed insurance amounts (if you want an insured example)

Start a bill, answer the questions with "Yes" to insurance, and on "Do you have health insurance?" tap "Type the amounts instead". Type what insurance says you owe and what the plan paid. If the hospital asks for more than that, Recount flags it.

> No statement handy? Type the two numbers from it. If the hospital asks for more than your insurance says you owe, Recount flags it.

---

## Numbers used above (check before recording)

| Item | Value | Source |
|---|---|---|
| Audit | 470 hospitals, 463 readable | `public/audit/findings.json` |
| Audit results | 14 conflict, 47 likely, 192 ask | strongest verdict per hospital |
| PIH Health Whittier, assets | "Consider individual or family net worth including all liquid and non-liquid assets owned" | charity care policy p.4, effective 2026-07-10 |
| PIH Health Whittier, credit | "Collection agencies may notify the credit reporting agencies ... only after 180 days" | debt collection policy p.3, effective 2026-07-10 |
| PIH Health Whittier, lien | "when income does not exceed 400% FPL, PIH's collection agency may file a lien on a primary residence" | debt collection policy p.3 |
| Sample bill total | $12,741.00 | 8 lines in `convex/lib/sampleBill.json` |
| Duplicate CBC (85025) | $269.00 | lines 5 and 6 |
| Chest X-ray (71046) | billed $482.00, list price $402.00 | `sampleBill.json`, `convex/lib/snapshots/zsfg.json` |
| Total to question | $349.00 | 269 + 80 |
| 1 person, $20,000 | 125.3% of the poverty line | 2026 FPL $15,960 |
| ZSFG free care cutoff | 138% | `zsfg.json` |
| Price check coverage | 240 of 470 hospitals | `convex/lib/snapshots/`, `convex/lib/statewidePrices.json` |
| Two-page bill | 8 lines, total $13,872.52 on page 2; read 8 of 8 in order on staging, both reads agreed | `eval/out/bill-011.truth.json` |
| Pages per bill | up to 6 photos | `convex/lib/pages.ts` |

## Words

- Say "conflicts with state law", never "breaks the law": I read the written policy, not what billing actually does.
- Say "likely owes", never "owes". The answer comes from the patient's own answers.
- Don't say "every flag was reviewed twice". Conflict and likely flags got two reviews. "Worth asking" flags got one.
- Don't say Azure reads the whole bill. Claude reads the bill; Azure reads the charges a second time.
- Don't promise password reset. There is none.
