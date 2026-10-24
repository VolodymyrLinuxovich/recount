import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { assess } from "./lib/eligibility";
import { checkBill } from "./lib/checks";
import { isLang } from "./lib/lang";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { FPL } from "./lib/reference";
import { HOSPITALS, tokens } from "./lib/statewide";

// ---- access: each case has a random secret kept only on the patient's phone ----

const Token = v.optional(v.string());

async function owned(ctx: QueryCtx | MutationCtx, id: Id<"cases">, token: string | undefined): Promise<Doc<"cases"> | null> {
  const c = await ctx.db.get(id);
  if (!c) return null;
  // Cases made before tokens existed have none; every new case requires its token.
  if (c.token && c.token !== token) return null;
  return c;
}

async function mustOwn(ctx: MutationCtx, id: Id<"cases">, token: string | undefined): Promise<Doc<"cases">> {
  const c = await owned(ctx, id, token);
  if (!c) throw new ConvexError("Case not found");
  return c;
}

/** Simple fixed-window limit shared by everyone, to stop runaway uploads. */
async function limit(ctx: MutationCtx, key: string, max: number, windowMs: number) {
  const now = Date.now();
  const row = await ctx.db.query("limits").withIndex("by_key", (q) => q.eq("key", key)).first();
  if (!row || now - row.windowStart > windowMs) {
    if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
    else await ctx.db.insert("limits", { key, windowStart: now, count: 1 });
    return;
  }
  if (row.count >= max) throw new ConvexError("Too many uploads right now. Please try again in a minute.");
  await ctx.db.patch(row._id, { count: row.count + 1 });
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await limit(ctx, "upload", 60, 60_000);
    return ctx.storage.generateUploadUrl();
  },
});

const CreateArgs = {
  fileId: v.optional(v.id("_storage")),
  fileType: v.optional(v.string()),
  sample: v.boolean(),
  lang: v.optional(v.union(v.literal("en"), v.literal("es"))),
};

/** Start a case. Returns its id and the secret token the phone must keep (needed for every later call). */
export const start = mutation({
  args: CreateArgs,
  handler: async (ctx, args) => {
    await limit(ctx, "create", 60, 60_000);
    const token = crypto.randomUUID();
    const id = await ctx.db.insert("cases", {
      createdAt: Date.now(),
      status: "reading",
      sample: args.sample,
      fileId: args.fileId,
      fileType: args.fileType,
      lang: args.lang,
      token,
    });
    await ctx.scheduler.runAfter(0, internal.agent.readAndCheck, { caseId: id });
    return { id, token };
  },
});

export const get = query({
  args: { id: v.id("cases"), token: Token },
  handler: async (ctx, { id, token }) => {
    const c = await owned(ctx, id, token);
    if (!c) return null;
    const steps = await ctx.db
      .query("steps")
      .withIndex("by_case", (q) => q.eq("caseId", id))
      .collect();
    const fileUrl = c.fileId ? await ctx.storage.getUrl(c.fileId) : null;
    const { token: _secret, ...rest } = c;
    void _secret;
    return { ...rest, steps, fileUrl };
  },
});

/** The patient answers three questions; eligibility is computed here, by rules, not by the model. */
export const submitHousehold = mutation({
  args: {
    id: v.id("cases"),
    token: Token,
    size: v.number(),
    annualIncome: v.number(),
    insured: v.boolean(),
    outOfPocket12mo: v.optional(v.number()),
  },
  handler: async (ctx, { id, token, ...h }) => {
    const c = await mustOwn(ctx, id, token);
    if (!c.bill) throw new ConvexError("Bill not read yet");
    if (h.size < 1 || h.size > 20 || h.annualIncome < 0) throw new ConvexError("Check household size and income");
    const eligibility = assess(h, FPL, c.hospital ?? null, c.bill.amountDue ?? null, c.lang ?? "en");
    await ctx.db.patch(id, { household: h, eligibility, status: "drafting", letters: undefined });
    await ctx.scheduler.runAfter(0, internal.agent.draftLetters, { caseId: id });
  },
});

