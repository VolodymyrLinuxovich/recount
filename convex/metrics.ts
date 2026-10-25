// The dashboard's numbers: an append-only log of what each agent did (convex/schema.ts agentMetrics),
// plus Apify's own record of every run of our Actor, pulled in on a schedule.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";

const metric = {
  agent: v.string(),
  provider: v.optional(v.string()),
  model: v.optional(v.string()),
  ms: v.number(),
  ok: v.boolean(),
  inputTokens: v.optional(v.union(v.number(), v.null())),
  outputTokens: v.optional(v.union(v.number(), v.null())),
  fallbackUsed: v.optional(v.boolean()),
  score: v.optional(v.number()),
  usd: v.optional(v.number()),
  ref: v.optional(v.string()),
  at: v.optional(v.number()),
};

export const log = internalMutation({
  args: metric,
  handler: async (ctx, a) => {
    await ctx.db.insert("agentMetrics", { ...a, at: a.at ?? Date.now() });
  },
});

/** Insert outside records (Apify runs) once each, keyed by their own id. */
export const importMany = internalMutation({
  args: { rows: v.array(v.object({ ...metric, ref: v.string(), at: v.number() })) },
  handler: async (ctx, { rows }) => {
    let added = 0;
    for (const r of rows) {
      const seen = await ctx.db.query("agentMetrics").withIndex("by_ref", (q) => q.eq("ref", r.ref)).first();
      if (seen) continue;
      await ctx.db.insert("agentMetrics", r);
      added++;
    }
    return added;
  },
});

/** Model calls recorded on bills before this log existed (cases still on file), copied once. */
export const backfillRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const done = await ctx.db.query("agentMetrics").withIndex("by_ref", (q) => q.eq("ref", "backfill:agentRuns")).first();
    if (done) return 0;
    const first = await ctx.db.query("agentMetrics").withIndex("by_at").first();
    const before = first?.at ?? Number.MAX_SAFE_INTEGER;
    let n = 0;
    for (const r of await ctx.db.query("agentRuns").collect()) {
      if (r.at >= before) continue;
      const { task, provider, model, ms, inputTokens, outputTokens, ok, fallbackUsed, at } = r;
      await ctx.db.insert("agentMetrics", { agent: task, provider, model, ms, inputTokens, outputTokens, ok, fallbackUsed, at });
      n++;
    }
    await ctx.db.insert("agentMetrics", { agent: "_marker", ms: 0, ok: true, at: 0, ref: "backfill:agentRuns" });
    return n;
  },
});

export const lastApifyRun = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("agentMetrics").withIndex("by_at").order("desc").take(500);
    return rows.find((r) => r.agent === "apify")?.at ?? 0;
  },
});

type ApifyRun = { id: string; status: string; startedAt: string; finishedAt: string | null; usageTotalUsd?: number };

/** Pull our Actor's run history from Apify (status, start, finish, cost) into the log. */
export const syncApify = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    await ctx.runMutation(internal.metrics.backfillRuns, {});
    const token = process.env.APIFY_TOKEN;
    const actor = process.env.APIFY_ACTOR_ID;
    if (!token || !actor) return 0;
    const since = await ctx.runQuery(internal.metrics.lastApifyRun, {});
    let added = 0;
    for (let offset = 0; offset < 5000; offset += 1000) {
      const res = await fetch(`https://api.apify.com/v2/acts/${actor}/runs?desc=1&limit=1000&offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) break;
      const items = ((await res.json()) as { data: { items: ApifyRun[] } }).data.items;
      const rows = items
        .filter((r) => r.finishedAt && r.status !== "RUNNING" && r.status !== "READY")
        .map((r) => {
          const at = Date.parse(r.startedAt);
          return {
            agent: "apify",
            provider: "apify",
            model: "hospital-price-and-charity-finder",
            ms: Math.max(0, Date.parse(r.finishedAt!) - at),
            ok: r.status === "SUCCEEDED",
            usd: r.usageTotalUsd ?? undefined,
            ref: `apify:${r.id}`,
            at,
          };
        });
      for (let i = 0; i < rows.length; i += 200) added += await ctx.runMutation(internal.metrics.importMany, { rows: rows.slice(i, i + 200) });
      // Older pages are already in: stop once a page reaches what we had.
      if (items.length < 1000 || rows.some((r) => r.at <= since)) break;
    }
    return added;
  },
});
