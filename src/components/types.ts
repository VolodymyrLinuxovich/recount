// Shapes of the case document the backend returns. Types only; no backend code runs here.
import type { ParsedBill, BillLine } from "../../convex/lib/bill";
import type { Finding, FindingKind } from "../../convex/lib/checks";
import type { Eligibility, Basis } from "../../convex/lib/eligibility";
import type { HospitalRef } from "../../convex/lib/hospital";
import type { Letter } from "../../convex/lib/letters";

export type { ParsedBill, BillLine, Finding, FindingKind, Eligibility, Basis, HospitalRef, Letter };

export type Status = "reading" | "needs_household" | "drafting" | "ready" | "approved" | "error";

export interface Step {
  _id: string;
  key: string;
  label: string;
  detail?: string;
  state: "running" | "done" | "warn" | "error";
}

export interface CaseView {
  _id: string;
  status: Status;
  sample: boolean;
  fileType?: string;
  fileUrl: string | null;
  bill?: ParsedBill;
  billSource?: "claude" | "sample-source";
  hospital?: HospitalRef | null;
  findings?: Finding[];
  household?: { size: number; annualIncome: number; insured: boolean; outOfPocket12mo?: number };
  eligibility?: Eligibility;
  letters?: Letter[];
  lettersSource?: "claude" | "template";
  approvedAt?: number;
  error?: string;
  steps: Step[];
}

export const money = (x: number, cents = true) =>
  `$${x.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;

export function shortDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