const LetterV = v.object({
  kind: v.union(v.literal("assistance"), v.literal("dispute")),
  title: v.string(),
  subject: v.string(),
  body: v.string(),
  subjectPatient: v.optional(v.string()),
  bodyPatient: v.optional(v.string()),
});

export const approve = mutation({
  // requireFilled: the client asks us to refuse letters with [placeholders] left. Opt-in so older
  // clients that let people skip fields keep working.
  args: { id: v.id("cases"), token: Token, letters: v.array(LetterV), requireFilled: v.optional(v.boolean()) },
  handler: async (ctx, { id, token, letters, requireFilled }) => {
    const c = await mustOwn(ctx, id, token);
    if (c.status !== "ready" && c.status !== "approved") throw new ConvexError("Letters aren't ready yet");
    if (letters.length > 4 || letters.some((l) => l.body.length > 20000 || l.subject.length > 300)) throw new ConvexError("Letter too long");
    // Placeholders the patient must fill in before a letter can go out.
    // A signature line is signed by hand on paper, so it never blocks approval.
    const left = [...new Set(letters.flatMap((l) => (l.body + " " + l.subject).match(/\[[^\]\n]{2,40}\]/g) ?? []))].filter(
      (b) => !/signature|firma|sign here/i.test(b),
    );
    if (requireFilled && left.length) throw new ConvexError(`FILL_IN: Please fill in ${left.join(", ")} before approving.`);
    await ctx.db.patch(id, { letters, status: "approved", approvedAt: Date.now() });
  },
});

/**
 * The patient fixes an amount we misread (e.g. a blurry photo). Updates that line and
 * re-runs the deterministic checks. Only before the household questions, so the answer
 * and letters are always built from the corrected bill.
 */
export const correctLine = mutation({
  args: { id: v.id("cases"), token: Token, index: v.number(), charge: v.number() },
  handler: async (ctx, { id, token, index, charge }) => {
    const c = await mustOwn(ctx, id, token);
    if (c.status !== "needs_household") throw new ConvexError("You can fix amounts before answering the questions");
    if (!c.bill || index < 0 || index >= c.bill.lines.length || !(charge >= 0) || charge > 10_000_000) throw new ConvexError("Check the amount");
    const oldCharge = c.bill.lines[index].charge as number;
    const lines = c.bill.lines.map((l: { charge: number }, i: number) => (i === index ? { ...l, charge, corrected: true } : l));
    // Notes about the old amount or the total no longer describe the bill the patient corrected.
    const oldAmounts = [oldCharge.toFixed(2), oldCharge.toLocaleString("en-US"), String(oldCharge)];
    const unreadable = (c.bill.unreadable as string[]).filter(
      (u) => !oldAmounts.some((a) => u.includes(a)) && !/\b(total|sum|add up|suma|total)\b/i.test(u),
    );
    const correctedLines = [...new Set([...(c.bill.correctedLines ?? []), index])];
    const bill = { ...c.bill, lines, unreadable, correctedLines };
    const findings = checkBill(bill, c.hospital ?? null, isLang(c.lang) ? c.lang : "en");
    await ctx.db.patch(id, { bill, findings });
  },
});

/** Undo an approval so the patient can edit the letters again. */
export const unapprove = mutation({
  args: { id: v.id("cases"), token: Token },
  handler: async (ctx, { id, token }) => {
    const c = await mustOwn(ctx, id, token);
    if (c.status !== "approved") return;
    await ctx.db.patch(id, { status: "ready", approvedAt: undefined });
  },
});

/** The patient picks their hospital from the candidates (or key = null: "not listed"). */
export const confirmHospital = mutation({
  args: { id: v.id("cases"), token: Token, key: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, token, key }) => {
    const c = await mustOwn(ctx, id, token);
    if (c.status !== "confirm_hospital") throw new ConvexError("This bill isn't waiting for a hospital choice");
    if (key !== null && !HOSPITALS.some((h) => h.key === key)) throw new ConvexError("Unknown hospital");
    await ctx.db.patch(id, { status: "reading" });
    await ctx.scheduler.runAfter(0, internal.agent.continueCheck, { caseId: id, key });
  },
});

