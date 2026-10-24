// The in-app helper. A patient can ask questions about their bill; the reply streams into
// the chatMessages table so the phone shows it as it's typed.
//
// Safety rules live in the system prompt AND in what we pass: the case data goes in as
// clearly marked data, never as instructions, because bill text is untrusted.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

const Lang = v.union(v.literal("en"), v.literal("es"));
const MAX_MESSAGE = 1500;

async function caseIfOwned(ctx: { db: { get: (id: Id<"cases">) => Promise<Doc<"cases"> | null> } }, caseId: Id<"cases"> | undefined, token: string | undefined) {
  if (!caseId) return null;
  const c = await ctx.db.get(caseId);
  if (!c || (c.token && c.token !== token)) return null;
  return c;
}

/** Messages for one conversation (a case's chat, or an anonymous session before there is a case). */
export const list = query({
  args: { sessionId: v.string(), caseId: v.optional(v.id("cases")), token: v.optional(v.string()) },
  handler: async (ctx, { sessionId, caseId, token }) => {
    if (caseId && !(await caseIfOwned(ctx, caseId, token))) return [];
    return await ctx.db
      .query("chatMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
  },
});

/** The patient sends a message. Returns immediately; the reply streams into the same list. */
export const send = mutation({
  args: { sessionId: v.string(), caseId: v.optional(v.id("cases")), token: v.optional(v.string()), lang: Lang, content: v.string() },
  handler: async (ctx, { sessionId, caseId, token, lang, content }) => {
    const text = content.trim().slice(0, MAX_MESSAGE);
    if (!text) return;
    if (sessionId.length < 16 || sessionId.length > 100) throw new ConvexError("Bad session");
    if (caseId && !(await caseIfOwned(ctx, caseId, token))) throw new ConvexError("Case not found");

    // Per-conversation limit: 20 questions per 10 minutes.
    const recent = await ctx.db
      .query("chatMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
    const now = Date.now();
    if (recent.filter((m) => m.role === "user" && now - m.at < 10 * 60_000).length >= 20) {
      throw new ConvexError(lang === "es" ? "Demasiadas preguntas seguidas. Espere unos minutos." : "Too many questions in a row. Please wait a few minutes.");
    }
    if (recent.some((m) => m.role === "assistant" && m.pending)) {
      throw new ConvexError(lang === "es" ? "Espere a que termine la respuesta." : "Please wait for the answer to finish.");
    }

    await ctx.db.insert("chatMessages", { sessionId, caseId, role: "user", content: text, at: now, pending: false });
    const replyId = await ctx.db.insert("chatMessages", { sessionId, caseId, role: "assistant", content: "", at: now + 1, pending: true });
    await ctx.scheduler.runAfter(0, internal.chatAgent.reply, { replyId, sessionId, caseId, lang });
  },
});

// ---- used by the reply action ----

export const history = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) =>
    (await ctx.db.query("chatMessages").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect())
      .filter((m) => m.content || !m.pending)
      .slice(-20),
});

export const caseForChat = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => ctx.db.get(caseId),
});

export const write = internalMutation({
  args: { id: v.id("chatMessages"), content: v.string(), pending: v.boolean() },
  handler: async (ctx, { id, content, pending }) => {
    await ctx.db.patch(id, { content, pending });
  },
});
