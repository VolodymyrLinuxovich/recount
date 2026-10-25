# Medicare, Medi-Cal and how a hospital gets paid

What Recount's coverage rules (`convex/lib/coverage.ts`) are based on, and what they don't do. Every citation below
was checked against the primary source on 2026-10-24: Cornell LII for the U.S. Code, eCFR for federal regulations, the
Legislature's own code database for California law, and CMS for Medicare guidance. Not legal advice.

## How a bill is made

1. The patient gets care.
2. The physician, nurse or care coordinator documents it, and it is coded: CPT and HCPCS codes for services, revenue
   codes for the hospital department.
3. The hospital sends a claim to the payer: a private insurer, Medicare (the UB-04 / CMS-1450 form, 42 CFR 424.32) or
   Medi-Cal.
4. The payer reviews the claim and reimburses the hospital at its own rate. It sends the patient a statement (an
   Explanation of Benefits, or a Medicare Summary Notice).
5. The hospital bills the patient the rest: deductible, copay, coinsurance, or anything the payer didn't cover.

Uninsured patients skip steps 3 and 4 and get the full list price. That's why the California discount rule caps what a
qualifying patient pays at what Medicare or Medi-Cal would pay, whichever is greater
([HSC 127405(d)(1)](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=127405)).
Recount explains that cap but can't compute it, because hospitals don't publish their Medicare or Medi-Cal rates per
service.

## The coverage question

The third question ("Did you have health insurance for this visit?") now asks which kind: none; private, job or Covered
California; Medicare; Medi-Cal; or Medicare and Medi-Cal. The answer is stored as `household.coverage`. `insured` is
`coverage !== "none"`, so older app builds that send only yes or no still work. They just get no coverage findings.

## The four rules

All four come from the patient's own answer, not from the bill, so they are marked "check" and say so. They run after
the questions (`cases.submitHousehold` works the findings out again) and show on the answer screen and under What we
found. Each one has a fixed letter sentence with its citation (`COVERAGE_LAW_LINE`), used word for word in the
template letters and given to the model for the dispute letter.

### 1. Medi-Cal patient billed beyond share of cost (`MEDI_CAL_BALANCE_BILL`)

- **When:** coverage is Medi-Cal and the bill asks for $1 or more.
- **Law:** [Welfare and Institutions Code 14019.4](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=WIC&sectionNum=14019.4).
  (a) A provider that has the patient's Medi-Cal card or other proof of eligibility "shall not seek reimbursement nor
  attempt to obtain payment for the cost of those covered health care services" from the patient. (d) A provider that
  gets proof of eligibility after sending the bill to collections must tell the collector to stop and notify the
  patient. (g) It doesn't apply to an unmet share of cost (spend-down) for the month.
- **Amount:** what the bill asks for. Other findings on the bill show $0, so the money isn't counted twice.
- **Limits:** Recount doesn't ask for the share of cost, so the letter asks the hospital to remove "any amount above my
  share of cost". It can't tell whether a service is covered by Medi-Cal, or whether the hospital knew about the
  coverage.

### 2. Medicare and Medi-Cal patient billed Medicare cost sharing (`QMB_BILLED`)

