# Recount

**Tagline:** Photograph an ER bill. See which charges don't match the hospital's own prices, whether California law entitles you to free or discounted care, and get the letters to ask for it.

## Inspiration

Recount is for uninsured and underinsured ER patients in California, many of them Spanish-speaking, who are holding a hospital bill they can't pay.

[STORY: one real person's experience, in their words, collected at the venue. Leave out if we don't get one.]

An uninsured ER visit in San Francisco can produce a five figure bill. California law already gives many of these patients a right to free or discounted care. Uninsured patients at or below 400% of the federal poverty line qualify for discounted payment. Since January 2025, hospitals can't count a patient's assets, can't set deadlines for applying, and can't report hospital debt to credit bureaus.

Most patients don't know this. The numbers they would need to check a bill are public, but they sit in hospital price files of up to 90 MB and in policy PDFs. We wanted a patient to be able to check one bill from their phone in a few minutes.

## What it does

The home page starts with the problem, not a form: a stats band with sources (about 20 million people in the US owe medical debt; California's Attorney General warned hospitals weren't telling patients about free care; 14 of 470 California hospital policies conflict with state law), then a "See how it works" scroll story that walks through a bill before asking for a photo. The header has Check a bill, Hospital audit, My bills, EN|ES, Ask Lupa and an optional Sign in. The design is white with one deep purple and a magnifying glass logo.

The app itself walks the patient through one step per screen, with Back and Next side by side. A short "Before you start" intro says what they'll need: the itemized bill, a rough yearly income, and whether they had insurance.

1. **Reads the bill.** You take a photo or upload a PDF. An AI model (Claude Opus 5.5 by default) transcribes every line: code, description, date, quantity and charge. It copies only what is printed. At the same time a second, narrow read copies only the charges column. A full read sometimes "fixes" a line so the lines add up to the total, which would hide a real billing error; the narrow read has no reason to. Code compares the two reads. Where they disagree, the app uses the column copy and asks "Please check one amount": "We read $X. A second look read $Y. Which is on your bill?" The patient taps the number on the paper bill, or types it if neither matches. Any other misread amount can be fixed the same way, with "Fix" on that line. If the file isn't a medical bill it says so instead of making one up.
2. **Finds the hospital.** The name on the bill is matched against all 470 California hospitals in the state's HCAI registry. When the match isn't clear, the app asks "Which hospital is this bill from?" and you pick from the closest few. It never guesses silently.
3. **Checks each line against the hospital's own numbers.** This step is plain code, not a model. It finds duplicate lines and charges above the hospital's published list price or cash price. Each finding is one card: what you were billed, the hospital's own list price, and "You could save $X", with a link to the source file. Line-by-line price checks work for 4 San Francisco hospitals today.
4. **Applies California's charity care rules.** Three questions: household size, yearly income and insurance. Insured patients are also asked about their out-of-pocket costs. Rules in code compute your income as a percent of the 2026 federal poverty guideline. They use the hospital's own free care cutoff when its policy's own words show the free tier (159 of 470 hospitals; ZSFG gives free care up to 138%), and the state's 400% floor for discounted payment. The model never decides eligibility. The answer lists the rule it used and links to it. "Change my answers" goes back.
5. **Flags the hospital's own policy where it conflicts with state law.** If your hospital is one the statewide audit flagged, the app shows the exact sentence and the law it conflicts with, and the letter cites it.
6. **Drafts letters, one per screen.** First it asks "Is this bill for you or for someone else?". If you're helping a parent, it asks for their details and never fills in or saves yours. The model writes a financial assistance request and, if there are findings, a billing dispute, addressed to the hospital's mailing address. It uses only the facts already on screen. Then a rule in code finds every dollar amount in the letters and looks for it in the bill, the totals, the findings and the eligibility numbers. An amount it can't match is named above that letter: "Please check $X in this letter against your bill. We couldn't match it to your bill or our checks." You can edit the letters. The patient's name, address and phone are required. Your own details can be saved for the next bill, on the phone or in your account. The sample bill's made-up patient is never saved. Approve works only when every blank is filled. Then a check mark: "Your letters are ready".
7. **Helps you send them.** Recount sends nothing. A 4-step checklist follows: call billing, send the letters, ask them to pause collections, apply. After the call it asks "Did you reach them?". Letters can be printed, saved as PDF, copied or opened in your email.
8. **Lupa, the helper.** "Ask Lupa" in the header opens a side chat, with a lens avatar, that answers questions about your own bill, in English or Spanish ("Why do I owe $0?", "What does 'billed twice' mean?"). The model answers from the case data only. It is told never to say a patient qualifies beyond what the rules found, never to say anything was sent, and to point hard cases to the hospital's financial counselor, free legal aid and the state complaint program. Messages that look like a Social Security, card or bank number are stopped before they are sent. Lupa knows the app's privacy facts, so "Do you keep my mom's info?" and "Is this a scam?" get true answers. Every question and every reply also goes through Azure AI Content Safety, and a reply is shown only after it passes. Hate or sexual content gets a short "I can only help with questions about your hospital bill" instead. Signs of self-harm get a message with 988 and 911, in English or Spanish, never a refusal. A patient describing an injury, like a fall or a shooting, is never blocked. Lupa also searches the 997 policy sentences from our audit through Azure AI Search, limited to the bill's hospital when there is a bill, so it can quote a hospital's own words.
9. **Works in Spanish.** A toggle in the header switches everything the patient reads to Spanish. Letters to the hospital stay in English, because that is what billing offices read. In Spanish, the read-only Spanish copy ("Lo que dice su carta") comes first. All UI text lives in `en.json` and `es.json`, and a test fails if Spanish misses a phrase, so adding a language starts with translating one file.
10. **Text size and contrast.** Large text and two high contrast themes: black on white, or yellow on black.
11. **My bills, with or without an account.** Every bill you check is listed on your phone. Each bill opens only with its private link; you can copy the link to share it with family, or delete the bill and its photo for good. Accounts are optional: email and password, or "Continue with Google". Checking a bill never needs one. Signing in adds the bills on that phone to your account, so your history is there on any device. A Google sign-in never joins an existing password account that uses the same email, so nobody can take over bills by signing up with someone else's address first. The account page (/account) holds "Your details for letters": name, address, phone, email and date of birth, all optional, which fill in your letters so you don't type them each time. You can delete your account, with or without its bills. There is no password reset yet.
12. **Privacy in plain words.** The app says what is stored, who processes it (Claude for reading and writing, the Apify Actor only sees the hospital and billing codes), who can see it, how long it is kept, and how to delete it. Lupa answers privacy questions from the same checked facts.
13. **A phone app.** An Expo (React Native) app in `mobile/` uses the same Convex backend, with the same one step per screen flow.

