// Standard letters used when the model is unavailable. Same facts, fixed wording.
// The letters sent to the hospital and to the insurer are always English. When the patient
// reads Spanish, each letter also carries a Spanish copy (subjectPatient / bodyPatient) so
// they know exactly what they are signing.

import type { ParsedBill } from "./bill";
import type { Finding, FindingKind } from "./checks";
import type { Eligibility } from "./eligibility";
import { COVERAGE_KINDS, COVERAGE_LAW_LINE, type CoverageFindingKind, coverageLawLine } from "./coverage";
import { CO_DENIAL, EOB_FINDING_TARGET, type ParsedEob } from "./eob";
import { type Lang, money } from "./lang";

export type LetterKind = "assistance" | "dispute" | "appeal";

export interface Letter {
  kind: LetterKind;
  title: string;
  subject: string;
  body: string;
  /** Spanish copy for the patient to read; never sent. Present only when lang = "es". */
  subjectPatient?: string;
  bodyPatient?: string;
}

export interface LetterFacts {
  bill: ParsedBill;
  hospital: { name: string; policyUrl: string | null; address?: string | null } | null;
  findings: Finding[];
  findingsEn?: Finding[]; // English findings for the hospital letter when the patient reads Spanish
  policyFindings?: { rule: string; verdict: string; quote: string; effectiveDate: string | null }[];
  eligibility: Eligibility;
  household?: { size: number; annualIncome: number; insured: boolean };
  /** The patient's insurance statement (Explanation of Benefits), if they added one. */
  eob?: ParsedEob | null;
}

const LAW_LINE: Record<string, [string, string]> = {
  DEADLINE: [
    "California law does not allow time limits for applying (Health and Safety Code 127405).",
    "La ley de California no permite plazos para solicitar (Código de Salud y Seguridad 127405).",
  ],
  ASSETS: [
    "California law does not allow hospitals to consider a patient's monetary assets (Health and Safety Code 127405(b)).",
    "La ley de California no permite que los hospitales tomen en cuenta los ahorros o bienes del paciente (Código de Salud y Seguridad 127405(b)).",
  ],
  INCOME_PROOF: [
    "California law limits required income documents to recent pay stubs or tax returns (Health and Safety Code 127405(e)).",
    "La ley de California limita los comprobantes de ingreso exigidos a talones de pago recientes o declaraciones de impuestos (Código de Salud y Seguridad 127405(e)).",
  ],
  CREDIT_REPORTING: [
    "California law no longer allows reporting medical debt to credit agencies (SB 1061, 2024).",
    "La ley de California ya no permite reportar deudas médicas a las agencias de crédito (SB 1061, 2024).",
  ],
  LIENS: [
    "California law does not allow liens on the home or other real property of patients who qualify for help (Health and Safety Code 127425).",
    "La ley de California no permite que el hospital ponga un gravamen (es decir, un derecho a cobrar sobre su casa o propiedad) a pacientes que califican para ayuda (Código de Salud y Seguridad 127425).",
  ],
  MEDICAL_FIRST: [
    "California law does not allow requiring an application for other coverage first (Health and Safety Code 127405(b)).",
    "La ley de California no permite exigir que primero solicite otra cobertura (Código de Salud y Seguridad 127405(b)).",
  ],
};

export function lawLine(rule: string, lang: Lang): string | null {
  const l = LAW_LINE[rule];
  return l ? (lang === "es" ? l[1] : l[0]) : null;
}

function parts(f: LetterFacts) {
  return {
    hosp: f.hospital?.name ?? f.bill.hospitalName ?? "[Hospital name]",
    hospAddr: f.hospital?.address ?? f.bill.hospitalAddress ?? null,
    acct: f.bill.accountNumber ?? "[account number]",
    patient: f.bill.patientName ?? "[Your name]",
    dos: f.bill.serviceDate ?? "[date of service]",
    income: f.household ? money(f.household.annualIncome) : "[annual income]",
    policy: (f.policyFindings ?? []).filter((p) => p.verdict !== "ask" && LAW_LINE[p.rule]),
  };
}

