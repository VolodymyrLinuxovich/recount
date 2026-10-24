// The one place Recount talks to a language model. Every AI step (reading the bill, the second
// read of the charges column, drafting letters, the Lupa helper) goes through here, so the
// provider can change without touching the pipeline. Rules and money math never come from here.
//
// Pick a provider and model with env vars (all optional; the default is Anthropic Claude):
//   MODEL_PROVIDER          anthropic | openai | azure
//   MODEL_NAME              model (or, for azure, the deployment name)
//   MODEL_<TASK>_PROVIDER   per task: READ, COLUMN, LETTERS, CHAT
//   MODEL_<TASK>_NAME
//   MODEL_FALLBACK_PROVIDER / MODEL_FALLBACK_NAME   used if the first provider throws
//   MODEL_<TASK>_FALLBACK_PROVIDER / _NAME          a fallback for one task only
// Provider settings:
//   anthropic: ANTHROPIC_API_KEY
//   openai:    OPENAI_API_KEY, OPENAI_BASE_URL (default https://api.openai.com/v1); any
//              OpenAI-compatible endpoint works, including Azure AI Foundry's /models endpoint
//   azure:     AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_VERSION (default
//              2024-10-21), AZURE_OPENAI_DEPLOYMENT (the default deployment, e.g. gpt-4.1-mini)
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export type Task = "read" | "column" | "letters" | "chat";
export type Provider = "anthropic" | "openai" | "azure";

/** A piece of the user's message: text, or a file (image or PDF) as base64. */
export type Part = { type: "text"; text: string } | { type: "file"; mediaType: string; data: string };

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** What we record about every model call. Never the prompt or the bill. */
export type Run = {
  task: Task;
  provider: Provider;
  model: string;
  ms: number;
  inputTokens: number | null;
  outputTokens: number | null;
  ok: boolean;
  fallbackUsed: boolean;
  error?: string;
};

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-5",
  azure: "gpt-4.1-mini",
};

const defaultModel = (p: Provider) => (p === "azure" ? env("AZURE_OPENAI_DEPLOYMENT") : undefined) ?? DEFAULT_MODEL[p];

const isProvider = (p: string | undefined): p is Provider => p === "anthropic" || p === "openai" || p === "azure";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

type Choice = { provider: Provider; model: string };

/** The provider and model for a task, and the fallback if there is one. */
export function choose(task: Task): { primary: Choice; fallback: Choice | null } {
  const T = task.toUpperCase();
  const tp = env(`MODEL_${T}_PROVIDER`);
  const gp = env("MODEL_PROVIDER");
  const provider: Provider = isProvider(tp) ? tp : isProvider(gp) ? gp : "anthropic";
  const model = env(`MODEL_${T}_NAME`) ?? (provider === (isProvider(gp) ? gp : "anthropic") ? env("MODEL_NAME") : undefined) ?? defaultModel(provider);
  const tfp = env(`MODEL_${T}_FALLBACK_PROVIDER`);
  const gfp = env("MODEL_FALLBACK_PROVIDER");
  const fp = isProvider(tfp) ? tfp : isProvider(gfp) ? gfp : undefined;
  const fname = isProvider(tfp) ? env(`MODEL_${T}_FALLBACK_NAME`) : env("MODEL_FALLBACK_NAME");
  const fallback = fp ? { provider: fp, model: fname ?? defaultModel(fp) } : null;
  return { primary: { provider, model }, fallback: fallback && (fallback.provider !== provider || fallback.model !== model) ? fallback : null };
}

function configured(p: Provider): boolean {
  if (p === "anthropic") return !!env("ANTHROPIC_API_KEY");
  if (p === "openai") return !!env("OPENAI_API_KEY");
  return !!(env("AZURE_OPENAI_ENDPOINT") && env("AZURE_OPENAI_API_KEY"));
}

/** Is any model available for this task? If not, callers use their non-AI path. */
export function modelReady(task: Task): boolean {
  const { primary, fallback } = choose(task);
  return configured(primary.provider) || (!!fallback && configured(fallback.provider));
}

// ---------- Anthropic ----------

