// Delete an account: the user, their sign-in records, their profile and, if asked, all their bills.
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";

export const remove = mutation({
  args: { deleteBills: v.boolean() },
  handler: async (ctx, { deleteBills }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Please sign in first.");

    for (const c of await ctx.db.query("cases").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect()) {
      if (deleteBills) {
        for (const s of await ctx.db.query("steps").withIndex("by_case", (q) => q.eq("caseId", c._id)).collect()) await ctx.db.delete(s._id);
        for (const m of await ctx.db.query("chatMessages").withIndex("by_case", (q) => q.eq("caseId", c._id)).collect()) await ctx.db.delete(m._id);
        if (c.fileId) await ctx.storage.delete(c.fileId);
        await ctx.db.delete(c._id);
      } else {
        // Keep the bills, reachable only by their private links again.
        await ctx.db.patch(c._id, { ownerId: undefined });
      }
    }
    for (const p of await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) await ctx.db.delete(p._id);

    // Sign-in records from Convex Auth.
    for (const s of await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect()) {
      for (const r of await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", s._id)).collect()) await ctx.db.delete(r._id);
      await ctx.db.delete(s._id);
    }
    for (const a of await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).collect()) {
      for (const code of await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", a._id)).collect()) await ctx.db.delete(code._id);
      await ctx.db.delete(a._id);
    }
    await ctx.db.delete(userId);
  },
});
