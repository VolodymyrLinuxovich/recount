// Who does each step: fixed rules (code), an AI model, or the patient.
// Money and eligibility are always rules. The backend may send `kind` on a step; the step key is the fallback.
import type { Step } from "../types";

export type Kind = "rule" | "ai" | "you";

const BY_KEY: Record<string, Kind> = {
  read: "ai",
  hospital: "rule",
  "hospital-live": "rule",
  check: "rule",
  policy: "rule",
  letters: "ai",
};

export function kindOf(s: Step & { kind?: Kind }): Kind | null {
  return s.kind ?? BY_KEY[s.key] ?? null;
}