function anthropicContent(parts: Part[]): Anthropic.Beta.BetaContentBlockParam[] {
  return parts.map((p) => {
    if (p.type === "text") return { type: "text", text: p.text };
    if (p.mediaType === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.data } };
    return { type: "image", source: { type: "base64", media_type: p.mediaType as "image/png" | "image/jpeg" | "image/webp", data: p.data } };
  });
}

type Out<T> = { data: T | null; refused: boolean; inputTokens: number | null; outputTokens: number | null; model: string };

async function anthropicStructured<T>(model: string, system: string | undefined, parts: Part[], schema: z.ZodType<T>, maxTokens: number): Promise<Out<T>> {
  const client = new Anthropic();
  const res = await client.beta.messages.parse({
    model,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(schema as never) },
    ...(system ? { system } : {}),
    messages: [{ role: "user", content: anthropicContent(parts) }],
  });
  return {
    data: (res.parsed_output as T | null) ?? null,
    refused: res.stop_reason === "refusal",
    inputTokens: res.usage?.input_tokens ?? null,
    outputTokens: res.usage?.output_tokens ?? null,
    model: res.model ?? model,
  };
}

async function anthropicChat(model: string, system: string, messages: ChatMessage[], maxTokens: number, onText: (t: string) => void) {
  const client = new Anthropic();
  const stream = client.messages.stream({ model, max_tokens: maxTokens, output_config: { effort: "low" }, system, messages });
  let text = "";
  stream.on("text", (d) => {
    text += d;
    onText(text);
  });
  const final = await stream.finalMessage();
  return {
    text: final.stop_reason === "refusal" ? "" : text,
    refused: final.stop_reason === "refusal",
    inputTokens: final.usage?.input_tokens ?? null,
    outputTokens: final.usage?.output_tokens ?? null,
    model: final.model ?? model,
  };
}

// ---------- OpenAI-compatible (OpenAI, Azure OpenAI, Azure AI Foundry, others) ----------

function openaiTarget(provider: Provider, model: string): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  if (provider === "azure") {
    const base = env("AZURE_OPENAI_ENDPOINT")!.replace(/\/+$/, "");
    const version = env("AZURE_OPENAI_API_VERSION") ?? "2024-10-21";
    return {
      url: `${base}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${version}`,
      headers: { "api-key": env("AZURE_OPENAI_API_KEY")! },
      body: {},
    };
  }
  const base = (env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  return { url: `${base}/chat/completions`, headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}` }, body: { model } };
}

function openaiContent(parts: Part[]) {
  return parts.map((p) => {
    if (p.type === "text") return { type: "text", text: p.text };
    if (p.mediaType === "application/pdf") return { type: "file", file: { filename: "bill.pdf", file_data: `data:application/pdf;base64,${p.data}` } };
    return { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.data}` } };
  });
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, stream = false): Promise<Response> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Model API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  void stream;
  return res;
}

async function openaiStructured<T>(provider: Provider, model: string, system: string | undefined, parts: Part[], schema: z.ZodType<T>, maxTokens: number): Promise<Out<T>> {
  const t = openaiTarget(provider, model);
  const res = await postJson(t.url, t.headers, {
    ...t.body,
    max_completion_tokens: maxTokens,
    messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: openaiContent(parts) }],
    response_format: { type: "json_schema", json_schema: { name: "output", schema: z.toJSONSchema(schema as z.ZodType), strict: false } },
  });
  const j = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string | null; refusal?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const msg = j.choices?.[0]?.message;
  let data: T | null = null;
  if (msg?.content) {
    // The schema check is ours, not the provider's: a reply that doesn't match is treated as no reply.
    const parsed = schema.safeParse(JSON.parse(msg.content));
    if (parsed.success) data = parsed.data;
  }
  return { data, refused: !!msg?.refusal, inputTokens: j.usage?.prompt_tokens ?? null, outputTokens: j.usage?.completion_tokens ?? null, model: j.model ?? model };
}

