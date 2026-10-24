"""California hospital fair-pricing rules, as candidate detectors.

Each rule says what the law forbids, cites it, and finds sentences in a hospital policy
that might break it. A candidate is NOT a finding: phrases like "we will not report to
credit agencies" mention the topic while complying. Candidates go to review (review.py),
and only sentences judged to impose the forbidden thing are reported.

Statute text: Health & Safety Code 127400-127446 as amended by AB 1020 (2021),
AB 2297 and SB 1061 (2024, effective 2025-01-01). Quotes from HCAI PIL 24-03 and the
code as published (see pipeline data ca_law.json).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

PIL_24_03 = "https://hcai.ca.gov/document/pil-24-03"
HSC = "https://codes.findlaw.com/ca/health-and-safety-code/hsc-sect-{}/"


@dataclass
class Rule:
    id: str
    title: str
    cite: str
    url: str
    law_quote: str
    doc_types: tuple[str, ...]
    patterns: list[str]
    # Sentences matching these are statements of compliance, not violations.
    complies: list[str] = field(default_factory=list)
    question: str = ""

    def __post_init__(self) -> None:
        self._pat = [re.compile(p, re.I) for p in self.patterns]
        self._ok = [re.compile(p, re.I) for p in self.complies]

    def match(self, sentence: str) -> str | None:
        """Return the matched phrase if this sentence is a candidate, else None."""
        for p in self._pat:
            m = p.search(sentence)
            if m:
                if any(o.search(sentence) for o in self._ok):
                    return None
                return m.group(0)
        return None


NEG = r"(not|never|no longer|shall not|will not|won't|does not|do not|may not|prohibit\w*)"

RULES: list[Rule] = [
    Rule(
        id="DEADLINE",
        title="Puts a time limit on applying",
        cite="HSC 127405(e)(3), as amended by AB 2297",
        url=PIL_24_03,
        law_quote="shall not impose time limits for applying for charity care or discounted payments, nor deny eligibility based on the timing of a patient's application.",
        doc_types=("charity_care", "discount_payment", "application"),
        patterns=[
            r"\b2[0-9]0[- ]day",
            r"\bwithin\s+(\d+|thirty|sixty|ninety|one hundred \w+)\s+(calendar\s+)?(days|months)\b",
            r"\bno later than\b",
            r"\bapplication period\b",
            r"\bdeadline\b",
            r"\b(must|should|shall)\s+(be\s+)?(submit|return|complet|appl)\w*.{0,80}\b(within|by|before)\b",
        ],
        complies=[
            rf"\b{NEG}\b.{{0,40}}(time limit|deadline)",
            r"(no|without)\s+(time limit|deadline)",
            r"\bat any time\b",
            r"hospital (will|shall) (respond|notify|process|determine|make a determination).{0,60}within",
        ],
        question="Does this sentence require the patient to apply within a time limit, or deny or reduce help because of when they applied?",
    ),
    Rule(
        id="ASSETS",
        title="Counts the patient's savings or assets",
        cite="HSC 127405(b)(1), as amended by AB 2297",
        url=HSC.format("127405"),
        law_quote="In determining eligibility under its discount payment policy or charity care policy, a hospital shall not consider the monetary assets of the patient.",
        doc_types=("charity_care", "discount_payment", "application"),
        patterns=[
            r"\bmonetary assets?\b",
            r"\b(liquid|available|total|personal)\s+assets?\b",
            r"\bassets?\s+(test|limit|threshold|exceed|of more than|in excess)",
            r"\bsavings\s+(account|balance)s?\b",
            r"\bbank\s+(account\s+)?statements?\b",
            r"\bnet worth\b",
            r"\bstocks?,?\s+bonds?\b",
        ],
        complies=[
            rf"\b{NEG}\b.{{0,60}}(consider|count|use|review|ask|require).{{0,40}}(assets?|savings)",
            r"(assets?|savings).{0,40}\b(are|is|will be)\s+not\s+(considered|counted|used)",
            r"health savings account",
            r"medicare (bad debt|cost[- ]shar)",
        ],
        question="Does this sentence make the hospital consider the patient's monetary assets (savings, bank balances, investments) when deciding eligibility?",
    ),
    Rule(
        id="CREDIT_REPORTING",
        title="Reports hospital debt to credit bureaus",
        cite="HSC 127425(f), as amended by AB 2297 and SB 1061",
        url=PIL_24_03,
        law_quote="Reporting adverse information about a patient's hospital debt to a consumer credit reporting agency is no longer allowed.",
        doc_types=("debt_collection", "charity_care", "discount_payment"),
        patterns=[
            r"\b(report|reported|reporting)\b.{0,60}\bcredit\s+(reporting\s+)?(agenc|bureau)",
            r"\bcredit\s+(reporting\s+)?(agenc|bureau)\w*.{0,60}\breport",
            r"\bcredit report(s|ing)?\b",
        ],
        complies=[
            rf"\b{NEG}\b.{{0,60}}(report|reported|reporting)",
            r"(report|reporting).{0,30}\b(is|are)\s+(not|no longer)\b",
            r"\bprohibit",
            r"^\s*no\b",
            r"void and unenforceable",
        ],
        question="Does this sentence allow the hospital or its collectors to report a patient's hospital debt to a credit reporting agency?",
    ),
    Rule(
        id="LIENS",
        title="Allows liens on a patient's home or property",
        cite="HSC 127425(h), as amended by AB 2297",
        url=PIL_24_03,
        law_quote="liens on any real property owned by the patient are prohibited.",
        doc_types=("debt_collection",),
        patterns=[r"\bliens?\b", r"\breal property\b", r"\bprimary residence\b", r"\bforeclos"],
        complies=[
            rf"\b{NEG}\b.{{0,60}}(lien|real property|residence|foreclos)",
            r"(lien|real property).{0,40}\b(prohibited|not permitted|not allowed)",
        ],
        question="Does this sentence allow a lien on, foreclosure of, or sale of a patient's real property (not just liens on injury settlements)?",
    ),
    Rule(
        id="INCOME_PROOF",
        title="Demands income proof beyond pay stubs or tax returns",
        cite="HSC 127405(e)(1)",
        url=PIL_24_03,
        law_quote="documentation of income is limited to recent paystubs or income tax returns for both programs",
        doc_types=("charity_care", "discount_payment", "application"),
        patterns=[
            r"\b(must|shall|required to|are required|is required)\b.{0,120}\b(bank statements?|social security (award|statement)|unemployment|letter from (your )?employer|proof of (assets|residency|address)|photo id|identification|w-?2)",
            r"\b(no|without)\b.{0,40}\bincome\b.{0,80}\b(ineligible|not eligible|denied|will not qualify)",
            r"\bincomplete\b.{0,60}\b(denied|ineligible|will not be (processed|considered))",
        ],
        complies=[r"\bmay\b.{0,30}\b(accept|provide|submit)\b.{0,40}\bnot required\b", r"\boptional\b"],
        question="Does this sentence REQUIRE income documents other than recent pay stubs or tax returns, or deny help to patients who can't provide them (e.g. no verifiable income)?",
    ),
    Rule(
        id="MEDICAL_FIRST",
        title="Requires applying for Medi-Cal or other coverage first",
        cite="HSC 127405(b)(2)",
        url=HSC.format("127405"),
        law_quote="A hospital may not require a patient to apply for Medicare, Medi-Cal, or other coverage before the patient is screened for, or provided, discounted payment. (A hospital may require participation in Medi-Cal eligibility screening.)",
        doc_types=("charity_care", "discount_payment", "application"),
        patterns=[
            r"\b(must|shall|required to|are required)\b.{0,60}\bapply\b.{0,40}\b(\bmedi-?cal\b|\bmedicaid\b|\bmedicare\b|covered california|other (coverage|programs?))",
            r"\b(denial|denied)\b.{0,40}\b(medi-?cal|medicaid)\b.{0,60}\b(before|prior to|required)",
        ],
        complies=[r"\bscreening\b", r"\bnot (be )?required\b"],
        question="Does this sentence require the patient to APPLY for Medi-Cal, Medicare or other coverage (not just be screened) before they can get charity care or a discount?",
    ),
]

FPL_RE = re.compile(r"(\d{3})\s*%\s*(of\s+)?(the\s+)?(federal poverty|FPL|poverty)", re.I)


def split_sentences(text: str) -> list[str]:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s*\n\s*", " ", text)
    parts = re.split(r"(?<=[.;:!?])\s+(?=[A-Z(•\d])", text)
    return [p.strip() for p in parts if len(p.strip()) > 20]


def candidates(text: str, doc_type: str) -> list[dict]:
    out = []
    for s in split_sentences(text):
        for rule in RULES:
            if doc_type not in rule.doc_types:
                continue
            hit = rule.match(s)
            if hit:
                out.append({"rule": rule.id, "sentence": s, "hit": hit})
    return out


def fpl_thresholds(text: str) -> list[int]:
    """Every '%' of the poverty line a policy mentions (used to spot discount caps under 400%)."""
    return sorted({int(m.group(1)) for m in FPL_RE.finditer(text) if 50 <= int(m.group(1)) <= 1000})


RULES_BY_ID = {r.id: r for r in RULES}
