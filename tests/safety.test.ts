import { afterEach, describe, expect, it } from "vitest";
import { checkText, judge } from "../convex/lib/safety";
import { privacyFacts, processors } from "../convex/lib/privacy";

const KEYS = ["AZURE_DOCINTEL_ENDPOINT", "AZURE_DOCINTEL_KEY", "AZURE_CONTENT_SAFETY_ENDPOINT", "AZURE_CONTENT_SAFETY_KEY", "AZURE_SEARCH_ENDPOINT", "AZURE_SEARCH_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "MODEL_CHAT_FALLBACK_PROVIDER", "MODEL_FALLBACK_PROVIDER", "MODEL_PROVIDER", "ANTHROPIC_API_KEY"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
const clear = () => KEYS.forEach((k) => delete process.env[k]);

describe("safety judge", () => {
  it("never blocks a patient describing an injury", () => {
    expect(judge({ Violence: 6 }, "patient")).toBe("ok");
  });
  it("blocks violent replies", () => {
    expect(judge({ Violence: 4 }, "reply")).toBe("blocked");
  });
  it("answers self-harm with the crisis message, not a refusal", () => {
    expect(judge({ SelfHarm: 2 }, "patient")).toBe("crisis");
    expect(judge({ SelfHarm: 2 }, "reply")).toBe("ok");
    expect(judge({ SelfHarm: 4 }, "reply")).toBe("crisis");
  });
  it("blocks hate and sexual content", () => {
    expect(judge({ Hate: 4 }, "patient")).toBe("blocked");
    expect(judge({ Sexual: 5 }, "reply")).toBe("blocked");
  });
  it("lets everything through when the service is off", async () => {
    clear();
    expect(await checkText("anything", "patient")).toBe("ok");
  });
});

describe("privacy facts", () => {
  it("names only Anthropic and Apify when Azure is off", () => {
    clear();
    process.env.ANTHROPIC_API_KEY = "x";
    const t = privacyFacts();
    expect(t).toContain("Anthropic");
    expect(t).toContain("Apify");
    expect(t).not.toMatch(/Azure|Microsoft/);
    expect(processors()).toEqual({ azureOpenAI: false, openAI: false, contentSafety: false, search: false, docIntel: false });
  });
  it("names Content Safety when it is on", () => {
    clear();
    process.env.AZURE_CONTENT_SAFETY_ENDPOINT = "https://x";
    process.env.AZURE_CONTENT_SAFETY_KEY = "k";
    expect(privacyFacts()).toContain("Azure AI Content Safety");
  });
  it("names Document Intelligence when it is on", () => {
    clear();
    process.env.AZURE_DOCINTEL_ENDPOINT = "https://x";
    process.env.AZURE_DOCINTEL_KEY = "k";
    expect(processors().docIntel).toBe(true);
    expect(privacyFacts()).toContain("Azure AI Document Intelligence");
    delete process.env.AZURE_DOCINTEL_ENDPOINT;
    delete process.env.AZURE_DOCINTEL_KEY;
  });
});
