// Fixed rules for patients with Medicare or Medi-Cal, from the patient's coverage answer.
// No model is involved. Sources and limits are in docs/REIMBURSEMENT.md.

import type { ParsedBill } from "./bill";
import type { Finding } from "./checks";
import { povertyLine, type FplTable } from "./eligibility";
import type { ParsedEob } from "./eob";
import { type Lang, money, pick } from "./lang";

/** What the patient said covers them. "both" means Medicare and Medi-Cal (dual eligible). */
export type Coverage = "none" | "private" | "medicare" | "medi-cal" | "both";
export const COVERAGES: Coverage[] = ["none", "private", "medicare", "medi-cal", "both"];

export type CoverageFindingKind =
  | "MEDI_CAL_BALANCE_BILL" // a Medi-Cal patient billed beyond share of cost
  | "QMB_BILLED" // a Medicare and Medi-Cal patient billed Medicare cost sharing
  | "MEDICARE_NOT_BILLED" // a Medicare patient, and no Medicare payment on the bill
  | "RETRO_MEDI_CAL"; // uninsured with income low enough for Medi-Cal: it can cover past months

export const COVERAGE_KINDS = new Set<string>(["MEDI_CAL_BALANCE_BILL", "QMB_BILLED", "MEDICARE_NOT_BILLED", "RETRO_MEDI_CAL"]);

/** Kinds that mean the patient likely owes nothing (or only a share of cost) for covered care. */
export const COVERAGE_RESETS = new Set<string>(["MEDI_CAL_BALANCE_BILL", "QMB_BILLED"]);

export const SRC = {
  WI_14019_4: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=WIC&sectionNum=14019.4",
  QMB: "https://www.law.cornell.edu/uscode/text/42/1396a",
  QMB_CMS: "https://www.cms.gov/files/document/mln7936176-prohibition-billing-qualified-medicare-beneficiaries.pdf",
  PROVIDER_AGREEMENT: "https://www.ecfr.gov/current/title-42/section-489.21",
  MEDICARE_CHARGES: "https://www.ecfr.gov/current/title-42/section-489.30",
  WI_14019_3: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=WIC&sectionNum=14019.3",
  RETRO: "https://www.ecfr.gov/current/title-42/section-435.915",
  MEDI_CAL_APPLY: "https://www.dhcs.ca.gov/services/medi-cal/Pages/ApplyforMedi-Cal.aspx",
};

/** Medi-Cal income limit for most adults: 138% of the poverty line. */
export const MEDI_CAL_FPL_PCT = 138;

export interface CoverageHousehold {
  size: number;
  annualIncome: number;
  insured: boolean;
  coverage?: Coverage;
}

/** The coverage answer, or what the old yes/no answer implies (an old answer of "yes" isn't a type). */
export function coverageOf(h: CoverageHousehold | null | undefined): Coverage | null {
  if (!h) return null;
  if (h.coverage && COVERAGES.includes(h.coverage)) {
    // An insurance statement turned "no" into "yes": we no longer know the type.
    if (h.coverage === "none" && h.insured) return null;
    return h.coverage;
  }
  return h.insured ? null : "none";
}

const hasMedicare = (c: Coverage | null) => c === "medicare" || c === "both";

/** What the bill asks the patient to pay now. */
function due(bill: ParsedBill): number {
  const d = bill.amountDue ?? (bill.totalCharges ?? 0) - (bill.insurancePaid ?? 0) - (bill.adjustments ?? 0) - (bill.patientPaid ?? 0);
  return Math.round(Math.max(0, d) * 100) / 100;
}

const usableEob = (eob: ParsedEob | null | undefined) => !!eob && eob.isEob !== false;

