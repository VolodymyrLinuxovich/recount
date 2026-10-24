// Public: who does each part of Recount (rules, AI or the patient), and what the AI may not do.
import { query } from "./_generated/server";
import { AI_MAY, AI_MAY_NOT, PIPELINE } from "./lib/pipeline";
import { choose, type Task } from "./lib/model";

export const map = query({
  args: {},
  handler: async () => ({
    steps: PIPELINE,
    aiMay: AI_MAY,
    aiMayNot: AI_MAY_NOT,
    // Which provider and model each AI task uses right now (no keys, just names).
    models: Object.fromEntries((["read", "column", "letters", "chat"] as Task[]).map((t) => [t, choose(t)])),
  }),
});
