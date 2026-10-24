// Optional accounts: email + password (Convex Auth). No outside email service, so there is no
// email verification and no password reset by email. Passwords are hashed by the library, and
// failed sign-ins are rate limited (10 per hour per account, then one every 6 minutes).
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const password = Password({
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

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [password],
  signIn: { maxFailedAttempsPerHour: 10 },
});
