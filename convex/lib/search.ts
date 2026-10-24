// Optional Azure AI Search grounding for Lupa: passages from California hospitals' own financial
// assistance and collection policies, with our audit's verdict on each. Built by
// audit/index_search.py. On only when AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_KEY and Azure OpenAI
// (for the query embedding) are set; otherwise Lupa answers from the case data alone, as before.
//   AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_KEY, AZURE_SEARCH_INDEX (default recount-policies)
//   AZURE_OPENAI_EMBEDDING_DEPLOYMENT (default text-embedding-3-small)

export type Passage = { hospital: string; rule: string; verdict: string; text: string; url: string };

const env = (n: string) => (process.env[n]?.trim() ? process.env[n]!.trim() : undefined);

export function searchOn(): boolean {
  return !!(env("AZURE_SEARCH_ENDPOINT") && env("AZURE_SEARCH_KEY") && env("AZURE_OPENAI_ENDPOINT") && env("AZURE_OPENAI_API_KEY"));
}

async function embed(text: string): Promise<number[] | null> {
  const base = env("AZURE_OPENAI_ENDPOINT")!.replace(/\/+$/, "");
  const dep = env("AZURE_OPENAI_EMBEDDING_DEPLOYMENT") ?? "text-embedding-3-small";
  const version = env("AZURE_OPENAI_API_VERSION") ?? "2024-10-21";
  const res = await fetch(`${base}/openai/deployments/${encodeURIComponent(dep)}/embeddings?api-version=${version}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": env("AZURE_OPENAI_API_KEY")! },
    body: JSON.stringify({ input: text.slice(0, 4000) }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { data?: { embedding: number[] }[] };
  return j.data?.[0]?.embedding ?? null;
}

/** Up to `k` policy passages for a question, from this hospital when we know it. Never throws. */
export async function policyPassages(question: string, hospitalKeys: string[], k = 4): Promise<Passage[]> {
  if (!searchOn() || !question.trim()) return [];
  try {
    const vector = await embed(question);
    const base = env("AZURE_SEARCH_ENDPOINT")!.replace(/\/+$/, "");
    const index = env("AZURE_SEARCH_INDEX") ?? "recount-policies";
    const keys = hospitalKeys.filter((h) => /^[a-z0-9-]+$/.test(h));
    const filter = keys.length ? keys.map((h) => `hospitals/any(x: x eq '${h}')`).join(" or ") : undefined;
    const res = await fetch(`${base}/indexes/${encodeURIComponent(index)}/docs/search?api-version=2024-07-01`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": env("AZURE_SEARCH_KEY")! },
      body: JSON.stringify({
        search: question.slice(0, 500),
        top: k,
        select: "hospitalName,rule,verdict,text,url",
        ...(filter ? { filter } : {}),
        ...(vector ? { vectorQueries: [{ kind: "vector", vector, fields: "vector", k }] } : {}),
      }),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { value?: { hospitalName: string; rule: string; verdict: string; text: string; url: string }[] };
    return (j.value ?? []).map((d) => ({ hospital: d.hospitalName, rule: d.rule, verdict: d.verdict, text: d.text.slice(0, 900), url: d.url }));
  } catch {
    return [];
  }
}
