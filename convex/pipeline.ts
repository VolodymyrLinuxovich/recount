// Public: who does each part of Recount (rules, AI or the patient), and what the AI may not do.
import { query } from "./_generated/server";
import { AI_MAY, AI_MAY_NOT, PIPELINE } from "./lib/pipeline";
import { choose, type Task } from "./lib/model";
import { privacyFacts, processors } from "./lib/privacy";
import { DOCINTEL_MODEL, docIntelOn } from "./lib/docIntel";

export const map = query({
  args: {},
  handler: async () => ({
    steps: PIPELINE,
    aiMay: AI_MAY,
    aiMayNot: AI_MAY_NOT,
    // Which outside services get data right now, and the privacy text Lupa answers from.
    processors: processors(),
    privacy: privacyFacts(),
    // Which provider and model each AI task uses right now (no keys, just names).
    // With Document Intelligence on, the second read of the charges is Azure, and the Claude column read is its backup.
    models: Object.fromEntries(
      (["read", "column", "letters", "chat"] as Task[]).map((t) => [
        t,
        t === "column" && docIntelOn() ? { primary: { provider: "azure-docintel", model: DOCINTEL_MODEL }, fallback: choose("column").primary } : choose(t),
      ]),
    ),
  }),
});
