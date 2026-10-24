// Optional Azure AI Content Safety check on Lupa's chat, in and out.
// On only when AZURE_CONTENT_SAFETY_ENDPOINT and AZURE_CONTENT_SAFETY_KEY are set; otherwise
// every text passes. If the service is down, the text passes too (the chat's own rules still apply).

const BLOCK_AT = 4; // severity 0-7; 4+ is "medium" or worse

export function safetyOn(): boolean {
  return !!(process.env.AZURE_CONTENT_SAFETY_ENDPOINT && process.env.AZURE_CONTENT_SAFETY_KEY);
}

/** True when the text is fine to show or answer. */
export async function textIsSafe(text: string): Promise<boolean> {
  if (!safetyOn() || !text.trim()) return true;
  const base = process.env.AZURE_CONTENT_SAFETY_ENDPOINT!.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/contentsafety/text:analyze?api-version=2024-09-01`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Ocp-Apim-Subscription-Key": process.env.AZURE_CONTENT_SAFETY_KEY! },
      body: JSON.stringify({ text: text.slice(0, 10000), outputType: "EightSeverityLevels" }),
    });
    if (!res.ok) return true;
    const j = (await res.json()) as { categoriesAnalysis?: { category: string; severity?: number }[] };
    return !(j.categoriesAnalysis ?? []).some((c) => (c.severity ?? 0) >= BLOCK_AT);
  } catch {
    return true;
  }
}
