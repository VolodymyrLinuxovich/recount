import { z } from "zod";

// What the model must return after reading an insurance Explanation of Benefits (EOB).
// An EOB is the insurer's statement for one claim: what the hospital billed, what the plan
// allowed and paid, and what the patient owes. It is not a bill.
// Every money field is a number in dollars. Anything it can't read is null and listed in `unreadable`.
// The checks that use it (eobChecks.ts) are rules only; no model decides anything there.

export const EobLine = z.object({
  date: z.string().nullable().describe("Service date YYYY-MM-DD, or null if not printed"),
  code: z.string().nullable().describe("CPT/HCPCS or revenue code exactly as printed, or null"),
  description: z.string().describe("Service description as printed"),
  billed: z.number().nullable().describe("Amount the provider billed for this line"),
  allowed: z.number().nullable().describe("Amount the plan allowed (also called approved, eligible or negotiated amount)"),
  planPaid: z.number().nullable().describe("Amount the plan paid for this line"),
  patientOwes: z.number().nullable().describe("Patient responsibility for this line: deductible + copay + coinsurance + not covered"),
  notCovered: z.number().nullable().describe("Amount the plan did not cover or denied for this line, 0 if none"),
  remark: z.string().nullable().describe("Denial or remark code and its text as printed (e.g. 'CO-50 not medically necessary'), else null"),
});
export type EobLine = z.infer<typeof EobLine>;

export const ParsedEob = z.object({
  isEob: z.boolean().describe("False if this is not an insurance Explanation of Benefits (e.g. a hospital bill or a receipt)"),
  payer: z.string().nullable().describe("Insurance company or plan name"),
  planType: z.string().nullable().describe("HMO, PPO, EPO, Medi-Cal, Medicare, etc. if printed"),
  memberName: z.string().nullable(),
  memberId: z.string().nullable(),
  claimNumber: z.string().nullable(),
  providerName: z.string().nullable().describe("The hospital or provider the claim is for, as printed"),
  serviceDateFrom: z.string().nullable().describe("YYYY-MM-DD"),
  serviceDateTo: z.string().nullable().describe("YYYY-MM-DD"),
  network: z.enum(["in", "out", "unknown"]).describe("in if the provider is marked in-network/participating, out if out-of-network/non-participating, else unknown"),
  emergency: z.boolean().nullable().describe("True if the claim is marked as emergency/ER care, null if not shown"),
  claimStatus: z.enum(["processed", "denied", "partly_denied", "pending", "unknown"]),
  totalBilled: z.number().nullable(),
  totalAllowed: z.number().nullable(),
  totalPlanPaid: z.number().nullable(),
  totalPatientOwes: z.number().nullable().describe("What the EOB says the patient may owe the provider in total"),
  appealDeadline: z.string().nullable().describe("Appeal deadline or time limit exactly as printed, else null"),
  appealAddress: z.string().nullable().describe("Where to send an appeal or grievance, as printed"),
  insurerPhone: z.string().nullable(),
  lines: z.array(EobLine),
  unreadable: z.array(z.string()).describe("Parts you could not read with confidence"),
});
export type ParsedEob = z.infer<typeof ParsedEob>;

/** Finding kinds that come from comparing the bill with the EOB. They join FindingKind in checks.ts. */
export type EobFindingKind =
  | "EOB_MISMATCH" // the EOB looks like it is for a different visit
  | "OWES_MORE_THAN_EOB" // the bill asks for more than the EOB says the patient owes
  | "SURPRISE_BILL" // out-of-network emergency care billed above in-network cost sharing (No Surprises Act)
  | "INSURANCE_NOT_APPLIED" // the plan paid, but the bill doesn't show the payment
  | "NOT_ON_EOB" // a bill line that isn't on the EOB: maybe never sent to insurance
  | "DENIED_BY_PLAN" // the plan denied or didn't cover lines: the patient can appeal to the insurer
  | "CLAIM_PENDING"; // the insurer hasn't finished the claim: don't pay yet

/** Who the patient should write to about a finding. */
export const EOB_FINDING_TARGET: Record<EobFindingKind, "hospital" | "insurer" | "none"> = {
  EOB_MISMATCH: "none",
  OWES_MORE_THAN_EOB: "hospital",
  SURPRISE_BILL: "hospital",
  INSURANCE_NOT_APPLIED: "hospital",
  NOT_ON_EOB: "hospital",
  DENIED_BY_PLAN: "insurer",
  CLAIM_PENDING: "hospital",
};

/** Where the case's EOB is in its life. Stored on the case as `eobStatus`. */
export type EobStatus = "reading" | "done" | "error";

/** A printed date as YYYY-MM-DD. Readers sometimes return 08/08/2026; the checks need ISO dates. */
export function isoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return t;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** The EOB with every date in YYYY-MM-DD (US month/day order, as US insurers print them). */
export function normalizeEobDates(e: ParsedEob): ParsedEob {
  return {
    ...e,
    serviceDateFrom: isoDate(e.serviceDateFrom),
    serviceDateTo: isoDate(e.serviceDateTo),
    lines: e.lines.map((l) => ({ ...l, date: isoDate(l.date) })),
  };
}
