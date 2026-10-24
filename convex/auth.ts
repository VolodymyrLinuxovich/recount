// Optional accounts: email + password (Convex Auth). No outside email service, so there is no
// email verification and no password reset by email. Passwords are hashed by the library, and
// failed sign-ins are rate limited (10 per hour per account, then one every 6 minutes).
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const base = Password({
  profile(params) {
    const email = String(params.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) throw new ConvexError("Please enter a valid email address.");
    return { email };
  },
  validatePasswordRequirements(pw: string) {
    if (pw.length < 8) throw new ConvexError("Password must be at least 8 characters.");
    if (pw.length > 200) throw new ConvexError("Password is too long.");
  },
});

// Sign-up with an email that already has an account would check the password without counting
// failed tries, which skips the sign-in limit. So sign-up is refused for existing emails.
const inner = (base as unknown as { options: { authorize: (params: Record<string, unknown>, ctx: any) => Promise<unknown> } }).options;
const password = {
  ...base,
  options: {
    ...inner,
    authorize: async (params: Record<string, unknown>, ctx: any) => {
      if (params.flow === "signUp") {
        const email = String(params.email ?? "").trim().toLowerCase();
        if (await ctx.runQuery(internal.authCheck.accountExists, { email })) {
          throw new ConvexError("An account with this email already exists. Please sign in.");
        }
      }
      return inner.authorize(params, ctx);
    },
  },
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [password],
  signIn: { maxFailedAttempsPerHour: 10 },
});
