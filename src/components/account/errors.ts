// Backend errors in one plain sentence. ConvexError data is a fixed English string from convex/auth.ts
// and convex/profile.ts; anything else from sign-in is the library's generic error.
import { ConvexError } from "convex/values";
import type { Key, T } from "../i18n/strings";

const KNOWN: Record<string, Key> = {
  "Please enter a valid email address.": "acct.errEmail",
  "Password must be at least 8 characters.": "acct.errShort",
  "Password is too long.": "acct.errLong",
  "ZIP code should look like 94110.": "letters.errZip",
  "Please enter a full phone number.": "letters.errPhone",
  "Date of birth should be YYYY-MM-DD.": "letters.errDob",
};

export function rawError(e: unknown): string {
  if (e instanceof ConvexError) return String(e.data);
  return e instanceof Error ? e.message : String(e);
}

export function authError(t: T, e: unknown, flow: "signIn" | "signUp"): string {
  const raw = rawError(e);
  if (KNOWN[raw]) return t(KNOWN[raw]);
  if (/too ?many/i.test(raw)) return t("acct.errTooMany");
  if (/signs in with Google/i.test(raw)) return t("acct.errGoogle");
  if (/already exists/i.test(raw)) return t("acct.errExists");
  if (/network|fetch|offline|connection/i.test(raw)) return t("acct.errNetwork");
  return flow === "signIn" ? t("acct.errWrong") : t("acct.errSignUp");
}

/** Password reset: asking for a code ("send") or using it ("verify"). A wrong, expired or
 *  rate-limited code all come back as the library's generic error, so they read the same. */
export function resetError(t: T, e: unknown, step: "send" | "verify"): string {
  const raw = rawError(e);
  if (KNOWN[raw]) return t(KNOWN[raw]);
  if (/too many code requests/i.test(raw)) return t("acct.errResetMany");
  if (/network|fetch|offline|connection/i.test(raw)) return t("acct.errNetwork");
  return step === "send" ? t("acct.errSend") : t("acct.errCodeWrong");
}

export function saveError(t: T, e: unknown): string {
  const raw = rawError(e);
  if (raw === "Please enter a valid email address.") return t("letters.errEmail");
  if (KNOWN[raw]) return t(KNOWN[raw]);
  return t("acct.errSave");
}
