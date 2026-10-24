// Optional Azure AI Content Safety check on Lupa's chat, in and out.
// On only when AZURE_CONTENT_SAFETY_ENDPOINT and AZURE_CONTENT_SAFETY_KEY are set; otherwise
// every text passes. If the service is slow or down, the text passes too (the chat's own rules
// still apply).
//
// Patients describe injuries ("I was shot", "I fell off a ladder"), so violence in a patient's
// message is never blocked. Signs of self-harm get a crisis message with 988 and 911, never a
// refusal. Hate and sexual content are blocked.
import { timeoutSignal } from "./timeout";

export type Verdict = "ok" | "crisis" | "blocked";

export function safetyOn(): boolean {
  return !!(process.env.AZURE_CONTENT_SAFETY_ENDPOINT && process.env.AZURE_CONTENT_SAFETY_KEY);
}

async function analyze(text: string): Promise<Record<string, number> | null> {
  const base = process.env.AZURE_CONTENT_SAFETY_ENDPOINT!.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/contentsafety/text:analyze?api-version=2024-09-01`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Ocp-Apim-Subscription-Key": process.env.AZURE_CONTENT_SAFETY_KEY! },
      body: JSON.stringify({ text: text.slice(0, 10000), outputType: "EightSeverityLevels" }),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { categoriesAnalysis?: { category: string; severity?: number }[] };
    return Object.fromEntries((j.categoriesAnalysis ?? []).map((c) => [c.category, c.severity ?? 0]));
  } catch {
    return null;
  }
}

/** Severity 0-7 per category, judged as the patient's message or as Lupa's reply. */
export function judge(sev: Record<string, number>, who: "patient" | "reply"): Verdict {
  if ((sev.SelfHarm ?? 0) >= (who === "patient" ? 2 : 4)) return "crisis";
  if ((sev.Hate ?? 0) >= 4 || (sev.Sexual ?? 0) >= 4) return "blocked";
  if (who === "reply" && (sev.Violence ?? 0) >= 4) return "blocked";
  return "ok";
}

export async function checkText(text: string, who: "patient" | "reply"): Promise<Verdict> {
  if (!safetyOn() || !text.trim()) return "ok";
  const sev = await analyze(text);
  return sev ? judge(sev, who) : "ok";
}

export const CRISIS = {
  en: "I'm really sorry you're going through this. If you might hurt yourself, please call or text 988 now (the Suicide & Crisis Lifeline, in English and Spanish), or call 911 if you're in danger. I'm still here to help with your bill whenever you're ready.",
  es: "Siento mucho que esté pasando por esto. Si podría hacerse daño, llame o envíe un texto al 988 ahora (la Línea de Prevención del Suicidio y Crisis, en español e inglés), o llame al 911 si está en peligro. Sigo aquí para ayudarle con su factura cuando usted quiera.",
};