async function openaiChat(provider: Provider, model: string, system: string, messages: ChatMessage[], maxTokens: number, onText: (t: string) => void) {
  const t = openaiTarget(provider, model);
  const res = await postJson(t.url, t.headers, {
    ...t.body,
    max_completion_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
    messages: [{ role: "system", content: system }, ...messages],
  });
  let text = "";
  let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
  let served = model;
  let refused = false;
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.model) served = ev.model;
        if (ev.usage) usage = ev.usage;
        const delta = ev.choices?.[0]?.delta;
        if (delta?.refusal) refused = true;
        if (delta?.content) {
          text += delta.content;
          onText(text);
        }
      } catch {
        // a partial or non-JSON line; skip it
      }
    }
  }
  return { text: refused ? "" : text, refused, inputTokens: usage?.prompt_tokens ?? null, outputTokens: usage?.completion_tokens ?? null, model: served };
}

// ---------- the interface the app uses ----------

async function attempt<R extends { inputTokens: number | null; outputTokens: number | null; model: string }>(
  task: Task,
  call: (c: Choice) => Promise<R>,
): Promise<{ out: R | null; run: Run; error?: unknown }> {
  const { primary, fallback } = choose(task);
  const order = [primary, ...(fallback ? [fallback] : [])].filter((c) => configured(c.provider));
  let lastErr: unknown = new Error("No model provider is configured");
  for (let i = 0; i < order.length; i++) {
    const c = order[i];
    const t0 = Date.now();
    try {
      const out = await call(c);
      return {
        out,
        run: { task, provider: c.provider, model: out.model, ms: Date.now() - t0, inputTokens: out.inputTokens, outputTokens: out.outputTokens, ok: true, fallbackUsed: i > 0 },
      };
    } catch (e) {
      lastErr = e;
      if (i === order.length - 1) {
        return {
          out: null,
          error: e,
          run: { task, provider: c.provider, model: c.model, ms: Date.now() - t0, inputTokens: null, outputTokens: null, ok: false, fallbackUsed: i > 0, error: String(e).slice(0, 160) },
        };
      }
    }
  }
  return { out: null, error: lastErr, run: { task, provider: primary.provider, model: primary.model, ms: 0, inputTokens: null, outputTokens: null, ok: false, fallbackUsed: false, error: String(lastErr).slice(0, 160) } };
}

/**
 * Ask for output that matches a zod schema. Returns the data (or null if the model declined or
 * didn't match the schema) and the run record. Throws only if every provider failed.
 */
export async function structured<T>(opts: { task: Task; system?: string; parts: Part[]; schema: z.ZodType<T>; maxTokens?: number }, record?: (r: Run) => Promise<void>): Promise<{ data: T | null; refused: boolean; run: Run }> {
  const max = opts.maxTokens ?? 8000;
  const { out, run, error } = await attempt(opts.task, (c) =>
    c.provider === "anthropic" ? anthropicStructured(c.model, opts.system, opts.parts, opts.schema, max) : openaiStructured(c.provider, c.model, opts.system, opts.parts, opts.schema, max),
  );
  const finalRun = out && !out.data ? { ...run, ok: false, error: out.refused ? "declined" : "no structured output" } : run;
  if (record) await record(finalRun).catch(() => {});
  if (!out) throw error;
  return { data: out.data, refused: out.refused, run: finalRun };
}

/** A streamed chat reply. onText gets the whole text so far. */
export async function chat(opts: { task: Task; system: string; messages: ChatMessage[]; maxTokens?: number; onText?: (t: string) => void }, record?: (r: Run) => Promise<void>): Promise<{ text: string; refused: boolean; run: Run }> {
  const max = opts.maxTokens ?? 2000;
  const onText = opts.onText ?? (() => {});
  const { out, run, error } = await attempt(opts.task, (c) =>
    c.provider === "anthropic" ? anthropicChat(c.model, opts.system, opts.messages, max, onText) : openaiChat(c.provider, c.model, opts.system, opts.messages, max, onText),
  );
  if (record) await record(run).catch(() => {});
  if (!out) throw error;
  return { text: out.text, refused: out.refused, run };
}

/** A file as a message part. */
export async function filePart(blob: Blob, mediaType: string): Promise<Part> {
  return { type: "file", mediaType, data: Buffer.from(await blob.arrayBuffer()).toString("base64") };
}
