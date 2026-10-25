// Optional accounts: email + password (Convex Auth). There is no email verification. Passwords are
// hashed by the library, and failed sign-ins are rate limited (10 per hour per account, then one
// every 6 minutes).
//
// Password reset by email is on only when AUTH_RESEND_KEY and AUTH_EMAIL_FROM are set (see
// convex/lib/resetEmail.ts). Then "reset" emails a 6-digit code that works for 15 minutes, and
// "reset-verification" takes the code and a new password, signs out every other session and signs
// in. Code requests are limited to 3 per email per hour, and wrong codes count against the same
// sign-in limit as wrong passwords. Asking for a code answers the same way whether or not the email
// has a password account. A finished reset marks the email verified, since the person showed they
// read that inbox; a later Google sign-in with the same verified address then joins that account.
//
// Sign in with Google is added only when AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are set.
// Linking: a Google sign-in never joins an existing password account with the same email.
// Password emails are never verified here, so anyone could create a password account with
// someone else's email first; linking would hand them the real owner's bills later. Google
// makes its own account instead (the UI says so), and password sign-up is refused for an
// email that already signs in with a Google-verified address.
import Google from "@auth/core/providers/google";
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { Scheduler } from "convex/server";
import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import { internal } from "./_generated/api";
import { RESET_CODE_MINUTES, resetOn, sixDigitCode } from "./lib/resetEmail";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const resetEnabled = resetOn();

// The code is sent from a scheduled action (convex/passwordReset.ts), so the request returns at once.
const resetEmail = Email({
  id: "password-reset",
  maxAge: RESET_CODE_MINUTES * 60,
  generateVerificationToken: async () => sixDigitCode(),
  sendVerificationRequest: async ({ identifier, token }: { identifier: string; token: string }, ctx?: { scheduler: Scheduler }) => {
    await ctx!.scheduler.runAfter(0, internal.passwordReset.send, { to: identifier, code: token });
  },
});

const FLOWS = resetEnabled ? ["signIn", "signUp", "reset", "reset-verification"] : ["signIn", "signUp"];

const base = Password({
  reset: resetEnabled ? resetEmail : undefined,
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
    authorize: async (raw: Record<string, unknown>, ctx: any) => {
      if (!FLOWS.includes(String(raw.flow))) throw new ConvexError("This sign-in option is not available.");
      // The reset code is checked against the stored (lowercase) email, so pass that form on.
      const params: Record<string, unknown> = { ...raw, email: String(raw.email ?? "").trim().toLowerCase() };
      if (params.flow === "reset") {
        const email = params.email as string;
        if (!EMAIL.test(email) || email.length > 254) throw new ConvexError("Please enter a valid email address.");
        const { exists } = await ctx.runMutation(internal.passwordReset.request, { email });
        // No password account (none at all, or Google only): do nothing, and answer like a sent code.
        if (!exists) return null;
      }
      if (params.flow === "signUp") {
        const email = String(params.email ?? "").trim().toLowerCase();
        if (await ctx.runQuery(internal.authCheck.accountExists, { email })) {
          throw new ConvexError("An account with this email already exists. Please sign in.");
        }
        if (await ctx.runQuery(internal.authCheck.googleEmail, { email })) {
          throw new ConvexError("This email signs in with Google. Please use Continue with Google.");
        }
      }
      return inner.authorize(params, ctx);
    },
  },
};

const googleOn = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const google = Google({
  // Mark the email verified only when Google says so.
  profile(p) {
    const name = String(p.name || [p.given_name, p.family_name].filter(Boolean).join(" ")).trim().slice(0, 120) || undefined;
    return { id: p.sub, name, email: String(p.email ?? "").toLowerCase(), image: p.picture, emailVerified: p.email_verified === true };
  },
});

/** Which sign-in buttons the app should show. */
export const providers = query({ args: {}, handler: async () => ({ google: googleOn, reset: resetEnabled }) });

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: googleOn ? [password, google] : [password],
  signIn: { maxFailedAttempsPerHour: 10 },
});
