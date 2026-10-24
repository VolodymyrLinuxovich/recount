// Used by sign-up: is this email already registered?
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const accountExists = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) =>
    !!(await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", "password").eq("providerAccountId", email))
      .first()),
});
