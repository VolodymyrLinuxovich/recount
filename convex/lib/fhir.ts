// A bill as HL7 FHIR R4, so a patient advocate, a clinic or a provider system can take the case as
// it is. Pure: no database, no network. convex/fhir.ts serves it behind the bill's secret token.
//
// One Bundle of type "collection":
//   Patient        the name if printed (no address, and never the insurance member ID)
//   Organization   the hospital, and the insurer if there is a statement
//   ChargeItem     one per bill line: CPT or HCPCS code, revenue code, date, quantity, charge
//   Invoice        the bill: account number, its lines (pointing at the ChargeItems), total and amount due
//   Coverage + ExplanationOfBenefit   the insurance statement, if the patient added one
//   DetectedIssue  each problem Recount found, pointing at the lines it is about
// Codes: CPT http://www.ama-assn.org/go/cpt, HCPCS http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets,
// revenue codes https://www.nubc.org/CodeSystem/RevenueCodes, adjudication from HL7 terminology and
// CARIN Blue Button (patient liability, not covered).
import type { ParsedBill } from "./bill";
import type { Finding } from "./checks";
import type { ParsedEob } from "./eob";

export const CPT = "http://www.ama-assn.org/go/cpt";
export const HCPCS = "http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets";
export const REVENUE = "https://www.nubc.org/CodeSystem/RevenueCodes";
const ADJUDICATION = "http://terminology.hl7.org/CodeSystem/adjudication";
const C4BB_ADJUDICATION = "http://hl7.org/fhir/us/carin-bb/CodeSystem/C4BBAdjudication";
const CLAIM_TYPE = "http://terminology.hl7.org/CodeSystem/claim-type";
/** Recount's own codes for what it found (the FindingKind names). */
export const FINDING_SYSTEM = "https://recount-nu.vercel.app/fhir/CodeSystem/finding";

type Resource = { resourceType: string; id: string; [k: string]: unknown };
export type Bundle = { resourceType: "Bundle"; type: "collection"; timestamp: string; meta: { profile?: string[]; tag: { system: string; code: string; display: string }[] }; entry: { fullUrl: string; resource: Resource }[] };

const money = (value: number) => ({ value: Math.round(value * 100) / 100, currency: "USD" });

/** The code system for a procedure code as printed: 5 digits (or 4 + F/T/U) is CPT, a letter + 4 digits is HCPCS Level II. */
export function codeSystem(code: string): string | null {
  const c = code.trim().toUpperCase();
  if (/^\d{4}[0-9FTU]$/.test(c)) return CPT;
  if (/^[A-V]\d{4}$/.test(c)) return HCPCS;
  return null;
}

/** A FHIR date: YYYY-MM-DD, or nothing if the bill's date isn't one. */
const date = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);

function codeable(code: string | null, revCode: string | null, text: string) {
  const coding: { system: string; code: string }[] = [];
  const sys = code ? codeSystem(code) : null;
  if (code && sys) coding.push({ system: sys, code: code.trim().toUpperCase() });
  if (revCode && /^\d{3,4}$/.test(revCode.trim())) coding.push({ system: REVENUE, code: revCode.trim().padStart(4, "0") });
  return { ...(coding.length ? { coding } : {}), text: text || code || "Charge" };
}

