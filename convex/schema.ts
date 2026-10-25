import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  profiles: defineTable({
    userId: v.id("users"),
    name: v.optional(v.string()),
    street: v.optional(v.string()),
    city: v.optional(v.string()),
    zip: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    dob: v.optional(v.string()),
  }).index("by_user", ["userId"]),
  cases: defineTable({
    createdAt: v.number(),
    /** When the current "reading" or "drafting" started (see the watchdog in cases.ts). */
    statusAt: v.optional(v.number()),
    status: v.union(
      v.literal("reading"),
      v.literal("confirm_hospital"),
      v.literal("needs_household"),
      v.literal("drafting"),
      v.literal("ready"),
      v.literal("approved"),
      v.literal("error"),
    ),
    sample: v.boolean(),
    lang: v.optional(v.union(v.literal("en"), v.literal("es"))),
    fileId: v.optional(v.id("_storage")),
    fileType: v.optional(v.string()),
    /** Pages 2..N of a bill sent as several photos, in order (page 1 is fileId). See lib/pages.ts. */
    morePages: v.optional(v.array(v.object({ fileId: v.id("_storage"), type: v.string() }))),
    bill: v.optional(v.any()),
    billSource: v.optional(v.union(v.literal("claude"), v.literal("sample-source"))),
    hospital: v.optional(v.any()),
    hospitalKey: v.optional(v.string()),
    hospitalHint: v.optional(v.string()),
    hospitalCandidates: v.optional(v.any()),
    token: v.optional(v.string()),
    ownerId: v.optional(v.id("users")),
    findings: v.optional(v.any()),
    policyFindings: v.optional(v.any()),
    household: v.optional(v.any()),
    eligibility: v.optional(v.any()),
    letters: v.optional(v.any()),
    lettersSource: v.optional(v.union(v.literal("claude"), v.literal("template"))),
    letterFlags: v.optional(v.array(v.number())), // dollar amounts in the letters not found in the facts
    approvedAt: v.optional(v.number()),
    /** The day the patient wants to check in on their request, YYYY-MM-DD. */
    checkInOn: v.optional(v.string()),
    /** After sending: what the hospital did and the complaint to HCAI (see convex/followUp.ts). */
    followUp: v.optional(v.any()),
    error: v.optional(v.string()),
    /** The insurance Explanation of Benefits, if the patient added one (see lib/eob.ts, docs/EOB.md). */
    eobFileId: v.optional(v.id("_storage")),
    eobFileType: v.optional(v.string()),
    eobStatus: v.optional(v.union(v.literal("reading"), v.literal("done"), v.literal("error"))),
    eob: v.optional(v.any()), // ParsedEob
    eobSource: v.optional(v.union(v.literal("claude"), v.literal("sample-source"))),
    eobError: v.optional(v.string()),
  }).index("by_owner", ["ownerId", "createdAt"]),
  steps: defineTable({
    caseId: v.id("cases"),
    at: v.number(),
    key: v.string(),
    label: v.string(),
    detail: v.optional(v.string()),
    state: v.union(v.literal("running"), v.literal("done"), v.literal("warn"), v.literal("error")),
    kind: v.optional(v.union(v.literal("rule"), v.literal("ai"), v.literal("person"))),
  }).index("by_case", ["caseId", "at"]),
  // One row per model call: which provider and model did what, how long, how many tokens.
  // Never the prompt, the bill or the reply.
  agentRuns: defineTable({
    caseId: v.id("cases"),
    at: v.number(),
    task: v.string(),
    provider: v.string(),
    model: v.string(),
    ms: v.number(),
    inputTokens: v.union(v.number(), v.null()),
    outputTokens: v.union(v.number(), v.null()),
    ok: v.boolean(),
    fallbackUsed: v.boolean(),
    error: v.optional(v.string()),
  }).index("by_case", ["caseId", "at"]),
  // Dashboard: one row per agent action, kept when bills are deleted. No case id, no content:
  // which agent, which model, how long, whether it worked, and a quality score where we have one.
  agentMetrics: defineTable({
    at: v.number(),
    agent: v.string(),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    ms: v.number(),
    ok: v.boolean(),
    inputTokens: v.optional(v.union(v.number(), v.null())),
    outputTokens: v.optional(v.union(v.number(), v.null())),
    fallbackUsed: v.optional(v.boolean()),
    /** 0..1 where the agent has a checkable result (both bill reads agree, letter amounts all found, ...). */
    score: v.optional(v.number()),
    usd: v.optional(v.number()),
    /** Outside id (an Apify run id), so history imports never count a run twice. */
    ref: v.optional(v.string()),
  })
    .index("by_at", ["at"])
    .index("by_ref", ["ref"]),
  chatMessages: defineTable({
    sessionId: v.string(),
    caseId: v.optional(v.id("cases")),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    at: v.number(),
    pending: v.boolean(),
    /** A photo or PDF the patient attached (see lib/attach.ts). Deleted after 30 days or with the bill. */
    fileId: v.optional(v.id("_storage")),
    fileType: v.optional(v.string()),
    fileName: v.optional(v.string()),
  })
    .index("by_session", ["sessionId", "at"])
    .index("by_case", ["caseId"])
    .index("by_file", ["fileId"]),
  limits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),
  hospitals: defineTable({
    key: v.string(),
    data: v.any(),
    fetchedAt: v.number(),
  }).index("by_key", ["key"]),
  /** Expo push tokens of phones that asked to hear when a bill is done (see convex/notify.ts). */
  pushTokens: defineTable({
    caseId: v.id("cases"),
    pushToken: v.string(),
    platform: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_case", ["caseId"]),
});
