// Which screens a bill has, in order, given what the backend has done so far.
import type { CaseView } from "../types";

export type StepId = string; // "reading" | "hospital" | "found" | "finding-N" | "q1" | "q2" | "q3" | "answer" | "details" | "letter-N" | "send" | "more"

export type Phase = 1 | 2 | 3 | 4;

/** Findings shown one per screen. Many "cash price" findings are shown together on one screen. */
export function findingScreens(c: CaseView): { key: string; ids: string[] }[] {
  const all = c.findings ?? [];
  const cash = all.filter((f) => f.kind === "CASH_PRICE_GAP");
  const grouped = cash.length >= 3;
  const singles = (grouped ? all.filter((f) => f.kind !== "CASH_PRICE_GAP") : [...all]).sort((a, b) => b.amount - a.amount);
  const out = singles.map((f) => ({ key: f.id, ids: [f.id] }));
  if (grouped) out.push({ key: "cash", ids: cash.map((f) => f.id) });
  return out;
}

export function stepsFor(c: CaseView): StepId[] {
  const s = c.status;
  // A bill we couldn't read can still be deleted from "More".
  if (s === "error") return ["reading", "more"];
  if (s === "confirm_hospital") return ["hospital", "more"];
  if (s === "reading" || !c.bill) return ["reading"];
  const found = ["found", ...findingScreens(c).map((_, i) => `finding-${i}`)];
  if (s === "needs_household" || c.eligibility?.tier === "NEEDS_INFO") return [...found, "q1", "q2", "q3", "more"];
  const letters = (c.letters ?? []).map((_, i) => `letter-${i}`);
  // After the answer comes the letters; the findings stay reachable from the answer screen.
  const redo = ["q1", "q2", "q3"]; // "Change my answers" before approving
  if (s === "drafting" || (s === "ready" && !letters.length)) return ["answer", "letters-wait", ...found, ...redo, "more"];
  if (s === "ready") return ["answer", "details", ...letters, ...found, ...redo, "more"];
  return ["send", "answer", "details", ...letters, ...found, "more"]; // approved
}

/** The screen to land on for a status when the link doesn't name one. */
export function homeStep(c: CaseView): StepId {
  const s = c.status;
  if (s === "approved") return "send";
  if (s === "drafting" || s === "ready") return "answer";
  return stepsFor(c)[0];
}

export function phaseOf(step: StepId): Phase {
  if (step === "reading" || step === "hospital") return 1;
  if (step === "found" || step.startsWith("finding-") || step.startsWith("q")) return 2;
  if (step === "send") return 4;
  return 3;
}