/** A UUID-shaped id from a string (FNV-1a, four rounds). Same input, same id; not for secrets. */
export function stableUuid(seed: string): string {
  let hex = "";
  for (let round = 0; round < 4; round++) {
    let h = 0x811c9dc5 ^ round;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
    hex += (h >>> 0).toString(16).padStart(8, "0");
  }
  // Version 4 and variant bits, so validators accept it as a UUID.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const strip = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;

export function toFhir(input: {
  caseId: string;
  bill: ParsedBill;
  eob?: ParsedEob | null;
  findings?: Finding[];
  /** The patient's answer to "what coverage did you have", used when there is no insurance statement. */
  coverage?: "none" | "private" | "medicare" | "medi-cal" | "both" | null;
  /** The hospital's name as matched (falls back to the name printed on the bill). */
  hospitalName?: string | null;
  now?: Date;
  /** Makes ids. Default: stable UUIDs from the case id, since Convex queries must be deterministic. */
  uuid?: () => string;
}): Bundle {
  const { bill, eob, findings = [] } = input;
  let n = 0;
  const uuid = input.uuid ?? (() => stableUuid(`${input.caseId}:${n++}`));
  const now = (input.now ?? new Date()).toISOString();
  const entry: Bundle["entry"] = [];
  const add = (r: Resource) => {
    entry.push({ fullUrl: `urn:uuid:${r.id}`, resource: r });
    return { reference: `urn:uuid:${r.id}` };
  };

  const patient = add(strip({ resourceType: "Patient", id: uuid(), name: bill.patientName ? [{ text: bill.patientName }] : undefined }));
  const hospital = add(
    strip({
      resourceType: "Organization",
      id: uuid(),
      name: input.hospitalName || bill.hospitalName || "Hospital (name not printed)",
      telecom: bill.billingPhone ? [{ system: "phone", value: bill.billingPhone, use: "work" }] : undefined,
      address: bill.hospitalAddress ? [{ text: bill.hospitalAddress }] : undefined,
    }),
  );

  const charges = bill.lines.map((l) =>
    add(
      strip({
        resourceType: "ChargeItem",
        id: uuid(),
        status: "billable",
        code: codeable(l.code, l.revCode, l.description),
        subject: patient,
        occurrenceDateTime: date(l.date) ?? date(bill.serviceDate),
        quantity: { value: l.quantity || 1 },
        priceOverride: money(l.charge),
        performingOrganization: hospital,
      }),
    ),
  );

  const invoice = add(
    strip({
      resourceType: "Invoice",
      id: uuid(),
      status: "issued",
      subject: patient,
      issuer: hospital,
      date: date(bill.statementDate),
      identifier: [
        { system: "https://recount-nu.vercel.app/fhir/case", value: input.caseId },
        ...(bill.accountNumber ? [{ type: { text: "Hospital account number" }, value: bill.accountNumber }] : []),
      ],
      lineItem: bill.lines.map((l, i) => ({
        sequence: i + 1,
        chargeItemReference: charges[i],
        priceComponent: [{ type: "base", factor: l.quantity || 1, amount: money(l.charge) }],
      })),
      totalGross: bill.totalCharges != null ? money(bill.totalCharges) : undefined,
      totalNet: bill.amountDue != null ? money(bill.amountDue) : undefined,
      note: bill.isItemized ? undefined : [{ text: "Summary bill: the hospital did not list each charge." }],
    }),
  );

  if (eob) {
    const insurer = add(strip({ resourceType: "Organization", id: uuid(), name: eob.payer || "Insurer (name not printed)", telecom: eob.insurerPhone ? [{ system: "phone", value: eob.insurerPhone }] : undefined }));
    const coverage = add(strip({ resourceType: "Coverage", id: uuid(), status: "active", beneficiary: patient, payor: [insurer], type: eob.planType ? { text: eob.planType } : undefined }));
    const adj = (system: string, code: string, v: number | null | undefined) => (v == null ? [] : [{ category: { coding: [{ system, code }] }, amount: money(v) }]);
    const outcome = eob.claimStatus === "pending" ? "queued" : eob.claimStatus === "processed" ? "complete" : eob.claimStatus === "unknown" ? "complete" : "partial";
    add(
      strip({
        resourceType: "ExplanationOfBenefit",
        id: uuid(),
        status: "active",
        type: { coding: [{ system: CLAIM_TYPE, code: "institutional" }] },
        use: "claim",
        patient,
        created: now,
        insurer,
        provider: hospital,
        outcome,
        identifier: eob.claimNumber ? [{ value: eob.claimNumber }] : undefined,
        billablePeriod: date(eob.serviceDateFrom) ? strip({ start: date(eob.serviceDateFrom), end: date(eob.serviceDateTo) ?? date(eob.serviceDateFrom) }) : undefined,
        insurance: [{ focal: true, coverage }],
        item: eob.lines.map((l, i) =>
          strip({
            sequence: i + 1,
            productOrService: codeable(l.code, null, l.description),
            servicedDate: date(l.date),
            adjudication: [
              ...adj(ADJUDICATION, "submitted", l.billed),
              ...adj(ADJUDICATION, "eligible", l.allowed),
              ...adj(ADJUDICATION, "benefit", l.planPaid),
              ...adj(C4BB_ADJUDICATION, "memberliability", l.patientOwes),
              ...adj(C4BB_ADJUDICATION, "noncovered", l.notCovered || null),
            ],
            noteNumber: l.remark ? [i + 1] : undefined,
          }),
        ),
        processNote: eob.lines.flatMap((l, i) => (l.remark ? [{ number: i + 1, type: "display", text: l.remark }] : [])),
        total: [
          ...adj(ADJUDICATION, "submitted", eob.totalBilled),
          ...adj(ADJUDICATION, "eligible", eob.totalAllowed),
          ...adj(ADJUDICATION, "benefit", eob.totalPlanPaid),
          ...adj(C4BB_ADJUDICATION, "memberliability", eob.totalPatientOwes),
        ],
      }),
    );
  }

  // No statement, but the patient said Medicare or Medi-Cal: record who should pay, so the
  // file shows the claim belongs with that program.
  const programs = !eob ? { medicare: ["Medicare"], "medi-cal": ["Medi-Cal"], both: ["Medicare", "Medi-Cal"] }[input.coverage as string] : undefined;
  if (programs) {
    const payor = programs.map((name) => add({ resourceType: "Organization", id: uuid(), name }));
    add({ resourceType: "Coverage", id: uuid(), status: "active", beneficiary: patient, payor, type: { text: programs.join(" and ") } });
  }

  for (const f of findings) {
    add(
      strip({
        resourceType: "DetectedIssue",
        id: uuid(),
        status: "final",
        code: { coding: [{ system: FINDING_SYSTEM, code: f.kind }], text: f.title },
        severity: f.confidence === "high" ? "high" : "moderate",
        patient,
        identifiedDateTime: now,
        implicated: [...f.lines.filter((i) => charges[i]).map((i) => charges[i]), invoice],
        detail: f.amount > 0 ? `${f.detail} Could take off $${f.amount.toFixed(2)}.` : f.detail,
        evidence: f.evidence.length ? [{ detail: f.evidence.map((e) => ({ text: `${e.label}: ${e.value}${e.source ? ` (${e.source})` : ""}` })) }] : undefined,
      }),
    );
  }

  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: now,
    meta: { tag: [{ system: "https://recount-nu.vercel.app/fhir", code: "recount-export", display: "Exported by Recount from a bill the patient uploaded" }] },
    entry,
  };
}
