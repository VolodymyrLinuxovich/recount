// Optional accounts: email + password (Convex Auth). No outside email service, so there is no
// email verification and no password reset by email. Passwords are hashed by the library, and
// failed sign-ins are rate limited (10 per hour per account, then one every 6 minutes).
//
// Sign in with Google is added only when AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are set.
// Linking: a Google sign-in never joins an existing password account with the same email.
// Password emails are never verified here, so anyone could create a password account with
// someone else's email first; linking would hand them the real owner's bills later. Google
// makes its own account instead (the UI says so), and password sign-up is refused for an
// email that already signs in with a Google-verified address.
import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
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
    return { id: p.sub, name: p.name, email: String(p.email ?? "").toLowerCase(), image: p.picture, emailVerified: p.email_verified === true };
  },
});

/** Which sign-in buttons the app should show. */
export const providers = query({ args: {}, handler: async () => ({ google: googleOn }) });

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: googleOn ? [password, google] : [password],
  signIn: { maxFailedAttempsPerHour: 10 },
});