function assistanceEn(f: LetterFacts): Letter {
  const p = parts(f);
  const size = f.household?.size;
  const people = size == null ? "[household size] people" : size === 1 ? "1 person" : `${size} people`;
  return {
    kind: "assistance",
    title: TITLES.assistance[0],
    subject: `Request for financial assistance, account ${p.acct}`,
    body: [
      ...(p.hospAddr ? [p.hosp, p.hospAddr, ``] : []),
      `To the ${p.hosp} Patient Financial Services office,`,
      ``,
      `I am requesting financial assistance for my account ${p.acct} (date of service ${p.dos}).`,
      ``,
      `My household has ${people} and our annual income is about ${p.income}, which is ${f.eligibility.fplPct}% of the federal poverty guideline. ${!f.household?.insured ? "I did not have insurance for this visit." : f.eligibility.tier === "NOT_ELIGIBLE" ? "I have insurance, and I am having trouble paying my share of this bill." : "I have high medical costs relative to my income."}`,
      ``,
      `Please screen me for charity care and discount payment under your financial assistance policy and California Health and Safety Code sections 127400 to 127446. If you need an application or documents, please send them to me.`,
      ``,
      ...(p.policy.length
        ? ["I noticed your policy says:", ...p.policy.map((x) => `"${x.quote}" ${LAW_LINE[x.rule][0]} Please apply state law to my request.`), ""]
        : []),
      `While my request is reviewed, please do not send this account to collections or report it to a credit agency.`,
      ``,
      `Thank you,`,
      p.patient,
      `[Address]`,
      `[Phone]`,
    ].join("\n"),
  };
}

function assistanceEs(f: LetterFacts): Pick<Letter, "subjectPatient" | "bodyPatient"> {
  const p = parts(f);
  const size = f.household?.size;
  const people = size == null ? "[tamaño del hogar] personas" : size === 1 ? "1 persona" : `${size} personas`;
  return {
    subjectPatient: `Solicitud de asistencia financiera, cuenta ${p.acct}`,
    bodyPatient: [
      ...(p.hospAddr ? [p.hosp, p.hospAddr, ``] : []),
      `A la oficina de Servicios Financieros para Pacientes de ${p.hosp}:`,
      ``,
      `Solicito asistencia financiera para mi cuenta ${p.acct} (fecha del servicio ${p.dos}).`,
      ``,
      `Mi hogar tiene ${people} y nuestro ingreso anual es de aproximadamente ${p.income}, que es el ${f.eligibility.fplPct}% de la guía federal de pobreza. ${!f.household?.insured ? "No tenía seguro médico para esta visita." : f.eligibility.tier === "NOT_ELIGIBLE" ? "Tengo seguro y tengo dificultades para pagar mi parte de esta factura." : "Tengo gastos médicos altos en relación con mi ingreso."}`,
      ``,
      `Por favor evalúenme para atención gratuita y pago con descuento según su política de asistencia financiera y las secciones 127400 a 127446 del Código de Salud y Seguridad de California. Si necesitan una solicitud o documentos, por favor envíenmelos.`,
      ``,
      ...(p.policy.length
        ? ["Noté que su política dice:", ...p.policy.map((x) => `"${x.quote}" ${LAW_LINE[x.rule][1]} Por favor apliquen la ley estatal a mi solicitud.`), ""]
        : []),
      `Mientras revisan mi solicitud, por favor no envíen esta cuenta a cobranza ni la reporten a una agencia de crédito.`,
      ``,
      `Gracias,`,
      p.patient,
    ].join("\n"),
  };
}

