# Audit spot-check

Checked 2026-10-24 against `recount/public/audit/findings.json` (generated 03:34) and `recount/convex/lib/hospitalIndex.json` (05:30). No data or code was changed.

## Result

| Check | Sample | Quote found on cited page | Verdict / value correct |
|---|---|---|---|
| `conflict` findings | all 22 (15 hospitals) | 22/22 | **22/22** (2 need a quote or explanation fix) |
| `likely` findings | 5 random | 5/5 | **1/5** |
| All findings | 27 | 27/27 (100%) | **23/27 (85%)** |
| Free-care cutoffs | 20 random of the 74 that have one | 20/20 | **19/20 (95%)** |

Every `conflict` verdict holds up. The errors cluster in two `likely` templates that repeat across hospital systems, so each one affects many hospitals:

1. **LIENS `likely` on Adventist Health: 24 hospitals, false positive.** The rule text says liens on real property are banned for everyone. The statute is narrower. HSC 127425(h) bans liens only for patients who are eligible under the charity care or discount payment policy. The Adventist debt-collection policy (p7, §g) already says: "For patients found eligible for Charity Care or Discounted Care … the Collection Agency may not use wage garnishments or file a lien against any real property." The flagged quote is only the federal 501(r) list of what counts as an ECA. Fix the rule text to include "for patients eligible under the charity care or discount payment policies", then re-review all 47 `likely` and 91 `ask` LIENS findings. The 28 findings quoting "Lien on a residence or any other personal or real property;" look like the same federal-definition pattern.
2. **ASSETS `likely` on CommonSpirit: 29 hospitals, false positive.** The flagged sentence ("may consider the 'monetary assets' of the patient's Family", p5) comes from the multistate policy. The same PDF includes the California Addendum G-003A-1 (p15+). It says "If any provision of this Addendum is in conflict … this Addendum shall control." It also limits documents to "income tax returns or recent pay stubs" and says it "may accept documentation of assets but shall not require it" (p24). Assets are counted only for Medicare cost-sharing waivers, which federal law requires. These should be `ask` at most, and probably not flagged at all.

Credit reporting: HSC 127425(f)(1) applies to all patients, so the CREDIT_REPORTING rule text is accurate.

## Findings checked

Sample: all 22 `conflict` findings, plus 5 `likely` findings picked with `random.seed(20261024)`. Quote matching ignores case and punctuation and searches the PDF text extracted with PyMuPDF.

| Hospital | Rule | Verdict | Quote found? | Fair? | Note |
|---|---|---|---|---|---|
| Contra Costa Regional | ASSETS | conflict | yes, p2 | yes | Net assets capped at $2,000 / $3,000 |
| Contra Costa Regional | DEADLINE | conflict | yes, p3 | yes | "Requests initiated beyond 180 days of initial billing will be denied." |
| Gateways Hospital | ASSETS | conflict | yes, p6 | yes | p11 also adds part of monetary assets to income |
| Kern Medical Center | CREDIT_REPORTING | conflict | yes, p6 | yes | |
| MarinHealth | CREDIT_REPORTING | conflict | yes, p6 | yes, with caveat | p4 says "will not furnish information regarding a medical debt to a consumer credit reporting agency". The policy contradicts itself. The explanation should mention p4. |
| Mayers Memorial | ASSETS | conflict | yes, p1 | yes | $5,000 asset cap |
| Oroville Hospital | CREDIT_REPORTING | conflict | yes, p1 | yes | |
| Pacifica Hospital of the Valley | ASSETS | conflict | yes, p4 | yes | Policy dated 1/1/2024, before AB 2297 |
| PIH Downey | ASSETS | conflict | yes, p4 | yes | |
| PIH Downey | CREDIT_REPORTING | conflict | yes, p3 | yes | |
| PIH Downey | LIENS | conflict | yes, p3 | verdict yes, wrong quote | The quoted sentence covers income above 400% FPL, and a lien is legal for those patients. The violation is in the next sentence: "Under certain circumstances when income does not exceed 400% FPL, PIH's collection agency may file a lien on a primary residence". Use that sentence as the quote. |
| PIH Good Samaritan | ASSETS | conflict | yes, p4 | yes | Same PIH document |
| PIH Good Samaritan | CREDIT_REPORTING | conflict | yes, p3 | yes | Same PIH document |
| PIH Good Samaritan | LIENS | conflict | yes, p3 | verdict yes, wrong quote | Same as PIH Downey |
| PIH Whittier | ASSETS | conflict | yes, p4 | yes | Same PIH document |
| PIH Whittier | CREDIT_REPORTING | conflict | yes, p3 | yes | Same PIH document |
| PIH Whittier | LIENS | conflict | yes, p3 | verdict yes, wrong quote | Same as PIH Downey |
| Rady Children's San Diego | CREDIT_REPORTING | conflict | yes, p9 | yes | |
| San Joaquin Valley Rehab | ASSETS | conflict | yes, p2 | yes | |
| Stanislaus Surgical | ASSETS | conflict | yes, p4 | yes | Denies if assets exceed "a ceiling" |
| UCI Health Fountain Valley | ASSETS | conflict | yes, p7 | yes | Tenet policy approved 2022 |
| UCI Health Los Alamitos | ASSETS | conflict | yes, p10 | yes | |
| Glendale Memorial | ASSETS | likely | yes, p5 | **no** | CommonSpirit California addendum controls (see item 2 above) |
| Mercy Medical Center Redding | ASSETS | likely | yes, p5 | **no** | CommonSpirit California addendum controls (see item 2 above) |
| Adventist Health Twin Cities | LIENS | likely | yes, p6 | **no** | p7 §g already bans liens for eligible patients (see item 1 above) |
| Adventist Health Glendale | LIENS | likely | yes, p6 | **no** | p7 §g already bans liens for eligible patients (see item 1 above) |
| Hollywood Presbyterian | ASSETS | likely | yes, p1 | yes | Form asks for bank statements and account balances |

