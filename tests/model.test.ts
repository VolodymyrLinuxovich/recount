import { afterEach, describe, expect, it } from "vitest";
import { choose, modelReady } from "../convex/lib/model";
import { PIPELINE, kindOf } from "../convex/lib/pipeline";

const KEYS = ["MODEL_PROVIDER", "MODEL_NAME", "MODEL_READ_PROVIDER", "MODEL_READ_NAME", "MODEL_FALLBACK_PROVIDER", "MODEL_FALLBACK_NAME", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY"];
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
    for (const key of ["check", "eligibility", "compare-reads", "letters-check", "hospital"]) expect(kindOf(key)).toBe("rule");
    expect(kindOf("approve")).toBe("person");
    expect(PIPELINE.filter((p) => p.kind === "ai").map((p) => p.key)).toEqual(["read", "read-column", "letters", "chat"]);
  });
});