// Fixed law lines for the insurance statement findings. The templates use them, and the model
// prompt tells the model to copy them word for word. [English, Spanish].
const EOB_LAW_LINE: Record<"NO_SURPRISES" | "IN_NETWORK" | "IMR" | "PLAN_APPEAL_STEPS", [string, string]> = {
  NO_SURPRISES: [
    "The federal No Surprises Act (Public Health Service Act section 2799B-1, 42 U.S.C. 300gg-131) says that for emergency care, an out-of-network hospital may not bill a patient more than the in-network cost sharing.",
    "La ley federal No Surprises Act (sección 2799B-1 de la Ley del Servicio de Salud Pública, 42 U.S.C. 300gg-131) dice que, en una emergencia, un hospital fuera de la red no puede cobrarle al paciente más que el costo compartido dentro de la red.",
  ],
  IN_NETWORK: [
    "In-network providers agree to accept the plan's allowed amount and not to bill patients more than their share of it (balance billing).",
    "Los proveedores dentro de la red aceptan el monto permitido por el plan y no deben cobrarles a los pacientes más que su parte de ese monto (facturación del saldo).",
  ],
  IMR: [
    "In California, if you uphold this decision, I understand I may ask the state for an Independent Medical Review, through the Department of Managed Health Care or the California Department of Insurance, depending on my plan.",
    "En California, si ustedes mantienen esta decisión, entiendo que puedo pedirle al estado una Revisión Médica Independiente, por medio del Departamento de Atención Médica Administrada o del Departamento de Seguros de California, según mi plan.",
  ],
  PLAN_APPEAL_STEPS: [
    "I am following the appeal steps on my statement. If you uphold this decision, please tell me in writing what my next appeal rights are.",
    "Estoy siguiendo los pasos de apelación de mi Explicación de Beneficios. Si ustedes mantienen esta decisión, por favor díganme por escrito cuáles son mis siguientes derechos de apelación.",
  ],
};
export type EobLawRule = keyof typeof EOB_LAW_LINE;

export function eobLawLine(rule: EobLawRule, lang: Lang): string {
  return EOB_LAW_LINE[rule][lang === "es" ? 1 : 0];
}

/** Who a finding's letter goes to. Bill checks always go to the hospital. */
export function findingTarget(kind: FindingKind): "hospital" | "insurer" | "none" {
  return (EOB_FINDING_TARGET as Record<string, "hospital" | "insurer" | "none">)[kind] ?? "hospital";
}

const isEobKind = (kind: FindingKind) => kind in EOB_FINDING_TARGET;

/** Which letters a case gets: assistance always, dispute for hospital findings, appeal for insurer findings. */
export function letterKinds(f: Pick<LetterFacts, "findings">): LetterKind[] {
  const targets = new Set(f.findings.map((x) => findingTarget(x.kind)));
  return ["assistance", ...(targets.has("hospital") ? (["dispute"] as const) : []), ...(targets.has("insurer") ? (["appeal"] as const) : [])];
}

const TITLES: Record<LetterKind, [string, string]> = {
  assistance: ["Financial assistance request", "Solicitud de ayuda financiera"],
  dispute: ["Billing questions", "Preguntas sobre la factura"],
  appeal: ["Insurance appeal", "Apelación al seguro"],
};

/** The letter's title in the patient's language. */
export function letterTitle(kind: LetterKind, lang: Lang): string {
  return TITLES[kind][lang === "es" ? 1 : 0];
}