/** Fixed law lines for coverage findings, used word for word in the letters. [English, Spanish] */
export const COVERAGE_LAW_LINE: Record<CoverageFindingKind, [string, string]> = {
  MEDI_CAL_BALANCE_BILL: [
    "California law says a provider that accepts a Medi-Cal patient may not seek payment from the patient for covered services, except an unmet share of cost (Welfare and Institutions Code section 14019.4).",
    "La ley de California dice que un proveedor que atiende a un paciente de Medi-Cal no puede cobrarle por servicios cubiertos, excepto la parte del costo (share of cost) que el paciente todavía no haya pagado (Código de Bienestar e Instituciones, sección 14019.4).",
  ],
  QMB_BILLED: [
    "Federal law says providers may not bill a Qualified Medicare Beneficiary for Medicare deductibles, coinsurance or copayments (Social Security Act section 1902(n)(3)(B), 42 U.S.C. 1396a(n)(3)(B)). California law also bars billing a Medi-Cal patient for covered services beyond share of cost (Welfare and Institutions Code section 14019.4).",
    "La ley federal dice que los proveedores no pueden cobrarle a un Beneficiario Calificado de Medicare (QMB) los deducibles, coseguros ni copagos de Medicare (Ley del Seguro Social, sección 1902(n)(3)(B), 42 U.S.C. 1396a(n)(3)(B)). La ley de California tampoco permite cobrarle a un paciente de Medi-Cal por servicios cubiertos más allá de su parte del costo (Código de Bienestar e Instituciones, sección 14019.4).",
  ],
  MEDICARE_NOT_BILLED: [
    "A hospital in Medicare agrees not to charge a Medicare patient for services Medicare would pay for if the hospital filed the claim properly. It may charge only the Medicare deductible and coinsurance for them (42 U.S.C. 1395cc(a)(1)(A), 42 CFR 489.21 and 489.30).",
    "Un hospital que participa en Medicare acepta no cobrarle a un paciente de Medicare por servicios que Medicare pagaría si el hospital presentara bien el reclamo. Por ellos solo puede cobrar el deducible y el coseguro de Medicare (42 U.S.C. 1395cc(a)(1)(A), 42 CFR 489.21 y 489.30).",
  ],
  RETRO_MEDI_CAL: [
    "Medi-Cal can cover care from the months before the month a person applies, if they were eligible then (42 U.S.C. 1396a(a)(34), 42 CFR 435.915). Once Medi-Cal pays, the provider must refund what the patient paid for that care (Welfare and Institutions Code section 14019.3).",
    "Medi-Cal puede cubrir atención de los meses anteriores al mes en que la persona solicita, si en ese tiempo calificaba (42 U.S.C. 1396a(a)(34), 42 CFR 435.915). Cuando Medi-Cal paga, el proveedor debe devolverle al paciente lo que pagó por esa atención (Código de Bienestar e Instituciones, sección 14019.3).",
  ],
};

export function coverageLawLine(kind: CoverageFindingKind, lang: Lang): string {
  return COVERAGE_LAW_LINE[kind][lang === "es" ? 1 : 0];
}

/**
 * Findings that come from the patient's coverage answer. They need the household, so they appear
 * after the questions. With an insurance statement, the statement rules handle missing payments.
 */
