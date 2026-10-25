import { currentUser } from "./lib/user";
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { assess } from "./lib/eligibility";
import { resolveFilledBrackets } from "./lib/letters";
import { allFindings, eobShowsInsured } from "./lib/eobChecks";
import { potentialSavings, type Finding } from "./lib/checks";
import type { ParsedEob } from "./lib/eob";
import { isLang } from "./lib/lang";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { FPL } from "./lib/reference";
import { HOSPITALS, tokens } from "./lib/statewide";
import { kindOf } from "./lib/pipeline";
import { limit } from "./lib/limit";
import { notifyOnStatus, removeTokens } from "./notify";
import { deleteChatForCase, deleteStored } from "./chat";

// ---- access: each case has a random secret kept only on the patient's phone ----

const Token = v.optional(v.string());

export async function owned(ctx: QueryCtx | MutationCtx, id: Id<"cases">, token: string | undefined): Promise<Doc<"cases"> | null> {
  const c = await ctx.db.get(id);
  if (!c) return null;
  // The signed-in owner can always open their own bill.
  if (c.ownerId) {
    const userId = await currentUser(ctx);
    if (userId && userId === c.ownerId) return c;
  }
  // Otherwise the bill's secret token is required (cases made before tokens existed have none).
  if (c.token && c.token !== token) return null;
  return c;
}

async function mustOwn(ctx: MutationCtx, id: Id<"cases">, token: string | undefined): Promise<Doc<"cases">> {
  const c = await owned(ctx, id, token);
  if (!c) throw new ConvexError("Case not found");
  return c;
}

// ---- watchdog: a bill never stays "reading" or "drafting" forever ----

/** After this long in "reading" or "drafting" the background job is presumed dead. */
const STUCK_MS = 5 * 60_000;
/** After this long the patient may ask us to try again (the client shows the button at 3 minutes). */
const RETRY_AFTER_MS = 2 * 60_000;

/** Schedules the check that ends a busy phase (started at statusAt) if its background job dies. */
async function watch(ctx: MutationCtx, caseId: Id<"cases">, status: "reading" | "drafting", statusAt: number) {
  await ctx.scheduler.runAfter(STUCK_MS, internal.cases.expire, { caseId, status, since: statusAt });
}

/**
 * Runs STUCK_MS after a busy phase started. Does nothing if the bill moved on (other status, or a
 * newer start of the same phase). Stuck writing: our standard letters, and if even that dies, an
 * error. Stuck reading: an error the patient can retry from.
 */
export const expire = internalMutation({
  args: {
    caseId: v.id("cases"),
    status: v.union(v.literal("reading"), v.literal("drafting")),
    since: v.number(),
    templateOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, { caseId, status, since, templateOnly }) => {
    const c = await ctx.db.get(caseId);
    if (!c || c.status !== status || (c.statusAt ?? c.createdAt) !== since) return;
    const es = c.lang === "es";
    if (status === "drafting" && c.bill && c.eligibility && !templateOnly) {
      const statusAt = Date.now();
      await ctx.db.patch(caseId, { statusAt });
      await ctx.scheduler.runAfter(0, internal.agent.draftLetters, { caseId, templateOnly: true });
      await ctx.scheduler.runAfter(60_000, internal.cases.expire, { caseId, status, since: statusAt, templateOnly: true });
      return;
    }
    await notifyOnStatus(ctx, c, "error");
    await ctx.db.patch(caseId, {
      status: "error",
      error:
        status === "drafting"
          ? es ? "Algo salió mal al escribir sus cartas. Inténtelo de nuevo." : "Something went wrong while writing your letters. Please try again."
          : es ? "Algo salió mal al leer su factura. Inténtelo de nuevo." : "Something went wrong while reading your bill. Please try again.",
    });
  },
});

