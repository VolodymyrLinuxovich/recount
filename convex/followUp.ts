// After the letters are sent: a check-in date, and a complaint to HCAI if the hospital says no,
// never answers, or sends the bill to collections anyway. Recount never files anything.
import { limit } from "./lib/limit";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { owned } from "./cases";
import { blanksIn } from "./lib/complaint";
import { resolveFilledBrackets } from "./lib/letters";

const Token = v.optional(v.string());
const Day = /^\d{4}-\d{2}-\d{2}$/;
const OutcomeV = v.union(v.literal("denied"), v.literal("no_reply"), v.literal("collections"));

export interface FollowUp {
  outcome: "denied" | "no_reply" | "collections";
  sentOn: string | null;
  status: "drafting" | "ready" | "approved";
  /** When the current draft started; a draft older than DRAFT_STUCK_MS may be started again. */
  startedAt?: number;
  letter?: {
    kind: "complaint";
    title: string;
    subject: string;
    body: string;
    subjectPatient?: string;
    bodyPatient?: string;
  };
  source?: "claude" | "template";
  approvedAt?: number;
}

/** Only bills whose letters were approved have a "what happens next". */
async function mustOwnSent(ctx: MutationCtx, id: Id<"cases">, token: string | undefined): Promise<Doc<"cases">> {
  const c = await owned(ctx, id, token);
  if (!c) throw new ConvexError("Case not found");
  if (c.status !== "approved") throw new ConvexError("Approve your letters first");
  return c;
}

function validDay(s: string) {
  if (!Day.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Save (or clear, with null) the day the patient wants to check in. */
export const setCheckIn = mutation({
  args: { id: v.id("cases"), token: Token, on: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, token, on }) => {
    await mustOwnSent(ctx, id, token);
    if (on !== null && !validDay(on)) throw new ConvexError("Check the date");
    await ctx.db.patch(id, { checkInOn: on ?? undefined });
  },
});

const DRAFT_STUCK_MS = 3 * 60_000;

/** The patient says what happened; we draft a complaint to HCAI from the case's facts. */
export const startComplaint = mutation({
  args: { id: v.id("cases"), token: Token, outcome: OutcomeV, sentOn: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, token, outcome, sentOn }) => {
    const c = await mustOwnSent(ctx, id, token);
    if (sentOn !== null && !validDay(sentOn)) throw new ConvexError("Check the date");
    const old = c.followUp as FollowUp | undefined;
    // A draft in progress is left alone, unless it has run so long its job must have died.
    if (old?.status === "drafting" && Date.now() - (old.startedAt ?? 0) < DRAFT_STUCK_MS) return;
    await limit(ctx, `complaint:${id}`, 5, 10 * 60_000, "Too many drafts in a row. Please wait a few minutes.");
    const followUp: FollowUp = { outcome, sentOn, status: "drafting", startedAt: Date.now() };
    await ctx.db.patch(id, { followUp });
    await ctx.scheduler.runAfter(0, internal.followUpAgent.draftComplaint, { caseId: id });
  },
});

const ComplaintV = v.object({
  kind: v.literal("complaint"),
  title: v.string(),
  subject: v.string(),
  body: v.string(),
  subjectPatient: v.optional(v.string()),
  bodyPatient: v.optional(v.string()),
});

/** Same check as the letters: no [blanks] left. Approving only saves it; the patient files it. */
export const approveComplaint = mutation({
  args: { id: v.id("cases"), token: Token, letter: ComplaintV },
  handler: async (ctx, { id, token, letter: raw }) => {
    const c = await mustOwnSent(ctx, id, token);
    const f = c.followUp as FollowUp | undefined;
    if (!f || f.status === "drafting") throw new ConvexError("The complaint isn't ready yet");
    const letter = {
      ...raw,
      subject: resolveFilledBrackets(raw.subject),
      body: resolveFilledBrackets(raw.body),
      ...(raw.bodyPatient ? { bodyPatient: resolveFilledBrackets(raw.bodyPatient) } : {}),
    };
    if (letter.body.length > 20000 || letter.subject.length > 300) throw new ConvexError("Letter too long");
    const left = blanksIn([letter.subject, letter.body]);
    if (left.length) throw new ConvexError(`FILL_IN: Please fill in ${left.join(", ")} before approving.`);
    await ctx.db.patch(id, { followUp: { ...f, letter, status: "approved", approvedAt: Date.now() } });
  },
});

/** Undo the complaint's approval to edit it again. */
export const unapproveComplaint = mutation({
  args: { id: v.id("cases"), token: Token },
  handler: async (ctx, { id, token }) => {
    const c = await mustOwnSent(ctx, id, token);
    const f = c.followUp as FollowUp | undefined;
    if (f?.status !== "approved") return;
    await ctx.db.patch(id, { followUp: { ...f, status: "ready", approvedAt: undefined } });
  },
});

/** Used by the drafting action. */
export const saveComplaint = internalMutation({
  args: { id: v.id("cases"), letter: ComplaintV, source: v.union(v.literal("claude"), v.literal("template")) },
  handler: async (ctx, { id, letter, source }) => {
    const c = await ctx.db.get(id);
    const f = c?.followUp as FollowUp | undefined;
    if (!c || !f) return;
    await ctx.db.patch(id, { followUp: { ...f, letter, source, status: "ready" } });
  },
});