export function coverageFindings(
  bill: ParsedBill,
  household: CoverageHousehold | null | undefined,
  eob: ParsedEob | null | undefined,
  fpl: FplTable,
  lang: Lang = "en",
): Finding[] {
  const c = coverageOf(household);
  if (!c || !household) return [];
  const t = pick(lang);
  const out: Finding[] = [];
  const owed = due(bill);
  const payer = (bill.insurancePayer ?? "").toLowerCase();

  if (c === "medi-cal" && owed >= 1) {
    out.push({
      id: "cov-medi-cal",
      kind: "MEDI_CAL_BALANCE_BILL",
      lines: [],
      amount: owed,
      title: t("You have Medi-Cal, but the bill asks you to pay", "Usted tiene Medi-Cal, pero la factura le pide pagar"),
      detail: t(
        `The bill asks for ${money(owed)}. A hospital that accepts Medi-Cal can't bill you for covered care, except your share of cost if you have one. Give the hospital your Medi-Cal card and ask it to bill Medi-Cal.`,
        `La factura le pide ${money(owed)}. Un hospital que acepta Medi-Cal no puede cobrarle por atención cubierta, excepto su parte del costo (share of cost) si la tiene. Dele al hospital su tarjeta de Medi-Cal y pídale que le cobre a Medi-Cal.`,
      ),
      evidence: [
        { label: t("Bill asks for", "La factura pide"), value: money(owed) },
        { label: t("Law", "Ley"), value: t("Welfare and Institutions Code 14019.4", "Código de Bienestar e Instituciones 14019.4"), source: SRC.WI_14019_4 },
      ],
      confidence: "check",
    });
  }

  if (c === "both" && owed >= 1) {
    out.push({
      id: "cov-qmb",
      kind: "QMB_BILLED",
      lines: [],
      amount: owed,
      title: t("You have Medicare and Medi-Cal, but the bill asks you to pay", "Usted tiene Medicare y Medi-Cal, pero la factura le pide pagar"),
      detail: t(
        `The bill asks for ${money(owed)}. With Medicare and Medi-Cal, Medi-Cal pays your Medicare deductibles and coinsurance. If you're a Qualified Medicare Beneficiary (QMB), the hospital can't bill you for them at all, even when Medi-Cal pays nothing. Ask the hospital to bill Medi-Cal and to take this off your bill.`,
        `La factura le pide ${money(owed)}. Con Medicare y Medi-Cal, Medi-Cal paga sus deducibles y coseguros de Medicare. Si usted es Beneficiario Calificado de Medicare (QMB), el hospital no puede cobrárselos, aunque Medi-Cal no pague nada. Pídale al hospital que le cobre a Medi-Cal y que quite este monto de su factura.`,
      ),
      evidence: [
        { label: t("Bill asks for", "La factura pide"), value: money(owed) },
        { label: t("Federal law", "Ley federal"), value: "42 U.S.C. 1396a(n)(3)(B)", source: SRC.QMB },
        { label: "CMS", value: "MLN7936176", source: SRC.QMB_CMS },
      ],
      confidence: "check",
    });
  }

  // Medicare should have paid first. With a statement, the statement rules check the payment.
  if (hasMedicare(c) && !usableEob(eob) && (bill.insurancePaid ?? 0) === 0 && owed >= 1) {
    const named = /medicare/.test(payer);
    out.push({
      id: "cov-medicare",
      kind: "MEDICARE_NOT_BILLED",
      lines: [],
      amount: 0,
      title: t("The bill shows no Medicare payment", "La factura no muestra ningún pago de Medicare"),
      detail: named
        ? t(
            "The bill names Medicare but shows no payment from it. Ask the hospital whether it sent the claim to Medicare and what Medicare decided. Don't pay the full amount until Medicare has paid.",
            "La factura menciona Medicare pero no muestra ningún pago. Pregúntele al hospital si envió el reclamo a Medicare y qué decidió Medicare. No pague el monto completo hasta que Medicare pague.",
          )
        : t(
            "You have Medicare, but the bill shows no Medicare payment. Give the hospital your Medicare card and ask it to bill Medicare. Then you owe at most the Medicare deductible and coinsurance for covered care.",
            "Usted tiene Medicare, pero la factura no muestra ningún pago de Medicare. Dele al hospital su tarjeta de Medicare y pídale que le cobre a Medicare. Así, por la atención cubierta, solo le pueden cobrar el deducible y el coseguro de Medicare.",
          ),
      evidence: [
        { label: t("Insurance paid on the bill", "Pago del seguro en la factura"), value: money(bill.insurancePaid ?? 0) },
        { label: t("Federal rule", "Regla federal"), value: "42 CFR 489.21", source: SRC.PROVIDER_AGREEMENT },
        { label: t("What you may owe", "Lo que puede deber"), value: "42 CFR 489.30", source: SRC.MEDICARE_CHARGES },
      ],
      confidence: "check",
    });
  }

  // Uninsured with income low enough for Medi-Cal: it can pay this bill if they apply soon.
  if (c === "none" && household.annualIncome >= 0) {
    const pct = (household.annualIncome / povertyLine(fpl, household.size)) * 100;
    if (pct <= MEDI_CAL_FPL_PCT) {
      out.push({
        id: "cov-retro",
        kind: "RETRO_MEDI_CAL",
        lines: [],
        amount: 0,
        title: t("Medi-Cal may pay this bill, even now", "Medi-Cal podría pagar esta factura, incluso ahora"),
        detail: t(
          `Your income looks low enough for Medi-Cal (${MEDI_CAL_FPL_PCT}% of the poverty line or less for most adults). Medi-Cal can cover care from up to 3 months before the month you apply. For applications from January 1, 2027, that drops to 1 or 2 months, so apply soon. Ask the hospital to hold the bill and help you apply. If you already paid, the hospital must refund you once Medi-Cal pays.`,
          `Los ingresos de su hogar parecen lo bastante bajos para Medi-Cal (${MEDI_CAL_FPL_PCT}% del nivel federal de pobreza o menos para la mayoría de los adultos). Medi-Cal puede cubrir atención de hasta 3 meses antes del mes en que usted solicita. Para solicitudes desde el 1 de enero de 2027, el plazo baja a 1 o 2 meses, así que solicite pronto. Pídale al hospital que ponga la factura en pausa y que le ayude a solicitar Medi-Cal. Si usted ya pagó, el hospital debe devolverle el dinero cuando Medi-Cal pague.`,
        ),
        evidence: [
          { label: t("Your income", "Ingresos de su hogar"), value: t(`${Math.round(pct * 10) / 10}% of the poverty line`, `${Math.round(pct * 10) / 10}% del nivel de pobreza`) },
          { label: t("Federal rule", "Regla federal"), value: "42 CFR 435.915", source: SRC.RETRO },
          { label: t("Refund", "Reembolso"), value: t("Welfare and Institutions Code 14019.3", "Código de Bienestar e Instituciones 14019.3"), source: SRC.WI_14019_3 },
          { label: t("Apply", "Solicitar"), value: "dhcs.ca.gov", source: SRC.MEDI_CAL_APPLY },
        ],
        confidence: "check",
      });
    }
  }

  return out;
}

/**
 * Add coverage findings to the other findings. When the patient likely owes nothing for covered
 * care (Medi-Cal, QMB), the other amounts are part of that same balance, so they show $0 and say so.
 */
export function withCoverage(findings: Finding[], fromCoverage: Finding[], lang: Lang = "en"): Finding[] {
  const t = pick(lang);
  const base = findings.filter((f) => !COVERAGE_KINDS.has(f.kind));
  if (fromCoverage.some((f) => COVERAGE_RESETS.has(f.kind))) {
    for (const f of base) {
      if (f.amount <= 0) continue;
      f.amount = 0;
      f.detail += t(
        " With your coverage, this amount is already counted in the Medi-Cal finding.",
        " Con su cobertura, este monto ya está contado en el hallazgo de Medi-Cal.",
      );
    }
  }
  return [...base, ...fromCoverage];
}