/** "Taking too long? Try again": restarts a reading or writing that has run longer than SLOW_MS. */
export const retry = mutation({
  args: { id: v.id("cases"), token: Token },
  handler: async (ctx, { id, token }) => {
    const c = await mustOwn(ctx, id, token);
    if (c.status !== "reading" && c.status !== "drafting") return;
    if (Date.now() - (c.statusAt ?? c.createdAt) < RETRY_AFTER_MS) return;
    await limit(ctx, `retry:${id}`, 5, 10 * 60_000, "Too many tries in a row. Please wait a few minutes.");
    const statusAt = Date.now();
    if (c.status === "drafting") {
      if (!c.bill || !c.eligibility) {
        await ctx.db.patch(id, { status: "needs_household", statusAt });
        return;
      }
      await ctx.db.patch(id, { statusAt });
      await ctx.scheduler.runAfter(0, internal.agent.draftLetters, { caseId: id });
      await watch(ctx, id, "drafting", statusAt);
      return;
    }
    // Reading after the hospital pick: ask for the hospital again, the bill is already read.
    if (c.bill && c.hospitalCandidates) {
      await ctx.db.patch(id, { status: "confirm_hospital", statusAt });
      return;
    }
    await ctx.db.patch(id, { statusAt });
    await ctx.scheduler.runAfter(0, internal.agent.readAndCheck, { caseId: id });
    await watch(ctx, id, "reading", statusAt);
  },
});

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
  /** A hospital key (HCAI slug) the patient came from, e.g. the audit page. Settles unclear matches. */
  hospitalHint: v.optional(v.string()),
};

