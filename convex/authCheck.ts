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

/** Does a Google sign-in with a verified address use this email? */
export const googleEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    for (const u of await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).collect()) {
      if (!u.emailVerificationTime) continue;
      const g = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", u._id).eq("provider", "google"))
        .first();
      if (g) return true;
    }
    return false;
  },
});