## Rules, AI and you: who did what

Every bill is a case, and every step of it has an owner: fixed rules in code, an AI model, or the patient.

- **Who did what on this bill.** The "More about this bill" screen counts the steps done by fixed rules and lists every AI call with its task, model, provider and time. It marks any call that used the backup model or didn't finish, and it says the patient checks the amounts and approves every letter. AI reads the bill, reads the charges a second time, drafts letter text and answers chat. It never sends anything, decides who qualifies, or computes or changes an amount.
- **Models in use right now.** The same page shows, live from the backend, which model and provider each AI task uses and which backup model is set. It shows names only, never keys.
- **Who did what on this bill.** Each bill's "More about this bill" screen counts the steps done by fixed rules and lists every AI call made for that bill: the task, the model, the provider, how many seconds it took, and whether a backup model answered or the call didn't finish. We record the task, model, provider, time and token counts for each call, never the prompt or the bill.
- **One model layer.** Every AI call goes through `convex/lib/model.ts`. It speaks to Anthropic, to any OpenAI-compatible endpoint (including Azure AI Foundry's), and to Azure OpenAI. Each task (read, column, letters, chat) can use its own provider and model, and a backup provider takes over if the first one throws. A reply that doesn't match our schema is treated as no reply. Rules and money math never go through it.

## The policy audit

We crawled HCAI's Hospital Fair Pricing Policy Lookup for all 470 listed California hospitals and extracted text from 2,333 policy documents. 463 hospitals had readable text. 7 had only scanned PDFs, which we can't read yet.

We checked six rules from the 2025 law changes: no application deadlines, no asset tests, income proof limited to pay stubs and tax returns, no credit reporting, no liens on a patient's home, and no requirement to apply for Medi-Cal first. Pattern rules found 997 candidate sentences. Each one was reviewed with the law's own text and three sentences of context on each side. The reviewer had to quote the exact words its verdict rests on, or the candidate was dropped. Every conflict and likely flag then got a second review that argued the hospital's side. When the two reviews disagreed, the milder verdict won. Reviewers also saw any California addendum or controlling language elsewhere in the same document, because several national chains file one policy with a California section that overrides it. An independent spot-check of the results then corrected the lien rule (California bans liens on the homes of patients who qualify for help, not on everyone's) and cleared the false positives it found. "Worth asking" flags were reviewed once.

| Result | Hospitals |
|---|---|
| Plain conflict with state law | 14 |
| Likely conflict | 47 |
| Wording worth asking about | 192 |