/** Start a case. Returns its id and the secret token the phone must keep (needed for every later call). */
export const start = mutation({
  args: CreateArgs,
  handler: async (ctx, args) => {
    await limit(ctx, "create", 60, 60_000);
    const token = crypto.randomUUID();
    const ownerId = (await currentUser(ctx)) ?? undefined;
    const now = Date.now();
    const id = await ctx.db.insert("cases", {
      ownerId,
      createdAt: now,
      statusAt: now,
      status: "reading",
      sample: args.sample,
      fileId: args.fileId,
      fileType: args.fileType,
      lang: args.lang,
      hospitalHint: args.hospitalHint,
      token,
    });
    await ctx.scheduler.runAfter(0, internal.agent.readAndCheck, { caseId: id });
    await watch(ctx, id, "reading", now);
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
    const eobFileUrl = c.eobFileId ? await ctx.storage.getUrl(c.eobFileId) : null;
    const { token: _secret, ownerId, ...rest } = c;
    void _secret;
    const userId = ownerId ? await currentUser(ctx) : null;
    const runs = await ctx.db.query("agentRuns").withIndex("by_case", (q) => q.eq("caseId", id)).collect();
    const agentRuns = runs.map(({ task, provider, model, ms, inputTokens, outputTokens, ok, fallbackUsed, at }) => ({ task, provider, model, ms, inputTokens, outputTokens, ok, fallbackUsed, at }));
    // rest carries eobStatus, eob, eobError and eobSource; eobFileId stays internal like fileId's url.
    return { ...rest, steps, fileUrl, eobFileUrl, agentRuns, mine: !!ownerId && userId === ownerId };
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
  handler: async (ctx, { id, token, ...answers }) => {
    const c = await mustOwn(ctx, id, token);
    if (!c.bill) throw new ConvexError("Bill not read yet");
    // An insurance statement for this visit means the patient is insured, so the letters agree.
    const h = eobShowsInsured(c.bill, c.hospital ?? null, usableEob(c)) ? { ...answers, insured: true } : answers;
    await limit(ctx, `draft:${id}`, 10, 10 * 60_000, "Too many changes in a row. Please wait a few minutes.");
    if (h.size < 1 || h.size > 20 || h.annualIncome < 0) throw new ConvexError("Check household size and income");
    const eligibility = assess(h, FPL, c.hospital ?? null, c.bill.amountDue ?? null, c.lang ?? "en");
    const statusAt = Date.now();
    await ctx.db.patch(id, { household: h, eligibility, status: "drafting", statusAt, letters: undefined });
    await ctx.scheduler.runAfter(0, internal.agent.draftLetters, { caseId: id });
    await watch(ctx, id, "drafting", statusAt);
  },
});

const LetterV = v.object({
  kind: v.union(v.literal("assistance"), v.literal("dispute"), v.literal("appeal")),
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
  handler: async (ctx, { id, token, letters: raw, requireFilled }) => {
    // "[Label: value]" already holds its value: keep the value, it isn't a blank.
    const letters = raw.map((l) => ({
      ...l,
      subject: resolveFilledBrackets(l.subject),
      body: resolveFilledBrackets(l.body),
      ...(l.bodyPatient ? { bodyPatient: resolveFilledBrackets(l.bodyPatient) } : {}),
    }));
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
    // The patient settled this line, so its "second look" question is answered.
    const amountChecks = (c.bill.amountChecks ?? []).filter((x: { index: number }) => x.index !== index);
    const bill = { ...c.bill, lines, unreadable, correctedLines, amountChecks };
    const findings = allFindings(bill, c.hospital ?? null, usableEob(c), isLang(c.lang) ? c.lang : "en");
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
    const statusAt = Date.now();
    await ctx.db.patch(id, { status: "reading", statusAt });
    await ctx.scheduler.runAfter(0, internal.agent.continueCheck, { caseId: id, key });
    await watch(ctx, id, "reading", statusAt);
  },
});

/** Delete a bill: the case, its agent log, and the uploaded file. */
export const remove = mutation({
  args: { id: v.id("cases"), token: Token },
  handler: async (ctx, { id, token }) => {
    const c = await owned(ctx, id, token);
    if (!c) return;
    for (const s of await ctx.db.query("steps").withIndex("by_case", (q) => q.eq("caseId", id)).collect()) await ctx.db.delete(s._id);
    await deleteChatForCase(ctx, id);
    for (const r of await ctx.db.query("agentRuns").withIndex("by_case", (q) => q.eq("caseId", id)).collect()) await ctx.db.delete(r._id);
    await deleteStored(ctx, c.fileId);
    await deleteStored(ctx, c.eobFileId);
    await removeTokens(ctx, id);
    await ctx.db.delete(id);
  },
});

// ---- the insurance statement (EOB), see docs/EOB.md ----

/** The case's EOB when it was read and can be used for findings. */
function usableEob(c: Doc<"cases">): ParsedEob | null {
  return c.eobStatus === "done" && c.eob ? (c.eob as ParsedEob) : null;
}

/**
 * Recompute the findings with (or without) an EOB. If letters exist or are being written,
 * write them again from the new findings. Returns whether letters will be redrafted.
 */
async function refreshFindings(ctx: MutationCtx, c: Doc<"cases">, eob: ParsedEob | null, extra: Partial<Doc<"cases">> = {}, mayRedraft = true): Promise<{ findings: Finding[]; redraft: boolean }> {
  const lang = isLang(c.lang) ? c.lang : "en";
  // Before the hospital step finishes there are no findings yet; finishCheck picks up the EOB itself.
  const ready = c.bill && c.status !== "reading" && c.status !== "confirm_hospital" && c.status !== "error";
  const findings: Finding[] = ready ? allFindings(c.bill, c.hospital ?? null, eob, lang) : (c.findings ?? []);
  const redraft = Boolean(mayRedraft && ready && (c.status === "ready" || c.status === "drafting") && c.eligibility);
  const statusAt = Date.now();
  await ctx.db.patch(c._id, { ...extra, ...(ready ? { findings } : {}), ...(redraft ? { status: "drafting" as const, statusAt, letters: undefined } : {}) });
  if (redraft) {
    await ctx.scheduler.runAfter(0, internal.agent.draftLetters, { caseId: c._id });
    await watch(ctx, c._id, "drafting", statusAt);
  }
  return { findings, redraft };
}

/** The patient adds a photo or PDF of their insurance statement. It's read in the background. */
export const addEob = mutation({
  args: { id: v.id("cases"), token: Token, fileId: v.id("_storage"), fileType: v.optional(v.string()) },
  handler: async (ctx, { id, token, fileId, fileType }) => {
    const c = await mustOwn(ctx, id, token);
    if (c.status === "approved") throw new ConvexError("These letters are approved. Undo the approval to add an insurance statement.");
    await limit(ctx, "eob", 60, 60_000);
    if (c.eobFileId && c.eobFileId !== fileId) await ctx.storage.delete(c.eobFileId);
    await ctx.db.patch(id, { eobFileId: fileId, eobFileType: fileType, eobStatus: "reading", eobError: undefined });
    await ctx.scheduler.runAfter(0, internal.agent.readEob, { caseId: id });
  },
});

/** Sample bills only: use the sample insurance statement. */
export const addSampleEob = mutation({
  args: { id: v.id("cases"), token: Token },
  handler: async (ctx, { id, token }) => {
    const c = await mustOwn(ctx, id, token);
    if (!c.sample) throw new ConvexError("The sample insurance statement is only for the sample bill.");
    if (c.status === "approved") throw new ConvexError("These letters are approved. Undo the approval to add an insurance statement.");
    await limit(ctx, "eob", 60, 60_000);
    if (c.eobFileId) await ctx.storage.delete(c.eobFileId);
    await ctx.db.patch(id, { eobFileId: undefined, eobFileType: undefined, eobStatus: "reading", eobError: undefined });
    await ctx.scheduler.runAfter(0, internal.agent.readEob, { caseId: id });
  },
});

/** Remove the insurance statement: the file, what we read, and its findings. */
export const removeEob = mutation({
  args: { id: v.id("cases"), token: Token },
  handler: async (ctx, { id, token }) => {
    const c = await mustOwn(ctx, id, token);
    if (c.status === "approved") throw new ConvexError("These letters are approved. Undo the approval to remove the insurance statement.");
    if (c.eobFileId) await ctx.storage.delete(c.eobFileId);
    const clear = { eobFileId: undefined, eobFileType: undefined, eobStatus: undefined, eob: undefined, eobSource: undefined, eobError: undefined };
    if (usableEob(c)) await refreshFindings(ctx, c, null, clear);
    else await ctx.db.patch(id, clear);
  },
});

/** Called by agent.readEob with what it read. Returns null when the case moved on meanwhile. */
export const applyEob = internalMutation({
  args: { id: v.id("cases"), fileId: v.optional(v.id("_storage")), eob: v.any(), eobSource: v.union(v.literal("claude"), v.literal("sample-source")) },
  handler: async (ctx, { id, fileId, eob, eobSource }) => {
    const c = await ctx.db.get(id);
    // Removed, replaced by another statement, or approved while we read: leave the case alone.
    if (!c || c.eobStatus !== "reading" || (c.eobFileId ?? undefined) !== fileId) return null;
    if (c.status === "approved") {
      await ctx.db.patch(id, { eobStatus: "error", eobError: "APPROVED" });
      return null;
    }
    const parsed = eob as ParsedEob;
    const extra: Partial<Doc<"cases">> = { eob: parsed, eobSource, eobStatus: "done", eobError: undefined };
    // An insurance statement means the patient has insurance: fix the answer and re-run the rules.
    let mayRedraft = true;
    // Not when the statement looks like it's for a different visit (EOB_MISMATCH).
    if (c.household && c.household.insured === false && c.bill && eobShowsInsured(c.bill, c.hospital ?? null, parsed)) {
      const household = { ...c.household, insured: true };
      extra.household = household;
      extra.eligibility = assess(household, FPL, c.hospital ?? null, c.bill.amountDue ?? null, isLang(c.lang) ? c.lang : "en");
      // Insured patients also need their medical costs (NEEDS_INFO): ask that first, then write letters.
      if (extra.eligibility.tier === "NEEDS_INFO" && (c.status === "ready" || c.status === "drafting")) {
        extra.status = "needs_household";
        extra.letters = undefined;
        mayRedraft = false;
      }
    }
    const { findings, redraft } = await refreshFindings(ctx, c, parsed, extra, mayRedraft);
    const fromEob = findings.filter((f) => EOB_KINDS.has(f.kind));
    return {
      eobFindings: fromEob.length,
      mismatch: fromEob.some((f) => f.kind === "EOB_MISMATCH"),
      total: potentialSavings(findings),
      redraft,
    };
  },
});

const EOB_KINDS = new Set<string>(["EOB_MISMATCH", "OWES_MORE_THAN_EOB", "SURPRISE_BILL", "INSURANCE_NOT_APPLIED", "NOT_ON_EOB", "DENIED_BY_PLAN", "CLAIM_PENDING"]);

/** The statement couldn't be used. Error codes: NOT_AN_EOB, RETAKE, TOO_LARGE, NO_MODEL. */
export const eobFailed = internalMutation({
  args: { id: v.id("cases"), fileId: v.optional(v.id("_storage")), error: v.string() },
  handler: async (ctx, { id, fileId, error }) => {
    const c = await ctx.db.get(id);
    if (!c || c.eobStatus !== "reading" || (c.eobFileId ?? undefined) !== fileId) return;
    // Findings from an earlier statement no longer apply.
    const clear = { eobStatus: "error" as const, eobError: error, eob: undefined, eobSource: undefined };
    if (c.status !== "approved" && (c.findings ?? []).some((f: Finding) => EOB_KINDS.has(f.kind))) await refreshFindings(ctx, c, null, clear);
    else await ctx.db.patch(id, clear);
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
  handler: async (ctx, { id, fields }) => {
    const c = await ctx.db.get(id);
    await ctx.db.patch(id, fields);
    if (c) await notifyOnStatus(ctx, c, fields?.status, fields?.findings);
  },
});

/** Log one model call for a case (see lib/model.ts). */
export const recordRun = internalMutation({
  args: {
    caseId: v.id("cases"),
    task: v.string(),
    provider: v.string(),
    model: v.string(),
    ms: v.number(),
    inputTokens: v.union(v.number(), v.null()),
    outputTokens: v.union(v.number(), v.null()),
    ok: v.boolean(),
    fallbackUsed: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const { caseId, task, provider, model, ms, inputTokens, outputTokens, ok, fallbackUsed } = a;
    await ctx.db.insert("agentMetrics", { agent: task, provider, model, ms, inputTokens, outputTokens, ok, fallbackUsed, at: Date.now() });
    if (!(await ctx.db.get(caseId))) return;
    await ctx.db.insert("agentRuns", { ...a, at: Date.now() });
  },
});

export const step = internalMutation({
  args: {
    caseId: v.id("cases"),
    key: v.string(),
    label: v.string(),
    detail: v.optional(v.string()),
    state: v.union(v.literal("running"), v.literal("done"), v.literal("warn"), v.literal("error")),
    kind: v.optional(v.union(v.literal("rule"), v.literal("ai"), v.literal("person"))),
  },
  handler: async (ctx, a) => {
    a = { ...a, kind: a.kind ?? kindOf(a.key) };
    const existing = (await ctx.db.query("steps").withIndex("by_case", (q) => q.eq("caseId", a.caseId)).collect()).find(
      (s) => s.key === a.key,
    );
    if (existing) await ctx.db.patch(existing._id, { label: a.label, detail: a.detail, state: a.state, kind: a.kind });
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
    await deleteChatForCase(ctx, id);
    for (const r of await ctx.db.query("agentRuns").withIndex("by_case", (q) => q.eq("caseId", id)).collect()) await ctx.db.delete(r._id);
    await deleteStored(ctx, c.fileId);
    await deleteStored(ctx, c.eobFileId);
    await removeTokens(ctx, id);
    await ctx.db.delete(id);
    return "deleted";
  },
});

/** Attach bills from this phone (id + token) to the signed-in account. Returns how many were attached. */
export const claim = mutation({
  args: { items: v.array(v.object({ id: v.id("cases"), token: v.string() })) },
  handler: async (ctx, { items }) => {
    const userId = await currentUser(ctx);
    if (!userId) throw new ConvexError("Please sign in first.");
    if (items.length > 200) throw new ConvexError("Too many bills at once.");
    let n = 0;
    for (const { id, token } of items) {
      const c = await ctx.db.get(id);
      if (!c || !c.token || c.token !== token) continue;
      if (c.ownerId && c.ownerId !== userId) continue; // already someone else's
      if (c.ownerId !== userId) {
        await ctx.db.patch(id, { ownerId: userId });
        n++;
      }
    }
    return n;
  },
});

/** The signed-in user's bills, newest first (a summary for "My bills"). */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUser(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("cases")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(200);
    return rows.map((c) => ({
      id: c._id,
      token: c.token ?? null,
      createdAt: c.createdAt,
      status: c.status,
      hospitalName: c.hospital?.name ?? c.bill?.hospitalName ?? null,
      amountDue: c.bill?.amountDue ?? null,
      tier: c.eligibility?.tier ?? null,
      findingsCount: Array.isArray(c.findings) ? c.findings.length : 0,
      sample: c.sample,
    }));
  },
});
