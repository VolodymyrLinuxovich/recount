# Recount demo script (3 minutes)

The video opens and closes with you on camera at the Cal Hacks venue. Everything in between is a screen recording of https://recount-nu.vercel.app with your voice over it.

The story goes from no hope to hope. First the bill you can't pay. Then the law that says you might not have to.

Sponsors are named where they do the work, not in a list at the end:
- **Anthropic:** Claude reads the bill, writes the letters, answers in Lupa, and reviewed the audit.
- **Microsoft Azure:** Document Intelligence does the second read. AI Search lets Lupa quote a policy. Content Safety screens the chat. Azure OpenAI is the backup model.
- **Apify:** the Actor finds and reads hospital price files.
- **Convex:** each step shows up live on the phone.

## Before recording

- **Venue shots.** Film the opener and the close in front of something that says Cal Hacks, like a banner or the hacking floor. Hold the phone close or use a clip-on mic, because the venue is loud. If the sound is bad, record those two lines again in a quiet hallway and keep only the picture from the venue.
- **Screen voiceover.** Record the screen part first, then record the voice over it somewhere quiet.
- **Warm the site.** Run the sample bill once, then delete it (My bills, open it, "Delete this bill"). Open `/audit` once so the map is cached.
- **Files.** Put `bill-page-1.png`, `bill-page-2.png` and `insurance-statement.png` from `~/Desktop/recount-demo-files/` on the recording device. On a phone, AirDrop them to Photos.
- **Screen.** Use phone width (390 x 844), Do Not Disturb on, brightness up.
- **Waiting.** Cut it out in editing. Keep 2 or 3 seconds of the steps ticking.

---

## 0:00 to 0:22. No hope (on camera, at the venue)

Talk to the camera like it's one friend. Slow, calm, no smile yet.

> Hi, I'm Vova, and I'm at Cal Hacks. A lot of people here are first gen. Maybe you know this moment. A bill comes from the hospital. Your mom opens it at the kitchen table. Twelve thousand dollars. It's full of codes, it's in English, and you're the one translating it. So they pay what they can, or it goes to collections, and it stays with them for years.

## 0:22 to 0:42. Hope (still on camera)

Change your tone here. Lean in a little.

> Here's what nobody told them. In California, the law says that bill could be discounted, or even free. So I built Recount. It's like having someone in the family who knows the system. Take a photo of the bill, and it tells you, in your language, what the law already gives you.

Cut to the screen.

## 0:42 to 1:00. A real bill, two pages (Anthropic, Azure, Convex)

**Screen:** Tap "Take a photo of your bill" and pick `bill-page-1.png`. Tap "Add another page" and pick `bill-page-2.png`. Tap "Check my bill". Show the steps ticking for 2 or 3 seconds, then cut to "Both reads agree on every amount".

> A real bill has more than one page, so you can send up to six photos. Claude reads the whole bill. Azure AI Document Intelligence reads the charges again, and code compares the two, line by line. Each step shows up live through Convex.

## 1:00 to 1:18. What's wrong with the bill (Apify)

**Screen:** Home, then "Try a sample bill". Cut the reading. Show the "Billed twice" card, then the "Charged more than their own list price" card.

> This sample ER bill is priced from the hospital's real published charges. The blood count is billed twice. The X-ray costs more than the hospital's own list price. My Apify Actor finds and reads that price file. These checks are plain code, not AI.

## 1:18 to 1:33. Three questions, then the answer

**Screen:** 1 person, 20000 a year, no insurance. Hold on "You likely owe $0".

> Three questions. One person, twenty thousand a year, no insurance. This hospital's own policy gives free care up to 138% of the poverty line. So this patient likely owes zero. Rules decide that, never the model.

## 1:33 to 1:45. Letters (Anthropic)

**Screen:** "It's for me", fill the details, show one letter with the hospital's address, approve, then "How to send my letters".

> Claude writes the letters, using only the facts on screen. Then code checks every dollar in them. Recount never sends anything for you. You read, you approve, you send.

## 1:45 to 2:08. Lupa (Anthropic, Azure)

**Screen:** Tap "Ask". Tap the paperclip, pick `insurance-statement.png`, type "Is this right?" and send. Let the answer stream for a few seconds. Then send "What's the capital of France?" and show the refusal.

> Got a question? Ask Lupa, in plain words, in English or Spanish. That's Claude. Attach the statement your insurance sent and ask "is this right?" Azure AI Search finds the hospital's own policy words, and Azure Content Safety checks every message. If Claude is ever down, Azure OpenAI takes over. And it only talks about your bill.

## 2:08 to 2:35. The hospitals themselves (Anthropic)

**Screen:** Tap "Hospital audit". Show 463, 14 and 47. Search "PIH Health Whittier", open it, scroll through the quotes.

> Then I checked the hospitals themselves. I read the financial assistance policies of all 470 California hospitals on file with the state. Claude reviewed every suspicious sentence and had to quote it. 14 conflict with state law, and 47 more likely do. This one counts your assets, and allows a lien on the home of a patient who qualifies for help.

## 2:35 to 2:55. Close (on camera, at the venue)

Back to you. Now you can smile.

> Recount works today, on the web, Android and iPhone, in English and Spanish. For the kid translating a bill at the kitchen table, now there's someone to ask. That bill might be one your family never owed. Check your bill. And check your hospital.

---

## Cuts if you run long

1. The off-topic question in Lupa (saves 6 s). Keep the line "it only talks about your bill".
2. "It's like having someone in the family who knows the system" (saves 4 s).

## Add back if you run short

- **Who did what** (10 s), after Lupa. Screen: "More about this bill", scroll to "Who did what on this bill".
  > Every bill shows who did what. Which steps were rules, and every AI call with its model and time.
- "The Actor gave me prices for 336 hospitals, each from its own file" (4 s), after the Apify line.

Don't cut the opener, the two-page upload or the audit.

## Optional extra shot: Medicare or Medi-Cal

Run the sample bill. On "Did you have health insurance for this visit?" tap "Yes", then "Medi-Cal". Answer the rest. On the answer screen, show the note "You have Medi-Cal, but the bill asks you to pay".

> Have Medi-Cal? Then the hospital usually can't bill you for covered care. Recount catches it.

---

## Numbers used above (check before recording)

| Item | Value | Source |
|---|---|---|
| Audit | 470 hospitals, 463 readable | `public/audit/findings.json` |
| Audit results | 14 conflict, 47 likely | strongest verdict per hospital |
| PIH Health Whittier, assets | "Consider individual or family net worth including all liquid and non-liquid assets owned" | charity care policy p.4 |
| PIH Health Whittier, lien | "when income does not exceed 400% FPL, PIH's collection agency may file a lien on a primary residence" | debt collection policy p.3 |
| Sample bill total | $12,741.00 ("twelve thousand") | `convex/lib/sampleBill.json` |
| 1 person, $20,000 | 125.3% of the poverty line | 2026 FPL $15,960 |
| ZSFG free care cutoff | 138% | `convex/lib/snapshots/zsfg.json` |
| Apify statewide runs | 336 hospitals with usable ER prices, each file verified as the hospital's own | `convex/lib/statewidePrices.json`, `pipeline/out/price_files.json` |
| Pages per bill | up to 6 photos | `convex/lib/pages.ts` |

## Words

- Say "conflicts with state law", never "breaks the law". I read the written policy, not what billing actually does.
- Say "likely owes", never "owes". The hospital decides.
- Say "could be discounted, or even free", never "is free". It depends on income and the hospital.
- Don't say Azure reads the whole bill. Claude reads the bill, and Azure reads the charges a second time.
- Don't promise password reset. There is none.