/** Medi-Cal and Medicare have their own appeal paths; we don't name the state's review for them. */
export function isPublicPlan(eob: ParsedEob | null | undefined): boolean {
  return /medi-?cal|medicare|medicaid/i.test(`${eob?.planType ?? ""} ${eob?.payer ?? ""}`);
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** What the bill asks for: amountDue, or totals minus payments when it isn't printed. */
function billDue(b: ParsedBill): number {
  return r2(b.amountDue ?? (b.totalCharges ?? 0) - b.insurancePaid - b.adjustments - b.patientPaid);
}

/** What the EOB says the patient owes in total, or null if it doesn't say. */
function eobOwes(e: ParsedEob): number | null {
  if (e.totalPatientOwes != null) return e.totalPatientOwes;
  const owed = e.lines.map((l) => l.patientOwes).filter((x): x is number => x != null);
  return owed.length ? r2(owed.reduce((a, b) => a + b, 0)) : null;
}

/** One numbered item in the dispute letter for an insurance statement finding. [title, text] */
function eobItem(x: Finding, f: LetterFacts, lang: Lang): [string, string] | null {
  const e = f.eob;
  if (!e) return null;
  const es = lang === "es";
  const payer = e.payer ?? (es ? "[compañía de seguros]" : "[insurance company]");
  const claim = e.claimNumber ?? (es ? "[número de reclamo]" : "[claim number]");
  const ref = es
    ? `Mi resumen del seguro (Explicación de Beneficios) de ${payer}, reclamo ${claim},`
    : `My insurance statement (Explanation of Benefits) from ${payer}, claim ${claim},`;
  const due = billDue(f.bill);
  const owes = eobOwes(e) ?? r2(due - x.amount);
  const paid = f.bill.patientPaid;
  const planPaid = e.totalPlanPaid ?? 0;
  const noPayment = planPaid > 0 && f.bill.insurancePaid === 0;
  const share = es
    ? `${ref} dice que mi parte es ${money(owes)}.${paid > 0 ? ` Ya pagué ${money(paid)}.` : ""} Su factura pide ${money(due)}, es decir, ${money(x.amount)} más.${noPayment ? ` El resumen también muestra que mi plan pagó ${money(planPaid)}, y su factura no muestra ningún pago del seguro.` : ""}`
    : `${ref} says my share is ${money(owes)}.${paid > 0 ? ` I have already paid ${money(paid)}.` : ""} Your bill asks for ${money(due)}, which is ${money(x.amount)} more.${noPayment ? ` The statement also shows my plan paid ${money(planPaid)}, and your bill shows no insurance payment.` : ""}`;
  switch (x.kind) {
    case "OWES_MORE_THAN_EOB":
      return es
        ? ["El saldo es mayor que lo que dice mi seguro", `${share}${e.network === "in" ? ` ${eobLawLine("IN_NETWORK", lang)}` : ""} Por favor corrijan mi saldo para que coincida con el resumen, o explíquenme la diferencia por escrito.`]
        : ["My balance is higher than my insurance statement says", `${share}${e.network === "in" ? ` ${eobLawLine("IN_NETWORK", lang)}` : ""} Please correct my balance to match the statement, or explain the difference in writing.`];
    case "SURPRISE_BILL":
      return es
        ? ["Atención de emergencia cobrada por encima del costo dentro de la red", `Fue atención de emergencia, y mi plan indica que su hospital está fuera de la red. ${eobLawLine("NO_SURPRISES", lang)} ${share} Por favor corrijan mi factura al costo compartido dentro de la red que muestra el resumen.`]
        : ["Emergency care billed above in-network cost sharing", `This was emergency care, and my plan lists your hospital as out of network. ${eobLawLine("NO_SURPRISES", lang)} ${share} Please correct my bill to the in-network cost sharing shown on the statement.`];
    case "INSURANCE_NOT_APPLIED":
      return es
        ? ["El pago del seguro no aparece", `${ref} muestra que mi plan pagó ${money(planPaid)}. Su factura no muestra ningún pago del seguro. Por favor apliquen el pago del plan a mi cuenta y envíenme una factura actualizada.`]
        : ["Insurance payment not applied", `${ref} shows my plan paid ${money(planPaid)}. Your bill shows no insurance payment. Please apply the plan's payment to my account and send me an updated bill.`];
    case "NOT_ON_EOB": {
      const i = x.lines[0];
      const l = i == null ? undefined : f.bill.lines[i];
      const what = l
        ? es
          ? `La línea ${i + 1}, ${l.description}${l.code ? ` (código ${l.code})` : ""}, ${money(l.charge)},`
          : `Line ${i + 1}, ${l.description}${l.code ? ` (code ${l.code})` : ""}, ${money(l.charge)},`
        : es ? "Uno de los cargos" : "One of the charges";
      return es
        ? ["Cargo que no aparece en mi resumen del seguro", `${what} no aparece en mi resumen del seguro. Por favor, díganme si este cargo se envió a mi seguro. Si no se envió, por favor cóbrenle a mi seguro antes de cobrarme a mí.`]
        : ["Charge not on my insurance statement", `${what} is not on my insurance statement. Please tell me whether this charge was sent to my insurance. If it was not, please bill my insurance before you bill me.`];
    }
    case "CLAIM_PENDING":
      return es
        ? ["Mi seguro todavía está procesando el reclamo", `Mi seguro (${payer}) todavía no termina de procesar este reclamo (reclamo ${claim}). Por favor detengan esta factura y no la envíen a cobranza hasta que mi seguro termine. Después, por favor envíenme una factura que muestre lo que pagó el plan.`]
        : ["My insurance is still processing the claim", `My insurance (${payer}) has not finished processing this claim (claim ${claim}). Please hold this bill and do not send it to collections until my insurance finishes. Then please send me a bill that shows what the plan paid.`];
    default:
      return null;
  }
}

/** One numbered item in the dispute letter for a Medicare or Medi-Cal finding, with its law line. [title, text] */
function coverageItem(x: Finding, f: LetterFacts, lang: Lang): [string, string] | null {
  if (!COVERAGE_KINDS.has(x.kind)) return null;
  const es = lang === "es";
  const law = coverageLawLine(x.kind as CoverageFindingKind, lang);
  const due = money(billDue(f.bill));
  switch (x.kind) {
    case "MEDI_CAL_BALANCE_BILL":
      return es
        ? ["Tengo Medi-Cal", `Tengo Medi-Cal. Su factura me pide ${due}. ${law} Por favor cóbrenle esta cuenta a Medi-Cal y quiten de mi factura todo lo que esté por encima de mi parte del costo.`]
        : ["I have Medi-Cal", `I have Medi-Cal. Your bill asks me for ${due}. ${law} Please bill Medi-Cal for this account and remove any amount above my share of cost from my bill.`];
    case "QMB_BILLED":
      return es
        ? ["Tengo Medicare y Medi-Cal", `Tengo Medicare y Medi-Cal. Su factura me pide ${due}. ${law} Por favor cóbrenle a Medi-Cal el costo compartido de Medicare y quiten este monto de mi factura.`]
        : ["I have Medicare and Medi-Cal", `I have Medicare and Medi-Cal. Your bill asks me for ${due}. ${law} Please bill Medi-Cal for the Medicare cost sharing and remove this amount from my bill.`];
    case "MEDICARE_NOT_BILLED":
      return es
        ? ["No aparece ningún pago de Medicare", `Tengo Medicare, y su factura no muestra ningún pago de Medicare. ${law} Por favor díganme si enviaron el reclamo a Medicare. Si no, por favor envíenlo y mándenme una factura nueva después de que Medicare pague.`]
        : ["No Medicare payment shown", `I have Medicare, and your bill shows no Medicare payment. ${law} Please tell me whether you sent the claim to Medicare. If you did not, please send it, and send me a new bill after Medicare pays.`];
    case "RETRO_MEDI_CAL":
      return es
        ? ["Puedo calificar para Medi-Cal", `Mis ingresos pueden calificarme para Medi-Cal. ${law} Por favor ayúdenme a solicitar Medi-Cal, cóbrenle esta cuenta si me aprueban y detengan esta factura mientras tanto.`]
        : ["I may qualify for Medi-Cal", `My income may qualify me for Medi-Cal. ${law} Please help me apply for Medi-Cal, bill it for this account if I am approved, and hold this bill in the meantime.`];
    default:
      return null;
  }
}

/** Numbered lines for the dispute letter: bill checks as today, insurance and coverage findings in fixed words. */
function disputeItems(findings: Finding[], f: LetterFacts, lang: Lang): string[] {
  return findings
    .filter((x) => findingTarget(x.kind) === "hospital")
    .map((x, i) => {
      const fixed = isEobKind(x.kind) ? eobItem(x, f, lang) : coverageItem(x, f, lang);
      return fixed ? `${i + 1}. ${fixed[0]}. ${fixed[1]}` : `${i + 1}. ${x.title}. ${x.detail}${x.amount ? ` (${money(x.amount)})` : ""}`;
    });
}

const hasEobItem = (findings: Finding[]) => findings.some((x) => isEobKind(x.kind) && findingTarget(x.kind) === "hospital");

function disputeEn(f: LetterFacts): Letter | null {
  const findings = f.findingsEn ?? f.findings;
  const items = disputeItems(findings, f, "en");
  if (!items.length) return null;
  const p = parts(f);
  return {
    kind: "dispute",
    title: TITLES.dispute[0],
    subject: `Questions about charges on account ${p.acct}`,
    body: [
      ...(p.hospAddr ? [p.hosp, p.hospAddr, ``] : []),
      `To the ${p.hosp} billing office,`,
      ``,
      f.eob && hasEobItem(findings)
        ? `I reviewed my bill for account ${p.acct} and compared it with my insurance statement. I have questions about these items:`
        : `I reviewed my bill for account ${p.acct} and have questions about these charges:`,
      ``,
      ...items,
      ``,
      `Please review these charges, send me a corrected itemized bill, and pause any collection activity until they are resolved.`,
      ``,
      `Thank you,`,
      p.patient,
    ].join("\n"),
  };
}

function disputeEs(f: LetterFacts): Pick<Letter, "subjectPatient" | "bodyPatient"> {
  const p = parts(f);
  return {
    subjectPatient: `Preguntas sobre los cargos de la cuenta ${p.acct}`,
    bodyPatient: [
      ...(p.hospAddr ? [p.hosp, p.hospAddr, ``] : []),
      `A la oficina de facturación de ${p.hosp}:`,
      ``,
      f.eob && hasEobItem(f.findings)
        ? `Revisé mi factura de la cuenta ${p.acct} y la comparé con mi resumen del seguro (Explicación de Beneficios). Tengo preguntas sobre lo siguiente:`
        : `Revisé mi factura de la cuenta ${p.acct} y tengo preguntas sobre estos cargos:`,
      ``,
      ...disputeItems(f.findings, f, "es"),
      ``,
      `Por favor revisen estos cargos, envíenme una factura detallada corregida y detengan cualquier cobro hasta que se resuelvan.`,
      ``,
      `Gracias,`,
      p.patient,
    ].join("\n"),
  };
}

/** The pieces of the appeal letter, in English or Spanish. */
function appealText(f: LetterFacts, lang: Lang): { subject: string; body: string } | null {
  const denied = (f.findingsEn ?? f.findings).find((x) => findingTarget(x.kind) === "insurer");
  if (!denied) return null;
  const es = lang === "es";
  const t = (en: string, sp: string) => (es ? sp : en);
  const e = f.eob ?? null;
  const p = parts(f);
  const payer = e?.payer ?? null;
  const memberId = e?.memberId ?? t("[member ID]", "[número de miembro]");
  const claim = e?.claimNumber ?? t("[claim number]", "[número de reclamo]");
  const name = e?.memberName ?? f.bill.patientName ?? t("[Your name]", "[Su nombre]");
  const from = e?.serviceDateFrom ?? f.bill.serviceDate ?? null;
  const to = e?.serviceDateTo ?? null;
  const dos = from ? (to && to !== from ? `${from} ${t("to", "a")} ${to}` : from) : t("[date of service]", "[fecha del servicio]");
  const lines = e?.lines ?? [];
  let shown = lines.filter((l) => (l.notCovered ?? 0) > 0);
  const wholeClaim = !shown.length && (e?.claimStatus === "denied" || e?.claimStatus === "partly_denied");
  // Only a CO- denial code marks a denied line; a copay or deductible remark (PR-) isn't appealable.
  if (wholeClaim) shown = e?.claimStatus === "denied" ? lines : lines.filter((l) => l.remark && CO_DENIAL.test(l.remark));
  const item = (l: ParsedEob["lines"][number], i: number) => {
    const amt = (l.notCovered ?? 0) > 0 ? l.notCovered : l.patientOwes ?? l.billed;
    const code = l.code ? ` (${t("code", "código")} ${l.code})` : "";
    const date = l.date ? `, ${l.date}` : "";
    const money_ = amt != null ? t(`: ${money(amt)} not covered`, `: ${money(amt)} no cubierto`) : "";
    const why = l.remark ? t(` Reason given: "${l.remark}".`, ` Motivo indicado: "${l.remark}".`) : "";
    return `${i + 1}. ${l.description}${code}${date}${money_}.${why}`;
  };
  return {
    subject: t(`Appeal of claim ${claim}, member ID ${memberId}`, `Apelación del reclamo ${claim}, número de miembro ${memberId}`),
    body: [
      payer ?? t("[Insurance company]", "[Compañía de seguros]"),
      e?.appealAddress ?? t("[insurer appeals address]", "[dirección de apelaciones del seguro]"),
      ``,
      payer ? t(`To the ${payer} appeals and grievances department,`, `Al departamento de apelaciones y quejas de ${payer}:`) : t(`To the appeals and grievances department,`, `Al departamento de apelaciones y quejas:`),
      ``,
      t(`I am asking for a full internal appeal (grievance) of your decision on this claim.`, `Pido una apelación interna completa (queja formal) de su decisión sobre este reclamo.`),
      ``,
      `${t("Member name", "Nombre del miembro")}: ${name}`,
      `${t("Member ID", "Número de miembro")}: ${memberId}`,
      `${t("Claim number", "Número de reclamo")}: ${claim}`,
      `${t("Provider", "Proveedor")}: ${e?.providerName ?? p.hosp}`,
      `${t("Date of service", "Fecha del servicio")}: ${dos}`,
      ``,
      ...(shown.length
        ? [t(`Your statement shows these services were denied or not covered:`, `Su Explicación de Beneficios muestra que estos servicios fueron negados o no cubiertos:`), ...shown.map(item)]
        : [t(`Your statement shows that services on this claim were denied or not covered.`, `Su Explicación de Beneficios muestra que se negaron o no se cubrieron servicios de este reclamo.`)]),
      ...(denied.amount > 0 ? [t(`Total not covered: ${money(denied.amount)}.`, `Total no cubierto: ${money(denied.amount)}.`)] : []),
      ``,
      ...(e?.appealDeadline ? [t(`Your statement lists this time limit for appeals: "${e.appealDeadline}".`, `Su Explicación de Beneficios indica este plazo para apelar: "${e.appealDeadline}".`), ``] : []),
      t(
        `Please review this decision in full. Please send me your decision in writing, with the reasons for it. Please also send me, free of charge, copies of the guidelines, criteria and other documents you used to make this decision.`,
        `Por favor revisen esta decisión por completo. Por favor envíenme su decisión por escrito, con sus razones. Por favor envíenme también, sin costo, copias de las guías, los criterios y los demás documentos que usaron para tomar esta decisión.`,
      ),
      ``,
      eobLawLine(isPublicPlan(e) ? "PLAN_APPEAL_STEPS" : "IMR", lang),
      ``,
      t(`Thank you,`, `Gracias,`),
      name,
      t(`[Address]`, `[Dirección]`),
      t(`[Phone]`, `[Teléfono]`),
    ].join("\n"),
  };
}

function appealEn(f: LetterFacts): Letter | null {
  const a = appealText(f, "en");
  return a ? { kind: "appeal", title: TITLES.appeal[0], ...a } : null;
}

function appealEs(f: LetterFacts): Pick<Letter, "subjectPatient" | "bodyPatient"> {
  const a = appealText(f, "es");
  return a ? { subjectPatient: a.subject, bodyPatient: a.body } : {};
}

export function templateLetters(f: LetterFacts, lang: Lang = "en"): Letter[] {
  const out: Letter[] = [];
  const a = assistanceEn(f);
  out.push(lang === "es" ? { ...a, ...assistanceEs(f) } : a);
  const d = disputeEn(f);
  if (d) out.push(lang === "es" ? { ...d, ...disputeEs(f) } : d);
  const ap = appealEn(f);
  if (ap) out.push(lang === "es" ? { ...ap, ...appealEs(f) } : ap);
  return out;
}

/** "[Your name: Alex Rivera]" -> "Alex Rivera". Brackets that already hold a value aren't blanks. */
export function resolveFilledBrackets(text: string): string {
  return text.replace(/\[[^\]\n:]{1,40}:\s*([^\]\n]*\S[^\]\n]*)\]/g, (_m, value: string) => value.trim());
}

