// The in-app helper. A patient can ask questions about their bill; the reply streams into
// the chatMessages table so the phone shows it as it's typed.
//
// Safety rules live in the system prompt AND in what we pass: the case data goes in as
// clearly marked data, never as instructions, because bill text is untrusted.
// Privacy: a conversation is bound to the case it started with, and every read or write
// of a case's conversation needs that case's secret token.

import { limit } from "./lib/limit";
import { FILE_KEEP_MS, FRESH_MS, attachMessage, attachProblem, attachType, cleanFileName } from "./lib/attach";
import { currentUser } from "./lib/user";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

const Lang = v.union(v.literal("en"), v.literal("es"));
const MAX_MESSAGE = 1500;
const STALE_MS = 90_000; // a reply still "pending" after this long is treated as finished

async function caseIfOwned(ctx: QueryCtx, caseId: Id<"cases"> | undefined, token: string | undefined) {
  if (!caseId) return null;
  const c = await ctx.db.get(caseId);
  if (!c) return null;
  if (c.ownerId) {
    const userId = await currentUser(ctx);
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

/** Delete a stored file if it's still there (a file can be gone already, e.g. after its 30 days). */
export async function deleteStored(ctx: MutationCtx, id: Id<"_storage"> | undefined) {
  if (id && (await ctx.db.system.get(id))) await ctx.storage.delete(id);
}

/** Delete a bill's conversation: every message and every file attached to it. */
export async function deleteChatForCase(ctx: MutationCtx, caseId: Id<"cases">) {
  for (const m of await ctx.db.query("chatMessages").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()) {
    await deleteStored(ctx, m.fileId);
    await ctx.db.delete(m._id);
  }
}

/** Messages for one conversation (a case's chat, or a case-free chat before there is a bill). */
export const list = query({
  args: { sessionId: v.string(), caseId: v.optional(v.id("cases")), token: v.optional(v.string()) },
  handler: async (ctx, { sessionId, caseId, token }) => {
    const msgs = await sessionMessages(ctx, sessionId);
    // File links are made only after the access check, so only this conversation's owner gets them.
    if (!(await allowed(ctx, msgs, caseId, token))) return [];
    const now = Date.now();
    return await Promise.all(
      msgs.map(async ({ fileId, ...m }) => ({
        ...m,
        pending: m.pending && now - m.at <= STALE_MS,
        fileUrl: fileId ? await ctx.storage.getUrl(fileId) : null,
      })),
    );
  },
});

/** Where the phone or browser uploads a photo or PDF to attach to a chat message. */
export const generateUploadUrl = mutation({
  args: { lang: v.optional(Lang) },
  handler: async (ctx, { lang }) => {
    const busy = lang === "es" ? "Muchas personas están subiendo archivos ahora. Intente en un minuto." : "Lots of uploads right now. Please try again in a minute.";
    await limit(ctx, "chatUpload", 30, 60_000, busy);
    return ctx.storage.generateUploadUrl();
  },
});

/** The patient sends a message. Returns immediately; the reply streams into the same list. */
export const send = mutation({
  args: {
    sessionId: v.string(),
    caseId: v.optional(v.id("cases")),
    token: v.optional(v.string()),
    lang: Lang,
    content: v.string(),
    /** An optional photo or PDF, uploaded first with generateUploadUrl. */
    fileId: v.optional(v.id("_storage")),
    fileType: v.optional(v.string()),
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, caseId, token, lang, content, fileId, fileType, fileName }) => {
    const es = lang === "es";
    const raw = content.trim();
    if (!raw && !fileId) return;
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
    // Overall and per-bill caps, since a new session id is free to make.
    const busy = es ? "Muchas personas están preguntando ahora. Intente en un minuto." : "Lots of questions right now. Please try again in a minute.";
    await limit(ctx, "chat", 120, 60_000, busy);
    if (caseId) await limit(ctx, `chat:${caseId}`, 30, 10 * 60_000, busy);

    // The attachment: checked against what was actually stored, not what the app says it is.
    let file: { fileId: Id<"_storage">; fileType: string; fileName?: string } | undefined;
    if (fileId) {
      const meta = await ctx.db.system.get(fileId);
      const reused = !!(await ctx.db.query("chatMessages").withIndex("by_file", (q) => q.eq("fileId", fileId)).first());
      const c = caseId ? await ctx.db.get(caseId) : null;
      const caseFile = !!c && (c.fileId === fileId || c.eobFileId === fileId);
      const stale = !meta || now - meta._creationTime > FRESH_MS || reused || caseFile;
      const problem = stale ? "missing" : attachProblem(meta, fileType);
      if (problem) throw new ConvexError(attachMessage(problem, lang));
      if (msgs.filter((m) => m.role === "user" && m.fileId && now - m.at < 10 * 60_000).length >= 5) {
        throw new ConvexError(es ? "Demasiados archivos seguidos. Espere unos minutos." : "Too many files in a row. Please wait a few minutes.");
      }
      await limit(ctx, "chatFile", 30, 60_000, busy);
      const name = cleanFileName(fileName);
      file = { fileId, fileType: attachType(meta!.contentType, fileType)!, fileName: name && redact(name) };
    }
    // Close any reply that got stuck, so it never blocks the conversation.
    for (const m of msgs) if (m.pending) await ctx.db.patch(m._id, { pending: false, content: m.content || "…" });

    const userId = await ctx.db.insert("chatMessages", { sessionId, caseId, role: "user", content: redact(raw), at: now, pending: false, ...file });
    if (file) await ctx.scheduler.runAfter(FILE_KEEP_MS, internal.chat.dropFile, { id: userId });
    const replyId = await ctx.db.insert("chatMessages", { sessionId, caseId, role: "assistant", content: "", at: now + 1, pending: true });
    await ctx.scheduler.runAfter(0, internal.chatAgent.reply, { replyId, sessionId, caseId, lang });
  },
});

// ---- used by the reply action ----

export const history = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => (await sessionMessages(ctx, sessionId)).filter((m) => m.content || m.fileId || m.fileType).slice(-20),
});

/** 30 days after it was sent, an attached file is deleted. The message stays, marked as having had one. */
export const dropFile = internalMutation({
  args: { id: v.id("chatMessages") },
  handler: async (ctx, { id }) => {
    const m = await ctx.db.get(id);
    if (!m?.fileId) return;
    await deleteStored(ctx, m.fileId);
    await ctx.db.patch(id, { fileId: undefined });
  },
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