- **When:** coverage is Medicare and Medi-Cal, and the bill asks for $1 or more.
- **Law:** [42 U.S.C. 1396a(n)(3)(B)](https://www.law.cornell.edu/uscode/text/42/1396a) (Social Security Act
  1902(n)(3)(B)): a Qualified Medicare Beneficiary "shall not have any legal liability to make payment" for Medicare
  cost sharing. Providers agree to this in their Medicare provider agreement
  ([42 U.S.C. 1395cc(a)(1)(A)(ii)](https://www.law.cornell.edu/uscode/text/42/1395cc)). CMS's fact sheet
  [MLN7936176](https://www.cms.gov/files/document/mln7936176-prohibition-billing-qualified-medicare-beneficiaries.pdf)
  (September 2025): providers "must not bill Medicare patients in the Qualified Medicare Beneficiary (QMB) group for
  Medicare Part A or Medicare Part B cost sharing". It applies even when Medicaid pays nothing, and QMBs can't choose to
  pay. For Medi-Cal patients who aren't QMBs, 14019.4 (rule 1) still bars billing for covered services.
- **Amount:** what the bill asks for. Other findings show $0.
- **Limits:** not every person with Medicare and Medi-Cal is a QMB. The text says "if you're a QMB" and tells the
  patient to check their card.

### 3. Medicare patient with no Medicare payment on the bill (`MEDICARE_NOT_BILLED`)

- **When:** coverage is Medicare (or both), there's no insurance statement, the bill shows $0 insurance payments, and it
  asks for $1 or more. With a statement, the statement rules already check for a missing plan payment
  (`INSURANCE_NOT_APPLIED`).
- **Law:** no statute says a hospital "must submit" a claim the way
  [42 U.S.C. 1395w-4(g)(4)](https://www.law.cornell.edu/uscode/text/42/1395w-4) does for physicians and suppliers. The
  provider agreement gets the same result.
  [42 U.S.C. 1395cc(a)(1)(A)(i)](https://www.law.cornell.edu/uscode/text/42/1395cc) and
  [42 CFR 489.21](https://www.ecfr.gov/current/title-42/section-489.21)(a) and (b)(4) bar charging a patient for
  services Medicare would pay for if the hospital had filed properly.
  [42 CFR 489.30](https://www.ecfr.gov/current/title-42/section-489.30) lists what the hospital may charge: the
  deductible and coinsurance. Claims are due within 1 calendar year of the date of service
  ([42 CFR 424.44(a)(1)](https://www.ecfr.gov/current/title-42/section-424.44)).
- **Amount:** $0, because Recount doesn't know the Medicare amount. In 2026 the Part A deductible is $1,736 and the
  Part B deductible is $283
  ([CMS fact sheet, November 14, 2025](https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles)).
  The app doesn't use these yet.
- **Limits:** the claim may still be pending, Medicare may have denied it, or the patient may have a Medicare Advantage
  plan. The letter only asks whether the claim went to Medicare.

### 4. Uninsured and Medi-Cal-likely: retroactive Medi-Cal (`RETRO_MEDI_CAL`)

- **When:** coverage is none, and income is at or below 138% of the 2026 poverty line (the Medi-Cal limit for most
  adults).
- **Law:** [42 U.S.C. 1396a(a)(34)](https://www.law.cornell.edu/uscode/text/42/1396a) and
  [42 CFR 435.915(a)](https://www.ecfr.gov/current/title-42/section-435.915): coverage can start "no later than the
  third month before the month of application" for someone who was eligible then. Pub. L. 119-21 (2025) section 71112
  cuts this for applications made on or after January 1, 2027: 1 month for ACA expansion adults, 2 months for everyone
  else. The patient text says so. The letter sentence doesn't give a number of months, so it stays true after the
  change.
  [Welfare and Institutions Code 14019.3](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=WIC&sectionNum=14019.3)(e):
  once Medi-Cal pays, the provider must return what the patient paid. (h) and (i): if it doesn't within 90 days of the
  patient's written request, DHCS can enforce it (the Conlan beneficiary reimbursement process).
- **Amount:** $0. It's a next step, not a billing error.
- **Limits:** 138% is a screen, not a determination. Medi-Cal also looks at age, pregnancy, disability and other rules.
  The finding says "may" and links to the DHCS application page.

## What's not covered

- **Medi-Cal managed care plans and Medicare Advantage** have their own claim and appeal rules. The insurance statement
  rules treat them as plans; the coverage rules only know "Medicare" and "Medi-Cal".
- **Hospital Presumptive Eligibility.** A participating hospital can give temporary Medi-Cal on the spot. HSC 127410(a)
  requires the hospital's notice to mention it. Recount doesn't know which hospitals take part, so it doesn't mention it.
- **The Medi-Cal application duty.** If a patient shows no coverage, the hospital must give them a Medi-Cal application
  ([HSC 127420(b)(4)](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=127420)).
  Recount's retroactive Medi-Cal letter asks for help applying, but it doesn't cite this section.
- **New screening duty from July 1, 2027.** HSC 127406 (AB 1312, 2025) will require hospitals to screen patients for
  charity care and to presume eligibility for patients on CalFresh, CalWORKs or WIC, or who are homeless. Recount
  doesn't use it yet.

## Tests

`tests/coverage.test.ts`: each rule fires and stays quiet in the right cases, money is counted once, Spanish uses usted,
and each dispute letter quotes its law line in English, with the Spanish line in the patient's copy.
