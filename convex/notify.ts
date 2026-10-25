// Phone notifications when a bill's background work finishes (the patient may have left the app).
// The phone registers its Expo push token for one bill; we send through Expo's push service.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import { owned } from "./cases";
import { limit } from "./lib/limit";
import { isExpoPushToken, noticeFor, noticeText, type NoticeStatus } from "./lib/notice";
import { timeoutSignal } from "./lib/timeout";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** The phone asks to hear about this bill. Needs the bill's secret token, like every other call. */
export const register = mutation({
  args: { id: v.id("cases"), token: v.optional(v.string()), pushToken: v.string(), platform: v.optional(v.string()) },
  handler: async (ctx, { id, token, pushToken, platform }) => {
    const c = await owned(ctx, id, token);
    if (!c) return false;
    if (!isExpoPushToken(pushToken)) return false;
    await limit(ctx, `push:${id}`, 10, 60_000);
    const have = await ctx.db.query("pushTokens").withIndex("by_case", (q) => q.eq("caseId", id)).collect();
    if (have.some((p) => p.pushToken === pushToken)) return true;
    if (have.length >= 5) return false;
    await ctx.db.insert("pushTokens", { caseId: id, pushToken, platform: platform?.slice(0, 10), createdAt: Date.now() });
    return true;
  },
});

/** Call from a mutation that moves a bill from `c.status` to `next`: schedules the notice if it is one. */
export async function notifyOnStatus(ctx: MutationCtx, c: Doc<"cases">, next: string | undefined, findings?: unknown) {
  const status = noticeFor(c.status, next);
  if (!status) return;
  // Most bills (every web bill) have no phone registered: skip the action entirely.
  if (!(await ctx.db.query("pushTokens").withIndex("by_case", (q) => q.eq("caseId", c._id)).first())) return;
  const n = Array.isArray(findings) ? findings.length : Array.isArray(c.findings) ? c.findings.length : 0;
  await ctx.scheduler.runAfter(0, internal.notify.send, { caseId: c._id, status, findings: n });
}

export const tokensFor = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.db.get(caseId);
    if (!c) return null;
    const tokens = await ctx.db.query("pushTokens").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
    return { lang: c.lang, status: c.status, tokens: tokens.map((t) => t.pushToken) };
  },
});

/** Drop tokens Expo says no longer reach a phone (the app was removed, or notifications turned off). */
export const forget = internalMutation({
  args: { caseId: v.id("cases"), pushTokens: v.array(v.string()) },
  handler: async (ctx, { caseId, pushTokens }) => {
    for (const p of await ctx.db.query("pushTokens").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()) {
      if (pushTokens.includes(p.pushToken)) await ctx.db.delete(p._id);
    }
  },
});

/** Remove a bill's push tokens (when the bill is deleted). */
export async function removeTokens(ctx: MutationCtx, caseId: Id<"cases">) {
  for (const p of await ctx.db.query("pushTokens").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()) await ctx.db.delete(p._id);
}

export const send = internalAction({
  args: {
    caseId: v.id("cases"),
    status: v.union(v.literal("needs_household"), v.literal("confirm_hospital"), v.literal("ready"), v.literal("error")),
    findings: v.optional(v.number()),
  },
  handler: async (ctx, { caseId, status, findings }) => {
    const info = await ctx.runQuery(internal.notify.tokensFor, { caseId });
    // Nothing registered, or the bill already moved on (a stale notice would only confuse).
    if (!info || !info.tokens.length || info.status !== status) return;
    const { title, body } = noticeText(status as NoticeStatus, info.lang, findings);
    // No bill details in the notice: it shows on a lock screen.
    const messages = info.tokens.map((to) => ({
      to,
      title,
      body,
      sound: "default",
      priority: "high",
      channelId: "bill-updates",
      data: { caseId, status },
    }));
    let res: Response;
    try {
      res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
        signal: timeoutSignal(10_000),
      });
    } catch (e) {
      console.warn("push send failed", String(e).slice(0, 200));
      return;
    }
    if (!res.ok) {
      console.warn("push send failed", res.status, (await res.text()).slice(0, 200));
      return;
    }
    const out = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
    const gone = (out?.data ?? []).flatMap((r, i) => (r.status === "error" && r.details?.error === "DeviceNotRegistered" ? [info.tokens[i]] : []));
    if (gone.length) await ctx.runMutation(internal.notify.forget, { caseId, pushTokens: gone });
    const other = (out?.data ?? []).filter((r) => r.status === "error" && r.details?.error !== "DeviceNotRegistered");
    if (other.length) console.warn("push errors", JSON.stringify(other).slice(0, 300));
  },
});
