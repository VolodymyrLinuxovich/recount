"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { type FormEvent, useId, useState } from "react";
import { useT } from "../i18n/I18nProvider";
import { resetError } from "./errors";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Forgot password: email → 6-digit code by email → code and a new password, which signs in.
 *  The "code sent" line is the same whether or not the email has an account. */
export function ResetPassword({ startEmail, onBack }: { startEmail: string; onBack: () => void }) {
  const { t } = useT();
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState(startEmail);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const em = (sentTo ?? email).trim().toLowerCase();
    if (!EMAIL.test(em)) return setError(t("acct.errEmail"));
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email: em, flow: "reset" });
      setSentTo(em);
      setCode("");
    } catch (err) {
      setError(resetError(t, err, "send"));
    }
    setBusy(false);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    const c = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(c)) return setError(t("acct.errCode"));
    if (password.length < 8) return setError(t("acct.errShort"));
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email: sentTo!, code: c, newPassword: password, flow: "reset-verification" });
      // Signed in: the page switches to "Your account".
    } catch (err) {
      setError(resetError(t, err, "verify"));
      setBusy(false);
    }
  }

  const errorNote = error && (
    <p className="error-note acct-error" role="alert">
      {error}
    </p>
  );

  return (
    <section className="acct-card rc-card" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className="acct-card-h">
        {t("acct.resetH")}
      </h2>
      {sentTo === null ? (
        <form onSubmit={send} noValidate className="acct-form">
          <p className="details-hint">{t("acct.resetLede")}</p>
          <div className="details-field">
            <label className="details-label" htmlFor={`${uid}-email`}>
              {t("acct.email")}
            </label>
            <input
              id={`${uid}-email`}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error === t("acct.errEmail") || undefined}
            />
          </div>
          {errorNote}
          <button type="submit" className="rc-btn rc-btn--block acct-submit" disabled={busy}>
            {busy ? t("acct.working") : t("acct.sendCode")}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} noValidate className="acct-form">
          <p className="details-hint" role="status">
            {t("acct.codeSent", { email: sentTo })}
          </p>
          <div className="details-field">
            <label className="details-label" htmlFor={`${uid}-code`}>
              {t("acct.code")}
            </label>
            <input
              id={`${uid}-code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-invalid={error === t("acct.errCode") || error === t("acct.errCodeWrong") || undefined}
            />
          </div>
          <div className="details-field">
            <label className="details-label" htmlFor={`${uid}-pw`}>
              {t("acct.newPassword")}
            </label>
            <p className="details-hint" id={`${uid}-pw-hint`}>
              {t("acct.passwordHint")}
            </p>
            <div className="acct-pw">
              <input
                id={`${uid}-pw`}
                type={show ? "text" : "password"}
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={`${uid}-pw-hint`}
              />
              <button type="button" className="acct-pw-toggle" aria-pressed={show} onClick={() => setShow((s) => !s)}>
                {show ? t("acct.hide") : t("acct.show")}
              </button>
            </div>
          </div>
          {errorNote}
          <button type="submit" className="rc-btn rc-btn--block acct-submit" disabled={busy}>
            {busy ? t("acct.working") : t("acct.setPassword")}
          </button>
          <p className="acct-quiet">
            <button type="button" className="link-btn" onClick={() => send()} disabled={busy}>
              {t("acct.resendCode")}
            </button>
          </p>
        </form>
      )}
      <p className="acct-quiet">
        <button type="button" className="link-btn" onClick={onBack}>
          {t("acct.backToSignIn")}
        </button>
      </p>
    </section>
  );
}
