# Recount demo script (about 2 minutes 20 seconds)

Record on a phone, or on a laptop at phone width (390 x 844). The video opens on the home page, runs the built-in sample bill in Spanish, shows who did what on the bill, signs in to show the bill history, and ends on the statewide audit. Alex Rivera is a fictional patient at Zuckerberg San Francisco General (ZSFG). The bill is priced from ZSFG's real published charges. Say once that it is a sample.

Before recording:
- Create a demo account (email + password) on another device or a private window, and check one real-looking bill there, so the account already holds a bill from "another device".
- On the recording phone, start signed out, with no saved bills.
- Run the sample twice and check that the bill says "Read by Claude" and the hospital data says "Fetched live". Each run starts a live Actor run in the background, so the second run uses fresh data. If Claude or the Apify Actor is down, the app falls back to the sample's source data, a saved lookup and template letters, and labels each one.
- Run the sample once and open "More about this bill". The "Who did what" panel lists the AI calls that actually ran, with model and provider. In production Claude reads and drafts, and Azure AI Document Intelligence does the second read of the charges.
- Rehearse the path to the panel: from the letters, go Back to the answer screen ("Lo más probable es que usted deba $0") and tap "Más sobre esta factura: fuentes, compartir, borrar".
- Open /audit once so the map is cached. Type "PIH Health Whittier", not just "Whittier": "Whittier" also matches Whittier Hospital Medical Center.

---

## 0:00 to 0:20. The problem

**Screen:** Home page. Hold on the headline, then scroll slowly through the stats band ("Medical debt is common. Help is often hidden.").

> Hospital bills are often wrong, and help is often hidden. About 20 million people in the US owe medical debt. California's Attorney General warned that hospitals weren't telling patients about free care. And I checked: 14 California hospitals' own policies conflict with state law.

## 0:20 to 0:30. How it works

**Screen:** Keep scrolling through "See how it works": snap, read, flag, three questions, the answer, the letters.

> Recount checks your bill the way an advocate would. Snap it, we read every line, flag the problems, ask three questions, and tell you what you really owe.

## 0:30 to 0:45. Spanish and the sample

**Screen:** Tap ES in the header. The page switches to Spanish. Tap "Probar con una factura de ejemplo". Watch the reading step.

> Everything the patient reads is in Spanish too. This is an ER bill for $12,741 with no insurance. Claude reads every line. Azure AI Document Intelligence reads the charges a second time, so a blurry number gets caught instead of quietly "fixed". The prices come from the hospital's own price file, which my Apify Actor reads. Recount has price checks for 240 California hospitals.

## 0:45 to 1:00. The problems

**Screen:** The two cards: the blood count "aparece cobrado dos veces", and the chest X-ray "cuesta más que el precio de lista del hospital". Point at "Corregir".

> Two problems. The blood count is billed twice: $269. The chest X-ray is $482, and the hospital's own list price is $402. Together, $349. These checks are plain code, not AI. If a number was misread, the patient taps Corregir and types the right one.

## 1:00 to 1:15. Three questions, then the answer

**Screen:** 1 person, 20000 a year, no insurance. The answer: "Lo más probable es que usted deba $0".

> One person, $20,000 a year, no insurance. That's 125% of the poverty line, and this hospital's own policy gives free care up to 138%. So Alex likely owes nothing. Rules decide this, not the model, and the source is right under the answer.

## 1:15 to 1:30. Letters

**Screen:** "¿Esta factura es suya o de otra persona?" Tap "Es mía". Fill the details. Show the letter with the hospital's mailing address filled in, approve, then "Envíe sus cartas".

> If you're helping a parent, you say so, and Recount uses their details, not yours. The letters already have the hospital's mailing address. Recount sends nothing for you. You approve, then follow four steps: call billing, send, pause collections, apply.

## 1:30 to 1:50. Who did what

**Screen:** Back to the answer screen. Tap "Más sobre esta factura". Scroll to "Quién hizo qué en esta factura": the count of rule steps, then each AI call with its model, provider and seconds.

