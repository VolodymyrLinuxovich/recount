// Password reset by email. Off until the deployment has a Resend key and a sender address:
//   AUTH_RESEND_KEY   a Resend API key (resend.com, API Keys)
//   AUTH_EMAIL_FROM   the sender, on a domain verified in Resend, like "Recount <help@example.org>"
// Without both, the "Forgot password?" link stays hidden and the reset flows are refused.

const env = (k: string) => (process.env[k] ?? "").trim();

export function resetOn(): boolean {
  return !!(env("AUTH_RESEND_KEY") && env("AUTH_EMAIL_FROM"));
}

/** A code works for 15 minutes. */
export const RESET_CODE_MINUTES = 15;
/** Code requests: 3 per email per hour, and 200 per hour for the whole deployment. */
export const RESET_PER_EMAIL = 3;
export const RESET_GLOBAL = 200;
export const RESET_WINDOW_MS = 60 * 60 * 1000;

/** Six random digits, without modulo bias. */
export function sixDigitCode(rand: (buf: Uint32Array) => Uint32Array = (b) => crypto.getRandomValues(b)): string {
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  for (;;) {
    const n = rand(buf)[0];
    if (n < limit) return String(n % 1_000_000).padStart(6, "0");
  }
}

/** Hex SHA-256, so rate-limit rows never hold the email itself. */
export async function hashEmail(email: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The email, in English and Spanish, since we don't know which the person reads. */
export function resetMessage(code: string) {
  const subject = `Your Recount code: ${code}`;
  const text = [
    `Your code to reset your Recount password is ${code}.`,
    `It works for ${RESET_CODE_MINUTES} minutes. If you didn't ask for it, ignore this email. Your password stays the same.`,
    "",
    `Su código para cambiar su contraseña de Recount es ${code}.`,
    `Funciona durante ${RESET_CODE_MINUTES} minutos. Si usted no lo pidió, ignore este correo. Su contraseña no cambia.`,
  ].join("\n");
  return { subject, text };
}

/** Send through Resend's HTTP API. Returns false on any failure; never logs the key or the code. */
export async function sendResetEmail(to: string, code: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const { subject, text } = resetMessage(code);
  try {
    const res = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("AUTH_RESEND_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env("AUTH_EMAIL_FROM"), to: [to], subject, text }),
    });
    if (!res.ok) console.warn(`Reset email not sent: Resend answered ${res.status}`);
    return res.ok;
  } catch {
    console.warn("Reset email not sent: could not reach Resend");
    return false;
  }
}