Each hospital is counted once, under its strongest result. We show the three numbers apart and never add them up.

One example is PIH Health Whittier Hospital. Its charity care policy says to "Consider individual or family net worth including all liquid and non-liquid assets owned". Its debt collection policy says collectors "may notify the credit reporting agencies of the outstanding balance to the hospital but only after 180 days", and that "when income does not exceed 400% FPL, PIH’s collection agency may file a lien on a primary residence". California law bans all three for patients who qualify for help. Both documents are dated 2026-07-10.

The second review also cleared flags. An earlier pass flagged Zuckerberg San Francisco General's income proof wording. The second review found a fair compliant reading and cleared it. ZSFG now has one item worth asking about: its collector researches a patient's real property, and the policy doesn't say what it does with it.

These are our readings of public documents, not legal findings. The /audit page works on laptops and phones. It shows every hospital on a map with search, the hospitals with the most flags, and the three rules hospital policies conflict with most (credit reporting, counting assets, deadlines to apply). Each hospital page puts the policy's own words next to the law, with the page and effective date of the document, and "Check your bill" starts a bill for that hospital.

## How we built it

- **Convex** is the backend. Each case is a document. The bill photo goes to Convex file storage. A scheduled action runs the reading, lookup and checks, and writes each step to a `steps` table. The phone subscribes to that table, so the patient sees each step as it happens. Hospital lookups are cached in a `hospitals` table. Optional accounts use Convex Auth (email and password or Google, failed sign-ins rate limited).
- **Claude (Opus 5.5)** is the default model. It reads the bill into a typed schema with structured outputs, and drafts the letters from a JSON of facts. On our sample photo it read 8 of 8 lines and the $12,741 total. If the model is unavailable, the app falls back to fixed letter templates and says so. Claude also powers Lupa's answers and did both audit reviews.
- **A model layer, not one vendor.** `convex/lib/model.ts` is the only place the app calls a model. Environment variables pick the provider and model per task, plus a backup. Each call is logged as a run (task, model, provider, time, tokens, backup used, failed) and shown on the bill.
- **Azure.** Four Azure services run in production. Azure AI Document Intelligence (layout model) reads the charges a second time, and code compares that read with Claude's. On our 30 eval bills it read 181 of 181 lines right. Azure OpenAI (gpt-4.1-mini) is the backup model for letters and Lupa if Claude is unavailable. Azure AI Search holds the audit's 997 policy sentences with our verdict on each, so Lupa can quote a hospital's own policy, found with text-embedding-3-small vectors and keywords. Azure AI Content Safety checks every chat message and reply. Signs of self-harm get a message with 988 and 911 instead of a refusal, and a patient describing an injury is never blocked. We also tried gpt-4.1-mini as the bill reader on the same 30 bills. It read 95.6% of lines right and caught 18 of 24 planted errors, against Claude's 100% and 24 of 24, so Claude stays the reader. The privacy page and Lupa's privacy answers name each Microsoft service only while it is switched on.
- **Apify.** We built an Actor, "Hospital Price & Charity Care Finder". Given a hospital website and billing codes, it finds the hospital's price transparency file and streams it. Files are JSON or one of two CSV layouts, some over 90 MB. It returns the gross charge, discounted cash price and negotiated range per code. It also finds the hospital's charity care policy in the HCAI registry and extracts the income limits with the sentence each one came from. When it can't find a value it returns null and a warning instead of guessing. It runs on Apify (Actor ID `NXiKTRZKK6p6qCSXk`). The app calls it live for each bill, which takes about 17 seconds, and falls back to a saved lookup if the live call fails. The UI says which one you got.
- **Next.js** for the phone-first web app. Everything the patient reads is in `en.json` and `es.json`, with a small formatter for plurals.
- **Expo** (React Native) for the phone app in `mobile/`, on the same Convex backend.
- **Design research.** We based the flow on NHS, GOV.UK and USWDS patterns (one question per page, Back and Continue, plain error messages, a confirmation page with next steps) and checked every color pair against the WCAG contrast formula (`docs/DESIGN-RESEARCH.md`).
- **Python** pipelines for the HCAI crawl, text extraction, MRF extraction and the policy audit.
- **An eval set.** We generate synthetic SF ER bills priced from each hospital's real published charges. We plant known errors in most of them and render them as clean scans, phone photos and PDFs. With a perfect reading, the rule checks caught 24 of 24 planted errors and raised 0 false alarms on clean bills.

## Scope and limits