// The model prompt for one letter. Same rules as the templates: only facts from the JSON.
const LETTER_PROMPT = `Write the letters a patient will send to a hospital billing office, using ONLY the facts in the JSON below.
- Letters to the hospital are always in English.
- "assistance": a request for financial assistance (charity care / discount payment) under the hospital's policy and California Health & Safety Code 127400-127446. Ask them to screen the patient, to send the application if one is needed, and to hold the account from collections while it is reviewed.
- If "policyFindings" lists parts of the hospital's own policy that conflict with California law, mention them in the assistance letter politely: quote the policy and the law, and ask the hospital to apply the law.
- "dispute": only if there are findings. Ask for an itemized bill if it's a summary bill, and list each finding with the exact amounts and the published number it's based on.
- If "patientLanguage" is "es", also give a faithful Spanish translation of each letter: subjectPatient translates ONLY the subject line, bodyPatient translates the body. Otherwise set them to null.
Never say the patient qualifies or is eligible; ask the hospital to screen them. Rules: plain, polite, firm. Short sentences. No legal threats, no claims beyond the facts, no invented law, amounts, dates or names. Address the letter to the hospital's mailing address from the facts when it's given. Use [brackets] ONLY for values you don't know, as short placeholders with no colon and no value inside, like "[Your street address]" or "[Signature]". When a value is known (for example the patient's name from the bill), write it plainly, never inside brackets. Sign as the patient.`;

