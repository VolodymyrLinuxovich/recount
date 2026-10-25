// Public, read-only numbers for the /dashboard page and the MCP server (src/app/api/mcp).
// Only counts, timings and pass rates from agentMetrics: never a case, a bill or a message.

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const BUCKET_MS = 15 * 60 * 1000;

function pct(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function summarize(rows: Doc<"agentMetrics">[]) {
  const ms = rows.map((r) => r.ms).filter((x) => x > 0).sort((a, b) => a - b);
  const scored = rows.filter((r) => r.score != null);
  const ok = rows.filter((r) => r.ok).length;
  return {
    runs: rows.length,
    ok,
    okRate: rows.length ? ok / rows.length : null,
    p50ms: pct(ms, 0.5),
    p90ms: pct(ms, 0.9),
    score: scored.length ? scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length : null,
    fallbacks: rows.filter((r) => r.fallbackUsed).length,
    tokens: rows.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0),
    usd: rows.reduce((s, r) => s + (r.usd ?? 0), 0),
    lastAt: rows.length ? Math.max(...rows.map((r) => r.at)) : null,
    models: [...new Set(rows.map((r) => r.model).filter((m): m is string => Boolean(m)))],
  };
}

export const summary = query({
  args: { hours: v.optional(v.number()) },
  handler: async (ctx, { hours }) => {
    const now = Date.now();
    const since = now - Math.min(Math.max(hours ?? 48, 1), 24 * 30) * 3600 * 1000;
    const rows = (await ctx.db.query("agentMetrics").withIndex("by_at", (q) => q.gt("at", since)).collect()).filter((r) => r.agent !== "_marker");

    const byAgent = new Map<string, Doc<"agentMetrics">[]>();
    for (const r of rows) byAgent.set(r.agent, [...(byAgent.get(r.agent) ?? []), r]);
    const agents = [...byAgent.entries()].map(([agent, rs]) => ({ agent, ...summarize(rs) })).sort((a, b) => b.runs - a.runs);

    // Time series: per 15 minutes, per agent: runs, successes, median time, mean score.
    const buckets = new Map<string, Doc<"agentMetrics">[]>();
    for (const r of rows) {
      const k = `${Math.floor(r.at / BUCKET_MS) * BUCKET_MS}|${r.agent}`;
      buckets.set(k, [...(buckets.get(k) ?? []), r]);
    }
    const series = [...buckets.entries()]
      .map(([k, rs]) => {
        const [t, agent] = k.split("|");
        const s = summarize(rs);
        return { t: Number(t), agent, runs: s.runs, ok: s.ok, p50ms: s.p50ms, score: s.score };
      })
      .sort((a, b) => a.t - b.t);

    const recent = rows
      .slice(-15)
      .reverse()
      .map((r) => ({ at: r.at, agent: r.agent, model: r.model ?? null, ms: r.ms, ok: r.ok }));

    // Convex itself: how much the real-time backend has handled.
    const cases = (await ctx.db.query("cases").take(20000)).length;
    const steps = (await ctx.db.query("steps").take(50000)).length;
    const chat = (await ctx.db.query("chatMessages").take(50000)).length;

    return { now, since, bucketMs: BUCKET_MS, total: summarize(rows), agents, series, recent, convex: { cases, steps, chat } };
  },
});