- **Price checks in San Francisco only.** Price checks work for 4 hospitals: Zuckerberg SF General, UCSF Medical Center, CPMC Van Ness and Saint Francis Memorial. The policy audit covers all 470 California hospitals on file. A bill from any other hospital is still read, screened under state law and matched to the audit, but its prices aren't checked.
- **ER codes only.** Our saved price data covers 17 to 23 common ER codes per hospital. Codes outside that list aren't price checked. Zuckerberg SF General's price file has no rows for drugs or blood draws at all.
- **Hospital bills only.** ER physician bills are separate and follow different rules (HSC 127450 and after). We don't handle them yet.
- **Hospital cutoffs only where the policy proves them.** The answer uses a hospital's own free care cutoff only when the policy's own sentence ties that exact number to free care (159 of 470). An early version read some policy tables wrong and took the discount tier (400%) as the free tier; a guard and a regression test now prevent that. Everywhere else the app uses the state's 400% discount floor and never promises free care.
- **No payment cap amount.** State law caps what discount-eligible patients pay at what Medicare or Medi-Cal would pay. Hospital price files don't publish Medicare rates, so we tell patients about the cap but don't compute it.
- **Live reading accuracy isn't measured at scale yet.** The 24 of 24 result tests the rule checks on a correct transcription. Claude read the sample photo correctly, but we haven't scored it on the full eval set.
- **The audit has gaps.** 7 hospitals have only scanned PDFs. "Worth asking" flags got one review, not two. Some policies on file are from 2022, and we judge the latest one HCAI holds.
- **Accounts are basic.** Email and password, or Google. No email verification for password accounts and no password reset, so the app tells people to write the password down. Anyone with a bill's private link can open that bill, so the app says so next to Copy link.
- Recount isn't legal advice. Every number links to where it came from so the patient, or someone helping them, can check it.

## Challenges we ran into

- Hospital price files are large and inconsistent. They are hidden behind Box links and CDNs, in three different formats. None of the SF hospital sites served the `cms-hhs-pricetransparency.txt` file that CMS requires.
- Charity care PDFs mix current limits with history and restated law. A simple search for "% FPL" picks up the wrong number. The Actor separates upper limits from lower limits and free care from discount tiers, and ignores history.
- Ownership changed. Saint Francis Memorial and St. Mary's are now UCSF Health hospitals, and HCAI holds one UCSF policy for four sites.
- Avoiding false accusations. Many policy sentences mention credit reporting or deadlines while following the law. The audit treats a regex hit only as a candidate. A hospital is flagged only if a reviewer can quote the words that conflict with the rule, and a second review argues the hospital's side.
- Spanish without changing the letters. The patient needs to understand every word, but the billing office reads English. We kept the letters in English and added a Spanish copy the patient can read.

## Accomplishments we're proud of

- Every finding points to a bill line and a published number or a quoted sentence. Nothing on screen is a model's unsupported claim.
- Eligibility and price checks are plain rules that can be tested. The model reads and writes. It doesn't decide.
- The audit covers every hospital in the state registry and found 14 hospitals whose own policies plainly conflict with state law, each backed by a quote, a page number and a date.
- The second review cleared flags it couldn't stand behind, including one at San Francisco's public hospital. We'd rather miss a problem than accuse a hospital wrongly.

## What we learned

- The law is more generous than most patients assume. The hard part is the paperwork, not the eligibility.
- Price transparency data exists, but it is hard for a patient to use without software.
- It helps to keep the model on the parts that need it, reading messy photos and writing plain letters, and to use code for everything that has a right answer.

## What's next

- OCR for the 7 hospitals with scanned policies, and a second review for "worth asking" flags.
- Add more hospitals' price data, and add ER physician bills.
- Compute the Medicare payment cap from the CMS OPPS fee schedule.
- Score live reading on the eval photos and publish the numbers.
- Chinese and Tagalog, after Spanish.
- Password reset by email for accounts.

## Path to production

- **Works for any California hospital, not a demo set.** The bill's hospital is matched against all 470 hospitals in the state's HCAI registry, and the patient picks when the name is ambiguous. Free-care income limits come from each hospital's own filed policy, kept only when the quoted sentence proves the free tier (159 of 470); the rest fall back to the state's discount rule. The Apify Actor reads any US hospital's price transparency file; line-by-line price checks are live today for four San Francisco hospitals and grow as more files are verified.
- **Cost.** Reading one bill photo with Claude measured about $0.04 (2,449 input and 1,422 output tokens). Drafting the letters adds a similar amount (estimated), so a bill costs on the order of 10 cents.
- **Privacy.** Without an account, each bill is reachable only with a random secret kept on the patient's phone (the link fragment never reaches a server). With an account, the owner can also open it by signing in. Patients can delete a bill and its photo, or their whole account. The app states what is kept, in plain words. Uploads are rate-limited to 60 per minute.
- **Honest fallbacks.** If a live lookup or the model fails, the app uses saved data or standard letters and labels which one you got.
- **Next:** compute the Medicare/Medi-Cal payment cap from CMS fee schedules, verify more hospitals' price files, and score live photo reading on the eval set.