> Every bill shows who did what. These steps were fixed rules. These are the AI calls: the read, the second read of the charges, the letters, each with its model and time. AI may read and write. It may never send anything, decide if you qualify, or change an amount. And every AI call goes through one layer, so I can change the model without changing the app.

## 1:50 to 2:05. Sign in, see the history

**Screen:** Tap "Entrar" in the header. Sign in to the demo account. Show "Agregamos 1 factura a su cuenta", then Mis facturas with both bills.

> Accounts are optional. You can check a bill without one. If you sign in, the bills on this phone join your account, and your history and letter details follow you to any device.

## 2:05 to 2:20. The audit

**Screen:** Tap "Hospital audit" in the header (it stays in Spanish, or switch back to EN). Search "PIH Health Whittier". Open it and scroll through its quotes.

> I also read the policies of all 470 California hospitals. 14 conflict with state law, and 47 more likely do. PIH Health Whittier's own policy counts patients' assets, lets collectors report the debt to credit bureaus after 180 days, and allows a lien on the home of a patient who qualifies for help. Recount. Check your bill, and check your hospital.

Cut for time (show only if the video runs short): Lupa. Tap "Ask Lupa" in the header and ask "¿Por qué debo $0?". It answers about this bill only, never says a patient qualifies beyond what the rules found, and stops messages that look like a Social Security or bank number.

---

## Numbers used above (check before recording)

| Item | Value | Source |
|---|---|---|
| Medical debt | about 20 million people | home page stat, KFF / Peterson Health System Tracker |
| Audit | 470 hospitals, 463 readable, 2,333 documents, 997 sentences | `public/audit/findings.json` |
| Audit results | 14 conflict, 47 likely, 192 ask (21 conflict findings in all) | strongest verdict per hospital, main `db1069b` |
| PIH Health Whittier, assets | "Consider individual or family net worth including all liquid and non-liquid assets owned" | charity care policy p.4, effective 2026-07-10 |
| PIH Health Whittier, credit | "Collection agencies may notify the credit reporting agencies ... only after 180 days" | debt collection policy p.3, effective 2026-07-10 |
| PIH Health Whittier, lien | "when income does not exceed 400% FPL, PIH's collection agency may file a lien on a primary residence" | debt collection policy p.3 |
| Bill total | $12,741.00 | 8 lines in `convex/lib/sampleBill.json` |
| Duplicate CBC (85025) | $269.00 | lines 5 and 6 |
| Chest X-ray (71046) | billed $482.00, list price $402.00 | `sampleBill.json`, `convex/lib/snapshots/zsfg.json` |
| Total to question | $349.00 | |
| 1 person, $20,000 | 125.3% FPL | 2026 FPL $15,960 |
| ZSFG free care cutoff | 138% FPL | `zsfg.json` |
| Hospitals with a proven free care cutoff | 159 of 470 | `convex/lib/hospitalIndex.json` |
| AI tasks shown with models | read, column, letters, chat | `convex/pipeline.ts` `map`, `convex/lib/model.ts` |
| Price check coverage | 240 of 470 hospitals (4 SF snapshots + 236 statewide) | `convex/lib/snapshots/`, `convex/lib/statewidePrices.json` |

Spanish labels on screen (from `es.json` and `convex/lib/checks.ts`): "Probar con una factura de ejemplo", "aparece cobrado dos veces", "cuesta más que el precio de lista del hospital", "Corregir", "Lo más probable es que usted deba", "¿Esta factura es suya o de otra persona?", "Es mía", "Otra persona", "Envíe sus cartas", "Entrar", "Agregamos 1 factura a su cuenta", "Mis facturas", "Más sobre esta factura: fuentes, compartir, borrar", "Quién hizo qué en esta factura", "Modelo de respaldo".

Say "conflicts with state law", never "breaks the law": I read the written policy, not what billing actually does. The home page, /audit and the policy card inside a bill all use this wording (`policy.vConflict` in `en.json`).
Don't say "every flag was reviewed twice". Conflict and likely flags got two reviews. "Worth asking" flags got one.
Don't promise password reset. There is none: the account screen tells people to write the password down.
