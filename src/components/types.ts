// Shapes of the case document the backend returns. Types only; no backend code runs here.
import type { ParsedBill, BillLine } from "../../convex/lib/bill";
import type { Finding, FindingKind } from "../../convex/lib/checks";
import type { Eligibility, Basis } from "../../convex/lib/eligibility";
import type { HospitalRef } from "../../convex/lib/hospital";
import type { Letter } from "../../convex/lib/letters";
import type { EobFindingKind, EobLine, EobStatus, ParsedEob } from "../../convex/lib/eob";
import type { ComplaintLetter, Outcome } from "../../convex/lib/complaint";

import { type Lang, locale } from "./i18n/strings";

export type { ParsedBill, BillLine, Finding, FindingKind, Eligibility, Basis, HospitalRef, Letter, ComplaintLetter, Outcome, EobFindingKind, EobLine, EobStatus, ParsedEob };

/** After sending: what the hospital did, and the complaint to the state (convex/followUp.ts). */
export interface FollowUp {
  outcome: Outcome;
  sentOn: string | null;
  status: "drafting" | "ready" | "approved";
  letter?: ComplaintLetter;
  source?: "claude" | "template";
  approvedAt?: number;
}

export type Status = "reading" | "confirm_hospital" | "needs_household" | "drafting" | "ready" | "approved" | "error";

export interface HospitalChoice {
  key: string;
  name: string;
  city: string | null;
  score?: number;
}

export interface Step {
  _id: string;
  key: string;
  label: string;
  detail?: string;
  state: "running" | "done" | "warn" | "error";
  at?: number;
}

export interface CaseView {
  _id: string;
  status: Status;
  createdAt?: number;
  /** When the current "reading" or "drafting" started. */
  statusAt?: number;
  /** Language the backend wrote this case's text in. */
  lang?: Lang;
  sample: boolean;
  fileType?: string;
  fileUrl: string | null;
  bill?: ParsedBill;
  billSource?: "claude" | "sample-source";
  hospital?: HospitalRef | null;
  findings?: Finding[];
  policyFindings?: import("./PolicyAside").PolicyFinding[];
  household?: { size: number; annualIncome: number; insured: boolean; outOfPocket12mo?: number };
  eligibility?: Eligibility;
  letters?: Letter[];
  /** The insurance Explanation of Benefits, if the patient added one (docs/EOB.md). */
  eobStatus?: EobStatus;
  eob?: ParsedEob | null;
  /** "NOT_AN_EOB" when the file wasn't an insurance statement; other text for other failures. */
  eobError?: string;
  eobSource?: "claude" | "sample-source" | "typed";
  eobFileUrl?: string | null;
  eobFileType?: string;
  lettersSource?: "claude" | "template";
  approvedAt?: number;
  /** The day the patient wants to check in on their request, YYYY-MM-DD. */
  checkInOn?: string;
  followUp?: FollowUp;
  error?: string;
  steps: Step[];
  /** Added on the phone, never sent by the backend. */
  token?: string;
  hospitalKey?: string | null;
  hospitalCandidates?: HospitalChoice[];
}

/** The title of a letter in the reader's language (the drafted title is always English). */
export const letterTitleKey = (kind: Letter["kind"] | "complaint") =>
  kind === "assistance" ? "letters.titleAssist" : kind === "appeal" ? "letters.titleAppeal" : kind === "complaint" ? "after.complaintTitle" : "letters.titleDispute";

export const money = (x: number, cents = true, lang: Lang = "en") =>
  `$${x.toLocaleString(locale(lang), { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;

export function shortDate(iso: string | null | undefined, lang: Lang = "en") {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale(lang), { month: "short", day: "numeric", year: "numeric" });
}

/** Money a patient could question, counting each bill line once (its largest finding). */
export function questionableTotal(findings: Finding[]) {
  const perLine = new Map<number, number>();
  let other = 0;
  for (const f of findings) {
    if (f.kind === "DUPLICATE_LINE") {
      const i = f.lines[f.lines.length - 1];
      perLine.set(i, Math.max(perLine.get(i) ?? 0, f.amount));
    } else if (f.lines.length) {
      for (const i of f.lines) perLine.set(i, Math.max(perLine.get(i) ?? 0, f.amount));
    } else other += f.amount;
  }
  return [...perLine.values()].reduce((a, b) => a + b, 0) + other;
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
