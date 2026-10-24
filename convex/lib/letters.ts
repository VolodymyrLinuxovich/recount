// Standard letters used when the model is unavailable. Same facts, fixed wording.
// The letter sent to the hospital is always English. When the patient reads Spanish,
// each letter also carries a Spanish copy (subjectPatient / bodyPatient) so they know
// exactly what they are signing.

import type { ParsedBill } from "./bill";
import type { Finding } from "./checks";
import type { Eligibility } from "./eligibility";
import { type Lang, money } from "./lang";

export interface Letter {
  kind: "assistance" | "dispute";
  title: string;
  subject: string;
  body: string;
  /** Spanish copy for the patient to read; never sent. Present only when lang = "es". */
  subjectPatient?: string;
  bodyPatient?: string;
}

export interface LetterFacts {
  bill: ParsedBill;
  hospital: { name: string; policyUrl: string | null } | null;
  findings: Finding[];
  findingsEn?: Finding[]; // English findings for the hospital letter when the patient reads Spanish
  policyFindings?: { rule: string; verdict: string; quote: string; effectiveDate: string | null }[];
  eligibility: Eligibility;
  household?: { size: number; annualIncome: number; insured: boolean };
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
    title: "Financial assistance request",
    subject: `Request for financial assistance, account ${p.acct}`,
    body: [
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
      `Mientras revisan mi solicitud, por favor no envíen esta cuenta a cobranzas ni la reporten a una agencia de crédito.`,
      ``,
      `Gracias,`,
      p.patient,
    ].join("\n"),
  };
}

function disputeEn(f: LetterFacts): Letter | null {
  const findings = f.findingsEn ?? f.findings;
  if (!findings.length) return null;
  const p = parts(f);
  return {
    kind: "dispute",
    title: "Billing questions",
    subject: `Questions about charges on account ${p.acct}`,
    body: [
      `To the ${p.hosp} billing office,`,
      ``,
      `I reviewed my bill for account ${p.acct} and have questions about these charges:`,
      ``,
      ...findings.map((x, i) => `${i + 1}. ${x.title}. ${x.detail}${x.amount ? ` (${money(x.amount)})` : ""}`),
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
      `A la oficina de facturación de ${p.hosp}:`,
      ``,
      `Revisé mi factura de la cuenta ${p.acct} y tengo preguntas sobre estos cargos:`,
      ``,
      ...f.findings.map((x, i) => `${i + 1}. ${x.title}. ${x.detail}${x.amount ? ` (${money(x.amount)})` : ""}`),
      ``,
      `Por favor revisen estos cargos, envíenme una factura detallada corregida y detengan cualquier cobro hasta que se resuelvan.`,
      ``,
      `Gracias,`,
      p.patient,
    ].join("\n"),
  };
}

export function templateLetters(f: LetterFacts, lang: Lang = "en"): Letter[] {
  const out: Letter[] = [];
  const a = assistanceEn(f);
  out.push(lang === "es" ? { ...a, ...assistanceEs(f) } : a);
  const d = disputeEn(f);
  if (d) out.push(lang === "es" ? { ...d, ...disputeEs(f) } : d);
  return out;
}
