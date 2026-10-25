// Password reset helpers for convex/auth.ts. See convex/lib/resetEmail.ts for the switch.
import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { limit } from "./lib/limit";
import { hashEmail, RESET_GLOBAL, RESET_PER_EMAIL, RESET_WINDOW_MS, sendResetEmail } from "./lib/resetEmail";

const TOO_MANY = "Too many code requests. Please try again later.";

/** Counts a code request (per email and overall) and says whether a password account uses the email.
 *  The limit runs first and the same way for every email, so it doesn't reveal which ones have accounts. */
export const request = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    await limit(ctx, "reset", RESET_GLOBAL, RESET_WINDOW_MS, TOO_MANY);
    await limit(ctx, `reset:${await hashEmail(email)}`, RESET_PER_EMAIL, RESET_WINDOW_MS, TOO_MANY);
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", "password").eq("providerAccountId", email))
      .first();
    return { exists: !!account };
  },
});

/** Sends the code. Scheduled, so asking for a code takes about as long whether or not the email has an account. */
export const send = internalAction({
  args: { to: v.string(), code: v.string() },
  handler: async (_ctx, { to, code }) => {
    await sendResetEmail(to, code);
  },
});