Missed findings noticed along the way (not counted in the accuracy rate):
- **Contra Costa, INCOME_PROOF:** no finding. p2 says income documentation is "recent pay stubs or a written self-attestation … and statements from financial institutions".
- **Hollywood Presbyterian, INCOME_PROOF:** no finding. The form asks for "photocopies of pay-checks and bank statements".
- **Contra Costa, CREDIT_REPORTING:** currently `ask`. p4 bars reporting only "within 180 days of initial billing", which implies reporting is allowed after that. It is probably at least `likely`.

## Free-care cutoffs checked

Sample: 20 random hospitals from the 74 with a non-null `freeCareMaxFplPct`. The other 396 of 470 have no cutoff.

| Hospital | Cutoff in index | Quote found? | Correct? | Note |
|---|---|---|---|---|
| Southern Inyo | 200 | yes, p1 (also p6) | yes | |
| Adventist Health Lodi Memorial | 200 | yes, p9 | yes | |
| Thousand Oaks Surgical (Los Robles) | 400 | yes, p9 (also p2) | yes | HCA policy writes off the full balance for 0–400% FPL |
| Adventist Health Sierra Vista | 200 | yes, p9 | yes | |
| Loma Linda Univ. East Campus | 200 | yes, p7 | yes | |
| San Jose Behavioral Health | 133 | yes, p11 | yes | |
| Sacramento Rehabilitation | 400 | yes, p1 | yes | Vibra rehab policy: "at or below 400% of FPL may receive free care" |
| Loma Linda Behavioral Medicine | 200 | yes, p7 | yes | |
| Mammoth Hospital | 200 | yes, p6 | yes | `discountMaxFplPct` is null; policy says 450 (p7) |
| Vibra Hospital of Sacramento | 200 | yes, p1 | yes | |
| Adventist Health Ukiah Valley | 200 | yes, p9 | yes | |
| Loma Linda Surgical | 200 | yes, p7 | yes | |
| Tarzana Treatment Center | 200 | yes, p4 | yes | Table says "Less than 200%", so it is strictly below 200 |
| College Medical Center South Campus | 200 | yes, p4 | yes | `discountMaxFplPct` is null; policy says 400 |
| Central California Rehabilitation | 400 | yes, p1 | yes | Vibra rehab policy |
| **Palomar UCSD Poway** | **400** | yes, p10 | **no, should be 250** | The quote is the overall eligibility ceiling. Same page: "earn 250% or less of the FPG … are eligible for Full Charity Care"; 251–400% are reduced to Medicare or Medi-Cal rates. `discountMaxFplPct` is null and should be 400. |
| Community Hospital of the Monterey Peninsula | 300 | yes, p4 | yes | |
| Fairchild Medical Center | 200 | yes, p5 | yes | |
| Oak Valley Hospital District | 200 | yes, p6 | yes | |
| Adventist Health Tehachapi Valley | 200 | yes, p9 | yes | |

All 12 hospitals now at 400% were also checked. The 6 on the HCA template (Good Samaritan San Jose, Los Robles ×2, Mission Oaks, Riverside Community, Thousand Oaks) and the 4 Vibra rehab hospitals are correct. **Palomar Escondido** uses the same wording as Poway, so it is also wrong and should be 250. The bug of 39 hospitals at 400% with a 200% quote no longer appears in this file: only 12 hospitals are at 400%, and none has a 200% full-charity quote.

## Fix list

1. Palomar UCSD Escondido and Poway: change `freeCareMaxFplPct` from 400 to 250, and `discountMaxFplPct` from null to 400.
2. LIENS rule: add the eligible-patient limit from HSC 127425(h). Clear the 24 Adventist `likely` findings and re-review the other LIENS findings.
3. CommonSpirit ASSETS `likely` (29 hospitals): clear them or downgrade to `ask`, because the California addendum in the same PDF controls.
4. PIH Downey, Good Samaritan and Whittier LIENS: replace the quote with the sentence about income at or below 400% FPL.
5. MarinHealth CREDIT_REPORTING: mention the contradicting p4 ban in the explanation.
6. Optional: fill in null `discountMaxFplPct` for Mammoth (450) and College Medical Center South Campus (400). Consider adding INCOME_PROOF findings for Contra Costa and Hollywood Presbyterian.