/** Delete a bill: the case, its agent log, and the uploaded file. */
export const remove = mutation({
  args: { id: v.id("cases"), token: Token },
  handler: async (ctx, { id, token }) => {
    const c = await owned(ctx, id, token);
    if (!c) return;
    for (const s of await ctx.db.query("steps").withIndex("by_case", (q) => q.eq("caseId", id)).collect()) await ctx.db.delete(s._id);
    for (const m of await ctx.db.query("chatMessages").withIndex("by_case", (q) => q.eq("caseId", id)).collect()) await ctx.db.delete(m._id);
    if (c.fileId) await ctx.storage.delete(c.fileId);
    await ctx.db.delete(id);
  },
});

/** Search every California hospital on file by name or city (for "my hospital isn't listed"). */
export const searchHospitals = query({
  args: { q: v.string() },
  handler: async (_ctx, { q }) => {
    const words = tokens(q);
    const raw = q.trim().toLowerCase();
    if (!words.length && raw.length < 2) return [];
    return HOSPITALS.map((h) => {
      const hay = `${h.names.join(" ")} ${h.city ?? ""}`.toLowerCase();
      const hits = words.filter((w) => hay.includes(w)).length;
      const score = (words.length ? hits / words.length : 0) + (h.city && raw.includes(h.city.toLowerCase()) ? 0.3 : 0);
      return { key: h.key, name: h.name, city: h.city, score };
    })
      .filter((x) => x.score > 0.5)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 8);
  },
});

// ---- internal helpers used by the agent action ----

export const load = internalQuery({
  args: { id: v.id("cases") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const patch = internalMutation({
  args: { id: v.id("cases"), fields: v.any() },
  handler: async (ctx, { id, fields }) => ctx.db.patch(id, fields),
});

export const step = internalMutation({
  args: {
    caseId: v.id("cases"),
    key: v.string(),
    label: v.string(),
    detail: v.optional(v.string()),
    state: v.union(v.literal("running"), v.literal("done"), v.literal("warn"), v.literal("error")),
  },
  handler: async (ctx, a) => {
    const existing = (await ctx.db.query("steps").withIndex("by_case", (q) => q.eq("caseId", a.caseId)).collect()).find(
      (s) => s.key === a.key,
    );
    if (existing) await ctx.db.patch(existing._id, { label: a.label, detail: a.detail, state: a.state });
    else await ctx.db.insert("steps", { ...a, at: Date.now() });
  },
});

export const cachedHospital = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => ctx.db.query("hospitals").withIndex("by_key", (q) => q.eq("key", key)).first(),
});

export const saveHospital = internalMutation({
  args: { key: v.string(), data: v.any() },
  handler: async (ctx, { key, data }) => {
    const old = await ctx.db.query("hospitals").withIndex("by_key", (q) => q.eq("key", key)).first();
    if (old) await ctx.db.patch(old._id, { data, fetchedAt: Date.now() });
    else await ctx.db.insert("hospitals", { key, data, fetchedAt: Date.now() });
  },
});

/** Admin cleanup (CLI/dashboard only): delete a case, its step log, its chat and its file. */
export const adminRemove = internalMutation({
  args: { id: v.id("cases") },
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (!c) return "not found";
    for (const s of await ctx.db.query("steps").withIndex("by_case", (q) => q.eq("caseId", id)).collect()) await ctx.db.delete(s._id);
    for (const m of await ctx.db.query("chatMessages").withIndex("by_case", (q) => q.eq("caseId", id)).collect()) await ctx.db.delete(m._id);
    if (c.fileId) await ctx.storage.delete(c.fileId);
    await ctx.db.delete(id);
    return "deleted";
  },
});
