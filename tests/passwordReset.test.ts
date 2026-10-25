import { afterEach, describe, expect, it, vi } from "vitest";
import { hashEmail, resetMessage, resetOn, sendResetEmail, sixDigitCode } from "../convex/lib/resetEmail";

afterEach(() => vi.unstubAllEnvs());

describe("password reset switch", () => {
  it("is off without both the Resend key and a sender", () => {
    vi.stubEnv("AUTH_RESEND_KEY", "");
    vi.stubEnv("AUTH_EMAIL_FROM", "");
    expect(resetOn()).toBe(false);
    vi.stubEnv("AUTH_RESEND_KEY", "re_test");
    expect(resetOn()).toBe(false);
    vi.stubEnv("AUTH_EMAIL_FROM", "Recount <help@example.org>");
    expect(resetOn()).toBe(true);
  });
});

describe("codes", () => {
  it("are six digits, zero-padded", () => {
    for (let i = 0; i < 200; i++) expect(sixDigitCode()).toMatch(/^\d{6}$/);
    expect(sixDigitCode((b) => ((b[0] = 42), b))).toBe("000042");
  });

  it("skip values that would bias the result", () => {
    const vals = [0xffffffff, 7];
    expect(sixDigitCode((b) => ((b[0] = vals.shift()!), b))).toBe("000007");
  });
});

describe("email", () => {
  it("hashes the email for rate-limit keys", async () => {
    const h = await hashEmail("maria@gmail.com");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("maria");
  });

  it("puts the code in both languages", () => {
    const m = resetMessage("123456");
    expect(m.subject).toContain("123456");
    expect(m.text).toContain("Your code to reset your Recount password is 123456.");
    expect(m.text).toContain("Su código para cambiar su contraseña de Recount es 123456.");
    expect(m.text).toContain("15 minutes");
  });

  it("sends through Resend and reports failures", async () => {
    vi.stubEnv("AUTH_RESEND_KEY", "re_test");
    vi.stubEnv("AUTH_EMAIL_FROM", "Recount <help@example.org>");
    const calls: [string, RequestInit][] = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await sendResetEmail("maria@gmail.com", "123456", ok)).toBe(true);
    expect(calls[0][0]).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(calls[0][1].body));
    expect(body).toMatchObject({ from: "Recount <help@example.org>", to: ["maria@gmail.com"] });
    expect((calls[0][1].headers as Record<string, string>).Authorization).toBe("Bearer re_test");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = (async () => new Response("no", { status: 403 })) as unknown as typeof fetch;
    expect(await sendResetEmail("maria@gmail.com", "123456", bad)).toBe(false);
    const down = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await sendResetEmail("maria@gmail.com", "123456", down)).toBe(false);
    expect(warn.mock.calls.flat().join(" ")).not.toMatch(/re_test|123456/);
    warn.mockRestore();
  });
});