const EOB_PROMPT_LINES = `If "eob" is in the facts, it is the patient's insurance statement (Explanation of Benefits). Use its numbers exactly as written.
- The "dispute" letter goes to the hospital. Leave out findings of kind DENIED_BY_PLAN (they go in the appeal letter) and EOB_MISMATCH. For the other insurance statement findings:
  - OWES_MORE_THAN_EOB: say what the statement says the patient owes and what the bill asks for. Ask the hospital to correct the balance to match the statement, or to explain the difference in writing. Use the in-network law line only if eob.network is "in".
  - SURPRISE_BILL: use the No Surprises Act law line. Ask the hospital to correct the bill to the in-network cost sharing shown on the statement.
  - INSURANCE_NOT_APPLIED: say the plan paid and the bill shows no insurance payment. Ask the hospital to apply the payment and send an updated bill.
  - NOT_ON_EOB: name the bill line. Ask whether the charge was sent to insurance, and to bill insurance first if it was not.
  - CLAIM_PENDING: say the insurer has not finished the claim. Ask the hospital to hold the bill and not send it to collections until the insurer finishes.`;

const APPEAL_PROMPT_LINES = `- "appeal": a letter to the patient's insurance company, not the hospital. It is also in English. Address it to eob.appealAddress, or "[insurer appeals address]" if it's missing. Give the member name, member ID, claim number, provider and date of service from the statement. List each denied or not covered line with its amount and its remark exactly as printed. Ask for a full internal appeal (grievance) and a written decision with the reasons, and ask for free copies of the guidelines and criteria used to decide. End with the Independent Medical Review law line, or with the appeal steps law line if the plan is Medi-Cal or Medicare. Don't add medical arguments that aren't in the facts. Sign as the patient.`;

