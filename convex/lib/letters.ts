// Standard letters used when the model is unavailable. Same facts, fixed wording.

import type { ParsedBill } from "./bill";
import type { Finding } from "./checks";
import type { Eligibility } from "./eligibility";

export interface Letter {
  kind: "assistance" | "dispute";
  title: string;
  subject: string;
  body: string;
}

interface Facts {
  bill: ParsedBill;
  hospital: { name: string; policyUrl: string | null } | null;
  findings: Finding[];
  policyFindings?: { rule: string; verdict: string; quote: string; effectiveDate: string | null }[];
  eligibility: Eligibility;
  household?: { size: number; annualIncome: number; insured: boolean };
}

const money = (x: number) => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function templateLetters(f: Facts): Letter[] {
  const hosp = f.hospital?.name ?? f.bill.hospitalName ?? "[Hospital name]";
  const acct = f.bill.accountNumber ?? "[account number]";
  const patient = f.bill.patientName ?? "[Your name]";
  const dos = f.bill.serviceDate ?? "[date of service]";
  const out: Letter[] = [];

  const size = f.household?.size ?? "[household size]";
  const income = f.household ? money(f.household.annualIncome) : "[annual income]";
  out.push({
    kind: "assistance",
    title: "Financial assistance request",
    subject: `Request for financial assistance, account ${acct}`,
    body: [
      `To the ${hosp} Patient Financial Services office,`,
      ``,
      `I am requesting financial assistance for my account ${acct} (date of service ${dos}).`,
      ``,
      `My household has ${size} people and our annual income is about ${income}, which is ${f.eligibility.fplPct}% of the federal poverty guideline. ${f.household?.insured ? "I have high medical costs relative to my income." : "I did not have insurance for this visit."}`,
      ``,
      `Please screen me for charity care and discount payment under your financial assistance policy and California Health and Safety Code sections 127400 to 127446. If you need an application or documents, please send them to me.`,
      ``,
      ...policyNotes(f),
      `While my request is reviewed, please do not send this account to collections or report it to a credit agency.`,
      ``,
      `Thank you,`,
      `${patient}`,
      `[Address]`,
      `[Phone]`,
    ].join("\n"),
  });

  if (f.findings.length) {
    const items = f.findings.map((x, i) => `${i + 1}. ${x.title}. ${x.detail}${x.amount ? ` (${money(x.amount)})` : ""}`);
    out.push({
      kind: "dispute",
      title: "Billing questions",
      subject: `Questions about charges on account ${acct}`,
      body: [
        `To the ${hosp} billing office,`,
        ``,
        `I reviewed my bill for account ${acct} and have questions about these charges:`,
        ``,
        ...items,
        ``,
        `Please review these charges, send me a corrected itemized bill, and pause any collection activity until they are resolved.`,
        ``,
        `Thank you,`,
        `${patient}`,
      ].join("\n"),
    });
  }
  return out;
}

const LAW_LINE: Record<string, string> = {
  DEADLINE: "California law does not allow time limits for applying (Health and Safety Code 127405).",
  ASSETS: "California law does not allow hospitals to consider a patient's monetary assets (Health and Safety Code 127405(b)).",
  INCOME_PROOF: "California law limits required income documents to recent pay stubs or tax returns (Health and Safety Code 127405(e)).",
  CREDIT_REPORTING: "California law no longer allows reporting hospital debt to credit agencies (Health and Safety Code 127425).",
  LIENS: "California law does not allow liens on a patient's real property (Health and Safety Code 127425).",
  MEDICAL_FIRST: "California law does not allow requiring an application for other coverage first (Health and Safety Code 127405(b)).",
};

function policyNotes(f: Facts): string[] {
  const items = (f.policyFindings ?? []).filter((p) => p.verdict !== "ask" && LAW_LINE[p.rule]);
  if (!items.length) return [];
  return [
    "I noticed your policy says:",
    ...items.map((p) => `"${p.quote}" ${LAW_LINE[p.rule]} Please apply state law to my request.`),
    "",
  ];
}
