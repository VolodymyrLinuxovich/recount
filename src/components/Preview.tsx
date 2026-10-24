"use client";

import { useState } from "react";
import { Answer } from "./Answer";
import { BillMarkup } from "./BillMarkup";
import { HouseholdForm } from "./HouseholdForm";
import { useT } from "./i18n/I18nProvider";
import { Letters } from "./Letters";
import { Sources } from "./Sources";
import { StepLog } from "./StepLog";
import type { CaseView } from "./types";

const PRICE_FILE = "https://example.org/zsfg-standard-charges.json";

const base: CaseView = {
  _id: "preview",
  status: "needs_household",
  sample: true,
  fileUrl: null,
  billSource: "sample-source",
  steps: [
    { _id: "1", key: "read", label: "Loaded the sample bill (6 lines) from its source data", state: "done" },
    { _id: "2", key: "hospital", label: "Using a saved lookup of ZSFG (2026-10-20)", detail: "Saved run of the same Apify Actor, not fetched just now.", state: "done" },
    { _id: "3", key: "check", label: "Found 3 things to question", detail: "Up to $3,412.00 in questionable charges", state: "done" },
  ],
  bill: {
    hospitalName: "Zuckerberg San Francisco General Hospital and Trauma Center",
    isMedicalBill: true, hospitalWebsite: null, hospitalAddress: null, patientAddress: null,
    billingPhone: "(628) 206-8448",
    accountNumber: "SAMPLE-40017782",
    patientName: "Alex Rivera",
    statementDate: "2026-10-01",
    serviceDate: "2026-09-12",
    insurancePayer: null,
    insurancePaid: 0,
    adjustments: 0,
    patientPaid: 0,
    totalCharges: 9876.0,
    amountDue: 9876.0,
    isItemized: true,
    lines: [
      { date: "2026-09-12", code: "99285", revCode: "0450", description: "ER visit, high severity", quantity: 1, charge: 4210 },
      { date: "2026-09-12", code: "71046", revCode: "0320", description: "Chest X-ray, 2 views", quantity: 1, charge: 612 },
      { date: "2026-09-12", code: "80053", revCode: "0301", description: "Comprehensive metabolic panel", quantity: 1, charge: 486 },
      { date: "2026-09-12", code: "85025", revCode: "0305", description: "Complete blood count", quantity: 1, charge: 214 },
      { date: "2026-09-12", code: "80053", revCode: "0301", description: "Comprehensive metabolic panel", quantity: 1, charge: 486 },
      { date: "2026-09-12", code: "J1885", revCode: "0636", description: "Ketorolac injection 15 mg", quantity: 2, charge: 3868 },
    ],
    unreadable: [],
  },
  hospital: {
    key: "zsfg",
    name: "ZSFG",
    source: "snapshot",
    fetchedAt: "2026-10-20T18:00:00Z",
    mrf: { url: PRICE_FILE, lastUpdated: "2026-07-01", prices: {} },
    fap: { url: "https://example.org/zsfg-financial-assistance.pdf", freeCareMaxFplPct: 200, discountMaxFplPct: 500, quotes: [], phone: null, applicationUrl: null },
    warnings: [],
  },
  findings: [
    {
      id: "dup-4",
      kind: "DUPLICATE_LINE",
      lines: [2, 4],
      amount: 486,
      title: "Comprehensive metabolic panel is billed twice",
      detail: "Lines 3 and 5 have the same code, date and amount. Sometimes that's real (two doses), often it's a double entry. Ask the hospital to confirm or remove it.",
      evidence: [
        { label: "Code", value: "80053" },
        { label: "Date", value: "2026-09-12" },
        { label: "Amount", value: "$486.00" },
      ],
      confidence: "check",
    },
    {
      id: "list-5",
      kind: "ABOVE_LIST_PRICE",
      lines: [5],
      amount: 2926,
      title: "Ketorolac injection 15 mg is billed above the hospital's own list price",
      detail: "Billed $1,934.00 per unit, but the hospital's published standard charge is $471.00.",
      evidence: [
        { label: "Billed per unit", value: "$1,934.00" },
        { label: "Published gross charge", value: "$471.00", source: PRICE_FILE },
      ],
      confidence: "high",
    },
    {
      id: "cash-0",
      kind: "CASH_PRICE_GAP",
      lines: [0],
      amount: 1684,
      title: "ER visit, high severity: the cash price is $2,526.00",
      detail: "You were billed $4,210.00. The hospital publishes a discounted cash price of $2,526.00 per unit for this service. As a self-pay patient you can ask for it.",
      evidence: [
        { label: "Billed", value: "$4,210.00" },
        { label: "Published cash price", value: "$2,526.00", source: PRICE_FILE },
      ],
      confidence: "high",
    },
  ],
};

