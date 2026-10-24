// Numbers and labels for the insurance statement screens. Display only: the findings
// themselves come from the rules on the server (convex/lib/eobChecks.ts).
import { EOB_FINDING_TARGET } from "../../../convex/lib/eob";
import type { EobFindingKind, Finding, ParsedBill, ParsedEob } from "../types";

/* ---------- numbers, the same definitions as docs/EOB.md ---------- */

export const cents = (x: number) => Math.round(x * 100) / 100;

/** What the hospital is asking for now. */
export function billDue(bill: ParsedBill | undefined): number | null {
  if (!bill) return null;
  if (bill.amountDue != null) return bill.amountDue;
  if (bill.totalCharges == null) return null;
  return cents(bill.totalCharges - bill.insurancePaid - bill.adjustments - bill.patientPaid);
}

/** What the insurance statement says the patient owes, less what they already paid. */
export function eobStillOwes(eob: ParsedEob | null | undefined, bill: ParsedBill | undefined): number | null {
  if (!eob) return null;
  let owes = eob.totalPatientOwes;
  if (owes == null) {
    const known = eob.lines.map((l) => l.patientOwes).filter((n): n is number => n != null);
    owes = known.length ? known.reduce((a, b) => a + b, 0) : null;
  }
  if (owes == null) return null;
  return Math.max(0, cents(owes - (bill?.patientPaid ?? 0)));
}

export const isEobKind = (k: string): k is EobFindingKind => k in EOB_FINDING_TARGET;

/** Who the patient writes to about a finding. Bill findings always go to the hospital. */
export const targetOf = (f: Finding) => (isEobKind(f.kind) ? EOB_FINDING_TARGET[f.kind] : "hospital");
