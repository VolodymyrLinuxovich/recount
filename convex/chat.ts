// The in-app helper. A patient can ask questions about their bill; the reply streams into
// the chatMessages table so the phone shows it as it's typed.
//
// Safety rules live in the system prompt AND in what we pass: the case data goes in as
// clearly marked data, never as instructions, because bill text is untrusted.
// Privacy: a conversation is bound to the case it started with, and every read or write
// of a case's conversation needs that case's secret token.

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";

const Lang = v.union(v.literal("en"), v.literal("es"));
const MAX_MESSAGE = 1500;
const STALE_MS = 90_000; // a reply still "pending" after this long is treated as finished

async function caseIfOwned(ctx: QueryCtx, caseId: Id<"cases"> | undefined, token: string | undefined) {
  if (!caseId) return null;
  const c = await ctx.db.get(caseId);
  if (!c) return null;
  if (c.ownerId) {
    const userId = await getAuthUserId(ctx);
    if (userId && userId === c.ownerId) return c;
  }
  if (c.token && c.token !== token) return null;
  return c;
}

async function sessionMessages(ctx: QueryCtx, sessionId: string): Promise<Doc<"chatMessages">[]> {
  return await ctx.db.query("chatMessages").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect();
}

/**
 * May this caller use this conversation? A session that was ever tied to a case stays tied to
 * it: the caller must name that case and hold its token. A case-free session can't be pulled
 * into a case later, and a case session can't be read without the case.
 */
async function allowed(ctx: QueryCtx, msgs: Doc<"chatMessages">[], caseId: Id<"cases"> | undefined, token: string | undefined) {
  const bound = msgs.find((m) => m.caseId)?.caseId;
  if (bound && bound !== caseId) return false;
  if (!bound && caseId && msgs.length) return false;
  if (caseId && !(await caseIfOwned(ctx, caseId, token))) return false;
  return true;
}

/** Remove things nobody should send to a chat: SSN-like numbers and long account/card numbers. */
export function redact(text: string): string {
  return text
    .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, "[number removed]")
    .replace(/\b(?:\d[\s-]?){8,17}\b/g, "[number removed]");
}

/** Messages for one conversation (a case's chat, or a case-free chat before there is a bill). */
export const list = query({
  args: { sessionId: v.string(), caseId: v.optional(v.id("cases")), token: v.optional(v.string()) },
  handler: async (ctx, { sessionId, caseId, token }) => {
    const msgs = await sessionMessages(ctx, sessionId);
    if (!(await allowed(ctx, msgs, caseId, token))) return [];
    const now = Date.now();
    return msgs.map((m) => (m.pending && now - m.at > STALE_MS ? { ...m, pending: false } : m));
  },
});

/** The patient sends a message. Returns immediately; the reply streams into the same list. */
export const send = mutation({
  args: { sessionId: v.string(), caseId: v.optional(v.id("cases")), token: v.optional(v.string()), lang: Lang, content: v.string() },
  handler: async (ctx, { sessionId, caseId, token, lang, content }) => {
    const es = lang === "es";
    const raw = content.trim();
    if (!raw) return;
    if (raw.length > MAX_MESSAGE) {
      throw new ConvexError(es ? `Su mensaje es demasiado largo (máximo ${MAX_MESSAGE} caracteres).` : `Your message is too long (${MAX_MESSAGE} characters max).`);
    }
    if (sessionId.length < 16 || sessionId.length > 100) throw new ConvexError("Bad session");
    const msgs = await sessionMessages(ctx, sessionId);
    if (!(await allowed(ctx, msgs, caseId, token))) throw new ConvexError(es ? "No se encontró la conversación." : "Conversation not found.");

    // Per-conversation limit: 20 questions per 10 minutes.
    const now = Date.now();
    if (msgs.filter((m) => m.role === "user" && now - m.at < 10 * 60_000).length >= 20) {
      throw new ConvexError(es ? "Demasiadas preguntas seguidas. Espere unos minutos." : "Too many questions in a row. Please wait a few minutes.");
    }
    if (msgs.some((m) => m.role === "assistant" && m.pending && now - m.at < STALE_MS)) {
      throw new ConvexError(es ? "Espere a que termine la respuesta." : "Please wait for the answer to finish.");
    }
    // Close any reply that got stuck, so it never blocks the conversation.
    for (const m of msgs) if (m.pending) await ctx.db.patch(m._id, { pending: false, content: m.content || "…" });

    await ctx.db.insert("chatMessages", { sessionId, caseId, role: "user", content: redact(raw), at: now, pending: false });
    const replyId = await ctx.db.insert("chatMessages", { sessionId, caseId, role: "assistant", content: "", at: now + 1, pending: true });
    await ctx.scheduler.runAfter(0, internal.chatAgent.reply, { replyId, sessionId, caseId, lang });
  },
});

// ---- used by the reply action ----

export const history = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => (await sessionMessages(ctx, sessionId)).filter((m) => m.content).slice(-20),
});

export const caseForChat = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => ctx.db.get(caseId),
});

export const write = internalMutation({
  args: { id: v.id("chatMessages"), content: v.string(), pending: v.boolean() },
  handler: async (ctx, { id, content, pending }) => {
    const m = await ctx.db.get(id);
    // A finished reply is final: a late streaming write must never reopen it.
    if (!m || (!m.pending && pending)) return;
    await ctx.db.patch(id, { content, pending });
  },
});