const answered: CaseView = {
  ...base,
  status: "ready",
  household: { size: 2, annualIncome: 28000, insured: false },
  eligibility: {
    povertyLine: 21150,
    fplPct: 132.4,
    tier: "FREE",
    headline: "You likely qualify for free care",
    owedEstimate: 0,
    medicalLikely: true,
    basis: [
      { rule: "Poverty line", text: "2026 federal poverty guideline for a household of 2: $21,150. Your income is 132.4% of it.", source: "https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines" },
      { rule: "ZSFG free care", text: "The hospital's own policy gives free care up to 200% of the poverty line. You're at 132.4%.", source: "https://example.org/zsfg-financial-assistance.pdf" },
    ],
  },
  lettersSource: "template",
  letters: [
    {
      kind: "assistance",
      title: "Financial assistance request",
      subject: "Financial assistance request, account SAMPLE-40017782",
      body: "To the billing office,\n\nI am writing about account SAMPLE-40017782 for my visit on September 12, 2026.\n\nI do not have health insurance. My household has 2 people and our yearly income is about $28,000. Please screen me for financial assistance under your policy and California Health and Safety Code 127400 to 127446.\n\nPlease hold this account from collections while you review it.\n\nThank you,\n[Your name]\n[Your address]",
    },
    {
      kind: "dispute",
      title: "Billing questions",
      subject: "Questions about charges, account SAMPLE-40017782",
      body: "To the billing office,\n\nI have questions about three charges on my bill.\n\n1. Line 5 repeats line 3, a comprehensive metabolic panel for $486.00.\n2. Line 6 bills $1,934.00 per unit. Your published standard charge is $471.00.\n\nPlease correct these or explain them.\n\nThank you,\n[Your name]",
    },
  ],
};

// What the backend adds to each letter when the case is in Spanish.
const PATIENT_COPY: Record<string, { subjectPatient: string; bodyPatient: string }> = {
  assistance: {
    subjectPatient: "Solicitud de asistencia financiera, cuenta SAMPLE-40017782",
    bodyPatient:
      "A la oficina de facturación:\n\nLes escribo sobre la cuenta SAMPLE-40017782 por mi visita del 12 de septiembre de 2026.\n\nNo tengo seguro médico. En mi hogar somos 2 personas y ganamos unos $28,000 al año. Por favor, evalúen mi caso para asistencia financiera según su política y el Código de Salud y Seguridad de California 127400 a 127446.\n\nPor favor, no manden esta cuenta a cobranza mientras la revisan.\n\nGracias,\n[Su nombre]\n[Su dirección]",
  },
  dispute: {
    subjectPatient: "Preguntas sobre cargos, cuenta SAMPLE-40017782",
    bodyPatient:
      "A la oficina de facturación:\n\nTengo preguntas sobre tres cargos de mi factura.\n\n1. La línea 5 repite la línea 3, un panel metabólico completo de $486.00.\n2. La línea 6 cobra $1,934.00 por unidad. Su cargo estándar publicado es $471.00.\n\nPor favor, corrijan o expliquen estos cargos.\n\nGracias,\n[Su nombre]",
  },
};

export function Preview() {
  const { t, lang } = useT();
  const [view, setView] = useState<"steps" | "bill" | "ready" | "approved">("bill");
  const withLang: CaseView =
    lang === "es" ? { ...answered, lang, letters: answered.letters!.map((l) => ({ ...l, ...PATIENT_COPY[l.kind] })) } : answered;
  const c = view === "approved" ? { ...withLang, status: "approved" as const } : view === "ready" ? withLang : base;
  return (
    <div className="stack-lg">
      <div className="row" style={{ fontSize: 14 }}>
        {(["steps", "bill", "ready", "approved"] as const).map((v) => (
          <button key={v} className="btn btn-quiet" aria-pressed={view === v} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </div>
      {view === "steps" ? (
        <section className="stack">
          <p className="eyebrow">{t("case.eyebrow")}</p>
          <h1 className="h-answer">{t("case.reading")}</h1>
          <StepLog steps={[...base.steps.slice(0, 2), { _id: "4", key: "check", label: "Checking 6 charges against the hospital's own prices", state: "running" }]} live />
        </section>
      ) : (
        <>
          {view !== "bill" && <Answer c={c} />}
          <BillMarkup c={c} findings={c.findings ?? []} />
          {view === "bill" ? <HouseholdForm id="preview" token="preview" /> : <Letters key={view} c={c} />}
          <Sources c={c} />
        </>
      )}
    </div>
  );
}
