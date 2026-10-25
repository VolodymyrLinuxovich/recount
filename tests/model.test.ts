import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { choose, modelReady, structured } from "../convex/lib/model";
import { PIPELINE, kindOf } from "../convex/lib/pipeline";

const KEYS = ["MODEL_CHAT_FALLBACK_PROVIDER", "AZURE_OPENAI_DEPLOYMENT", "MODEL_PROVIDER", "MODEL_NAME", "MODEL_READ_PROVIDER", "MODEL_READ_NAME", "MODEL_FALLBACK_PROVIDER", "MODEL_FALLBACK_NAME", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
});
const set = (e: Record<string, string>) => {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, e);
};

describe("model choice", () => {
  it("defaults to Claude", () => {
    set({});
    expect(choose("read")).toEqual({ primary: { provider: "anthropic", model: "claude-opus-5-5" }, fallback: null });
  });
  it("uses the global provider and model", () => {
    set({ MODEL_PROVIDER: "azure", MODEL_NAME: "my-gpt-deployment" });
    expect(choose("letters").primary).toEqual({ provider: "azure", model: "my-gpt-deployment" });
  });
  it("lets one task use a different provider", () => {
    set({ MODEL_PROVIDER: "azure", MODEL_NAME: "dep", MODEL_READ_PROVIDER: "anthropic" });
    expect(choose("read").primary).toEqual({ provider: "anthropic", model: "claude-opus-5-5" });
    expect(choose("chat").primary).toEqual({ provider: "azure", model: "dep" });
  });
  it("adds a fallback, but not the same model twice", () => {
    set({ MODEL_PROVIDER: "openai", MODEL_FALLBACK_PROVIDER: "anthropic" });
    expect(choose("chat").fallback).toEqual({ provider: "anthropic", model: "claude-opus-5-5" });
    set({ MODEL_FALLBACK_PROVIDER: "anthropic" });
    expect(choose("chat").fallback).toBeNull();
  });
  it("gives one task its own fallback, using the Azure deployment name", () => {
    set({ MODEL_CHAT_FALLBACK_PROVIDER: "azure", AZURE_OPENAI_DEPLOYMENT: "gpt-4.1-mini" });
    expect(choose("chat").fallback).toEqual({ provider: "azure", model: "gpt-4.1-mini" });
    expect(choose("read").fallback).toBeNull();
  });
  it("ignores unknown provider names", () => {
    set({ MODEL_PROVIDER: "something" });
    expect(choose("read").primary.provider).toBe("anthropic");
  });
  it("is ready only when a configured provider has keys", () => {
    set({ MODEL_PROVIDER: "azure" });
    expect(modelReady("read")).toBe(false);
    set({ MODEL_PROVIDER: "azure", MODEL_FALLBACK_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "x" });
    expect(modelReady("read")).toBe(true);
  });
});

describe("pipeline map", () => {
  it("keeps money, rules and sending away from AI", () => {
    for (const key of ["check", "eligibility", "compare-reads", "letters-check", "hospital", "eob-check"]) expect(kindOf(key)).toBe("rule");
    expect(kindOf("approve")).toBe("person");
    expect(PIPELINE.filter((p) => p.kind === "ai").map((p) => p.key)).toEqual(["read", "read-column", "eob-read", "letters", "chat"]);
  });
});

import { dollarsIn, inventedAmounts } from "../convex/lib/letterCheck";
describe("letter amount check", () => {
  const facts = { bill: { lines: [{ charge: 3694 }, { charge: 72 }], totalCharges: 5006 }, findings: [{ amount: 54, detail: "The lines add up to $5,060.00" }], eligibility: { fplPercent: 138, cutoff: 62_640 } };
  it("reads dollar amounts", () => {
    expect(dollarsIn("We owe $3,694.00 and $72, not $5,006.10")).toEqual([3694, 72, 5006.1]);
  });
  it("passes amounts that come from the facts", () => {
    expect(inventedAmounts(["Line charged $3,694.00. Lines add up to $5,060.00 but the total says $5,006."], facts)).toEqual([]);
  });
  it("flags an amount the facts don't have", () => {
    expect(inventedAmounts(["You were overcharged $1,250.00 and owe $72."], facts)).toEqual([1250]);
  });
});

describe("structured output fallback", () => {
  const Schema = z.object({ answer: z.string() });
  const reply = (content: string) =>
    new Response(JSON.stringify({ model: "m", choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
  afterEach(() => vi.unstubAllGlobals());

  it("tries the fallback when the first provider returns no usable data", async () => {
    set({ MODEL_PROVIDER: "openai", OPENAI_API_KEY: "k", MODEL_FALLBACK_PROVIDER: "azure", AZURE_OPENAI_ENDPOINT: "https://x.example", AZURE_OPENAI_API_KEY: "k" });
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return urls.length === 1 ? reply(JSON.stringify({ wrong: 1 })) : reply(JSON.stringify({ answer: "ok" }));
    });
    const res = await structured({ task: "letters", parts: [{ type: "text", text: "hi" }], schema: Schema });
    expect(res.data).toEqual({ answer: "ok" });
    expect(res.run.fallbackUsed).toBe(true);
    expect(urls).toHaveLength(2);
  });

  it("returns no data without a fallback, as before", async () => {
    set({ MODEL_PROVIDER: "openai", OPENAI_API_KEY: "k" });
    vi.stubGlobal("fetch", async () => reply(JSON.stringify({ wrong: 1 })));
    const res = await structured({ task: "letters", parts: [{ type: "text", text: "hi" }], schema: Schema });
    expect(res.data).toBeNull();
    expect(res.run.ok).toBe(false);
  });
});
