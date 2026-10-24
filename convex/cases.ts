import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { assess } from "./lib/eligibility";
import { FPL } from "./lib/reference";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const create = mutation({
  args: { fileId: v.optional(v.id("_storage")), fileType: v.optional(v.string()), sample: v.boolean() },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("cases", {
      createdAt: Date.now(),
      status: "reading",
      sample: args.sample,
      fileId: args.fileId,
      fileType: args.fileType,
    });
    await ctx.scheduler.runAfter(0, internal.agent.readAndCheck, { caseId: id });
    return id;
  },
});

export const get = query({
  args: { id: v.id("cases") },
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (!c) return null;
    const steps = await ctx.db
      .query("steps")
      .withIndex("by_case", (q) => q.eq("caseId", id))
      .collect();
    const fileUrl = c.fileId ? await ctx.storage.getUrl(c.fileId) : null;
    return { ...c, steps, fileUrl };
  },
});

/** The patient answers three questions; eligibility is computed here, by rules, not by the model. */
export const submitHousehold = mutation({
  args: {
    id: v.id("cases"),
    size: v.number(),
    annualIncome: v.number(),
    insured: v.boolean(),
    outOfPocket12mo: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...h }) => {
    const c = await ctx.db.get(id);
    if (!c || !c.bill) throw new Error("Bill not read yet");
    if (h.size < 1 || h.size > 20 || h.annualIncome < 0) throw new Error("Check household size and income");
    const eligibility = assess(h, FPL, c.hospital ?? null, c.bill.amountDue ?? null);
    await ctx.db.patch(id, { household: h, eligibility, status: "drafting", letters: undefined });
    await ctx.scheduler.runAfter(0, internal.agent.draftLetters, { caseId: id });
  },
});

export const approve = mutation({
  args: { id: v.id("cases"), letters: v.any() },
  handler: async (ctx, { id, letters }) => {
    await ctx.db.patch(id, { letters, status: "approved", approvedAt: Date.now() });
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