const COVERAGE_PROMPT_LINES = `Findings about Medicare and Medi-Cal go in the "dispute" letter, each with its law line word for word:
- MEDI_CAL_BALANCE_BILL: the patient has Medi-Cal. Ask the hospital to bill Medi-Cal and remove any amount above the patient's share of cost.
- QMB_BILLED: the patient has Medicare and Medi-Cal. Ask the hospital to bill Medi-Cal for the Medicare cost sharing and remove it from the bill.
- MEDICARE_NOT_BILLED: the patient has Medicare and the bill shows no Medicare payment. Ask whether the claim went to Medicare, and to send it if not.
- RETRO_MEDI_CAL: the patient may qualify for Medi-Cal. Ask for help applying, to bill Medi-Cal if approved, and to hold the bill meanwhile.
${(Object.keys(COVERAGE_LAW_LINE) as CoverageFindingKind[]).map((k) => `- ${k} law line: "${COVERAGE_LAW_LINE[k][0]}"`).join("\n")}`;

const LAW_LINES_FOR: Record<LetterKind, EobLawRule[]> = {
  assistance: [],
  dispute: ["NO_SURPRISES", "IN_NETWORK"],
  appeal: ["IMR", "PLAN_APPEAL_STEPS"],
};

/** The full model prompt for one letter kind. Append the facts JSON after it. */
export function letterPrompt(kind: LetterKind): string {
  const laws = LAW_LINES_FOR[kind];
  return [
    LETTER_PROMPT,
    ...(kind === "assistance" ? [] : [kind === "appeal" ? `${APPEAL_PROMPT_LINES}\n${EOB_PROMPT_LINES.split("\n")[0]}` : EOB_PROMPT_LINES]),
    ...(kind === "dispute" ? [COVERAGE_PROMPT_LINES] : []),
    ...(laws.length
      ? [`When a law line below applies, use it word for word. Don't cite any other law for the insurance statement findings.\n${laws.map((r) => `- ${r}: "${EOB_LAW_LINE[r][0]}"`).join("\n")}`]
      : []),
    `Write ONLY the "${kind}" letter (an array with exactly one letter).`,
  ].join("\n\n");
}
