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

type ServerKind = "rule" | "ai" | "person";

export function kindOf(s: Step & { kind?: ServerKind }): Kind | null {
  if (s.kind) return s.kind === "person" ? "you" : s.kind;
  return BY_KEY[s.key] ?? null;
}

export type AgentRun = {
  task: "read" | "column" | "letters" | "chat";
  provider: string;
  model: string;
  ms: number;
  inputTokens: number | null;
  outputTokens: number | null;
  ok: boolean;
  fallbackUsed: boolean;
  at: number;
};

/** "Anthropic", "Azure AI Foundry", or any OpenAI-compatible host. */
export function providerName(p: string): string {
  if (p === "anthropic") return "Anthropic";
  if (p === "azure") return "Azure AI Foundry";
  if (p === "openai") return "OpenAI-compatible";
  return p;
}
