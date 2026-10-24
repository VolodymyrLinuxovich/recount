// The complaint a patient can file with HCAI's Hospital Bill Complaint Program when the hospital
// denies their assistance request, never answers, or sends the bill to collections anyway.
// Same rules as the letters: facts only, English for the state, a Spanish copy to read when the
// patient reads Spanish. Recount never files it; the patient does, online or by mail.
//
// Sources (pipeline/out/ca_law.json and HCAI's pages, read 2026-10-24):
// - complaint program: https://hcai.ca.gov/affordability/hospital-fair-billing-program/hospital-bill-complaint-program/
// - mailing address and documents: .../hospital-bill-complaint-program/how-to-submit-by-mail/
// - eligibility to apply, HSC 127405(a)(1)(A); collections while applying, HSC 127425(g).

import type { ParsedBill } from "./bill";
import { lawLine, type Letter } from "./letters";
import { type Lang, money } from "./lang";

/** A letter to the state instead of the hospital; same fields as the hospital letters. */
export type ComplaintLetter = Omit<Letter, "kind"> & { kind: "complaint" };

export type Outcome = "denied" | "no_reply" | "collections";
export const OUTCOMES: Outcome[] = ["denied", "no_reply", "collections"];

export const HCAI_COMPLAINT_URL = "https://hcai.ca.gov/affordability/hospital-fair-billing-program/hospital-bill-complaint-program/";
export const HCAI_MAIL_URL = "https://hcai.ca.gov/affordability/hospital-fair-billing-program/hospital-bill-complaint-program/how-to-submit-by-mail/";
export const HCAI_ADDRESS = [
  "Department of Health Care Access and Information",
  "Hospital Bill Complaint Program",
  "2020 West El Camino Avenue, Suite 1101",
  "Sacramento, CA 95833",
];

/** The statute text the complaint may quote. Nothing else is cited. */
export const COMPLAINT_LAW = {
  eligible: {
    cite: "Health and Safety Code 127405(a)(1)(A)",
    url: "https://codes.findlaw.com/ca/health-and-safety-code/hsc-sect-127405/",
    quote: "Uninsured patients or patients with high medical costs who are at or below 400 percent of the federal poverty level",
  },
  collections: {
    cite: "Health and Safety Code 127425(g)",
    url: "https://codes.findlaw.com/ca/health-and-safety-code/hsc-sect-127425/",
    quote: "shall not send the unpaid bill to any collection agency, debt buyer, or other assignee",
  },
};

export interface ComplaintFacts {
  bill: ParsedBill;
  hospital: { name: string; address?: string | null } | null;
  outcome: Outcome;
  /** When the patient sent the assistance request, YYYY-MM-DD, if known. */
  sentOn: string | null;
  /** Today, YYYY-MM-DD. */
  today: string;
  household?: { size: number; annualIncome: number; insured: boolean } | null;
  fplPct?: number | null;
  policyFindings?: { rule: string; verdict: string; quote: string }[];
}