## Tracks

**Microsoft: Built for the Real World.** We started from the case, not the model. Every bill is a case, and the case problems are the ones a billing advocate sees. Cases close slowly: a patient can't check a bill against a 90 MB price file or a policy PDF, so Recount does it in minutes and shows each step as it finishes. Case data comes in incomplete or wrong: a blurry photo, an unclear hospital name, a missing household fact. So two reads are compared and the patient picks between them, the patient picks the hospital when the name isn't clear, and three questions fill the gaps. Cases go missing: many patients who qualify for free or discounted care never ask, and our audit found 14 hospitals whose own policies conflict with state law. Then we decided step by step what is deterministic and what is agentic. Money, eligibility and law are rules in code that give the same answer every time. Reading photos and writing letters use a model, and each AI step has a check after it: a second read, a dollar check on the letters, or the patient's approval. Each bill lists every AI call with its model in a "Who did what" panel. The model layer can run on Anthropic, Azure OpenAI or Azure AI Foundry without changing the app. In production Azure runs four parts. Document Intelligence reads the charges a second time, gpt-4.1-mini on Azure OpenAI is the backup for letters and chat, AI Search lets Lupa quote a hospital's own policy, and Content Safety checks the chat. The output is a letter the patient can send that day. Line-by-line price checks are live for four San Francisco hospitals, and the app says so for every other hospital.

**Anthropic: Claude for Public Benefit.** Claude does three jobs. It reads blurry phone photos of bills into a strict schema, it writes plain, polite letters from facts we hand it, and as Lupa it answers the patient's questions about their own bill in English or Spanish without promising outcomes. It doesn't decide eligibility or price findings. Those are rules anyone can check. The statewide policy audit used Claude to read 997 policy sentences against the statute, required an exact quote for every verdict, and used a second Claude review to argue the hospital's side of every conflict and likely flag.

**Cal Hacks People-First.** Recount is for people who got a bill they can't pay. It shows one step per screen and asks three questions, not a form. It works in Spanish, has a low vision display mode, and works without an account (signing in is optional and only adds history across devices). The design follows NHS and GOV.UK patterns and WCAG contrast checks. It shows the reason behind every answer and sends nothing without the patient's approval. When the two reads of a bill disagree, it asks the patient instead of choosing quietly. Each bill's "Who did what" panel tells the patient, in plain words and in Spanish, which steps fixed rules did and every AI call that was made.

**CRS: Best Financial AI Agent.** Recount answers a money question: what does this patient really owe, and what should they ask for? The agent reads the bill, matches the hospital, checks every line against the hospital's published prices, applies California's charity care rules to the household's income, and drafts the letters. The model never computes or changes an amount. Duplicates, price gaps, the percent of the poverty line and the eligibility answer are all rules in code, each with its source. The letters are checked after writing: every dollar amount must match the bill or our checks, or it is named for the patient to fix. Nothing is sent without the patient.

**Apify.** Our Actor, Hospital Price & Charity Care Finder, does the hardest data work in the project. It locates and streams hospital price files and reads charity care limits out of policy PDFs with evidence. It works for any US hospital price file, and for California hospitals in the HCAI registry. It runs on Apify as `NXiKTRZKK6p6qCSXk` (public on the Apify Store: https://apify.com/enterprising_arboretum_iq2/hospital-price-and-charity-finder) and runs live in the app in about 17 seconds.

**Convex.** Convex runs the whole case flow: file storage for the photo, scheduled actions for the reading and drafting, and a live step log the phone subscribes to. The patient watches each check finish instead of staring at a spinner.

## Built with

claude, anthropic-api, azure-openai, azure-ai-search, azure-ai-content-safety, azure-ai-document-intelligence, convex, apify, next.js, react, typescript, expo, react-native, python, ijson, pypdf, beautifulsoup


## Links

- Demo video: [link]
- Live app: https://recount-nu.vercel.app
- Android app (APK): https://expo.dev/artifacts/eas/Wcsx-6EwcgMjTyNtfPZ0E4dWNB_XredZx_Wvxz_WQvE.apk
- Code: https://github.com/VolodymyrLinuxovich/recount
- Apify Actor: https://apify.com/enterprising_arboretum_iq2/hospital-price-and-charity-finder
