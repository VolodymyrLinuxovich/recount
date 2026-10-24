import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  cases: defineTable({
    createdAt: v.number(),
    status: v.union(
      v.literal("reading"),
      v.literal("needs_household"),
      v.literal("drafting"),
      v.literal("ready"),
      v.literal("approved"),
      v.literal("error"),
    ),
    sample: v.boolean(),
    fileId: v.optional(v.id("_storage")),
    fileType: v.optional(v.string()),
    bill: v.optional(v.any()),
    billSource: v.optional(v.union(v.literal("claude"), v.literal("sample-source"))),
    hospital: v.optional(v.any()),
    findings: v.optional(v.any()),
    policyFindings: v.optional(v.any()),
    household: v.optional(v.any()),
    eligibility: v.optional(v.any()),
    letters: v.optional(v.any()),
    lettersSource: v.optional(v.union(v.literal("claude"), v.literal("template"))),
    approvedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  }),
  steps: defineTable({
    caseId: v.id("cases"),
    at: v.number(),
    key: v.string(),
    label: v.string(),
    detail: v.optional(v.string()),
    state: v.union(v.literal("running"), v.literal("done"), v.literal("warn"), v.literal("error")),
  }).index("by_case", ["caseId", "at"]),
  hospitals: defineTable({
    key: v.string(),
    data: v.any(),
    fetchedAt: v.number(),
  }).index("by_key", ["key"]),
});