/** "2026-10-01" -> "October 1, 2026" / "1 de octubre de 2026". Anything else is returned as is. */
export function longDate(iso: string, lang: Lang = "en"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function parts(f: ComplaintFacts, lang: Lang) {
  const es = lang === "es";
  return {
    hosp: f.hospital?.name ?? f.bill.hospitalName ?? (es ? "[Nombre del hospital]" : "[Hospital name]"),
    hospAddr: f.hospital?.address ?? f.bill.hospitalAddress ?? null,
    acct: f.bill.accountNumber ?? (es ? "[número de cuenta]" : "[account number]"),
    patient: f.bill.patientName ?? (es ? "[Su nombre]" : "[Your name]"),
    dos: f.bill.serviceDate ? longDate(f.bill.serviceDate, lang) : es ? "[fecha del servicio]" : "[date of service]",
    due: f.bill.amountDue != null ? money(f.bill.amountDue) : null,
    sent: f.sentOn ? longDate(f.sentOn, lang) : es ? "[fecha en que envió su solicitud]" : "[date you sent your request]",
    today: longDate(f.today, lang),
    // Only what the audit found to conflict (or likely conflict) with a rule we can state.
    policy: (f.policyFindings ?? []).filter((p) => p.verdict !== "ask" && lawLine(p.rule, "en")),
  };
}

/** Whether the complaint may quote the 400% rule: uninsured, and income known to be at or below 400% FPL. */
export function quotesEligibility(f: ComplaintFacts): boolean {
  return !!f.household && !f.household.insured && f.fplPct != null && f.fplPct <= 400;
}

function complaintEn(f: ComplaintFacts): Pick<Letter, "subject" | "body"> {
  const p = parts(f, "en");
  const h = f.household;
  const what = {
    denied: "The hospital denied my request for financial assistance.",
    no_reply: `As of ${p.today}, the hospital has not given me a decision on my request.`,
    collections: "While my request was open, the hospital sent my account to a collection agency.",
  }[f.outcome];
  const attach = [
    "my hospital bill",
    "my financial assistance request",
    "my recent pay stubs or tax returns",
    ...(f.outcome === "denied" ? ["the hospital's denial letter, if I received one"] : []),
    ...(f.outcome === "collections" ? ["the collection notice"] : []),
  ];
  return {
    subject: `Complaint about ${p.hosp}, account ${p.acct}`,
    body: [
      ...HCAI_ADDRESS,
      ``,
      `To the Hospital Bill Complaint Program,`,
      ``,
      `I am filing a complaint about how ${p.hosp} handled my request for financial assistance.`,
      ``,
      `Patient: ${p.patient}`,
      `Hospital: ${p.hosp}${p.hospAddr ? `, ${p.hospAddr}` : ""}`,
      `Account number: ${p.acct}`,
      `Date of service: ${p.dos}`,
      ...(p.due ? [`Amount billed: ${p.due}`] : []),
      `Date I sent my financial assistance request: ${p.sent}`,
      ``,
      `What happened: ${what}`,
      ``,
      ...(h && f.fplPct != null
        ? [
            `My household has ${h.size === 1 ? "1 person" : `${h.size} people`} and our annual income is about ${money(h.annualIncome)}, which is ${f.fplPct}% of the federal poverty guideline. ${h.insured ? "I have health insurance." : "I did not have insurance for this visit."}`,
            ``,
          ]
        : []),
      ...(quotesEligibility(f)
        ? [`${COMPLAINT_LAW.eligible.cite} makes "${COMPLAINT_LAW.eligible.quote}" eligible to apply for charity care or discount payment.`, ``]
        : []),
      ...(f.outcome === "collections"
        ? [`${COMPLAINT_LAW.collections.cite} says a hospital "${COMPLAINT_LAW.collections.quote}" while the patient is attempting to qualify for assistance, unless that assignee agrees to follow the law.`, ``]
        : []),
      ...(p.policy.length
        ? ["The hospital's own policy says:", ...p.policy.map((x) => `"${x.quote}" ${lawLine(x.rule, "en")}`), ""]
        : []),
      `Please review how the hospital handled my request.`,
      ``,
      `I am attaching copies of ${attach.slice(0, -1).join(", ")} and ${attach[attach.length - 1]}.`,
      ``,
      `Thank you,`,
      p.patient,
      `[Address]`,
      `[Phone]`,
    ].join("\n"),
  };
}

function complaintEs(f: ComplaintFacts): Pick<Letter, "subjectPatient" | "bodyPatient"> {
  const p = parts(f, "es");
  const pEn = parts(f, "en");
  const h = f.household;
  const what = {
    denied: "El hospital negó mi solicitud de asistencia financiera.",
    no_reply: `Al ${p.today}, el hospital no me ha dado una decisión sobre mi solicitud.`,
    collections: "Mientras mi solicitud seguía abierta, el hospital mandó mi cuenta a una agencia de cobranza.",
  }[f.outcome];
  const attach = [
    "mi factura del hospital",
    "mi solicitud de asistencia financiera",
    "mis talones de pago recientes o declaraciones de impuestos",
    ...(f.outcome === "denied" ? ["la carta del hospital que negó la solicitud, si la recibí"] : []),
    ...(f.outcome === "collections" ? ["el aviso de cobranza"] : []),
  ];
  return {
    subjectPatient: `Queja sobre ${pEn.hosp}, cuenta ${pEn.acct}`,
    bodyPatient: [
      ...HCAI_ADDRESS,
      ``,
      `Al Programa de Quejas sobre Facturas de Hospitales:`,
      ``,
      `Presento una queja sobre cómo ${pEn.hosp} manejó mi solicitud de asistencia financiera.`,
      ``,
      `Paciente: ${p.patient}`,
      `Hospital: ${pEn.hosp}${p.hospAddr ? `, ${p.hospAddr}` : ""}`,
      `Número de cuenta: ${p.acct}`,
      `Fecha del servicio: ${p.dos}`,
      ...(p.due ? [`Monto facturado: ${p.due}`] : []),
      `Fecha en que envié mi solicitud de asistencia financiera: ${p.sent}`,
      ``,
      `Lo que pasó: ${what}`,
      ``,
      ...(h && f.fplPct != null
        ? [
            `Mi hogar tiene ${h.size === 1 ? "1 persona" : `${h.size} personas`} y nuestro ingreso anual es de aproximadamente ${money(h.annualIncome)}, que es el ${f.fplPct}% de la guía federal de pobreza. ${h.insured ? "Tengo seguro médico." : "No tenía seguro médico para esta visita."}`,
            ``,
          ]
        : []),
      ...(quotesEligibility(f)
        ? [`El Código de Salud y Seguridad 127405(a)(1)(A) dice que los pacientes sin seguro o con gastos médicos altos cuyo ingreso está en el 400% del nivel federal de pobreza o menos pueden solicitar atención caritativa o pago con descuento.`, ``]
        : []),
      ...(f.outcome === "collections"
        ? [`El Código de Salud y Seguridad 127425(g) dice que el hospital no debe mandar la factura sin pagar a una agencia de cobranza, a un comprador de deudas ni a otro cesionario mientras el paciente trata de calificar para la asistencia, a menos que esa agencia acepte cumplir la ley.`, ``]
        : []),
      ...(p.policy.length
        ? ["La política del propio hospital dice:", ...p.policy.map((x) => `"${x.quote}" ${lawLine(x.rule, "es")}`), ""]
        : []),
      `Por favor revisen cómo el hospital manejó mi solicitud.`,
      ``,
      `Adjunto copias de ${attach.slice(0, -1).join(", ")} y ${attach[attach.length - 1]}.`,
      ``,
      `Gracias,`,
      p.patient,
    ].join("\n"),
  };
}

export function templateComplaint(f: ComplaintFacts, lang: Lang = "en"): ComplaintLetter {
  const en: ComplaintLetter = { kind: "complaint", title: "Complaint to the state", ...complaintEn(f) };
  return lang === "es" ? { ...en, ...complaintEs(f) } : en;
}

/** "[Label]" blanks the patient must fill before approving. A signature is signed by hand on paper. */
export function blanksIn(texts: string[]): string[] {
  return [...new Set(texts.flatMap((x) => x.match(/\[[^\]\n]{2,40}\]/g) ?? []))].filter((b) => !/signature|firma|sign here/i.test(b));
}
