"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { type FormEvent, useId, useState } from "react";
import { useT } from "../i18n/I18nProvider";
import { authError } from "./errors";
import { GoogleButton } from "./GoogleButton";

type Mode = "signUp" | "signIn";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Signed out: create an account or sign in. Optional, and says so. */
export function AuthCard({ startIn = "signUp", next = null, googleFailed = false }: { startIn?: Mode; next?: string | null; googleFailed?: boolean }) {
  const { t } = useT();
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<Mode>(startIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const uid = useId();

  const pick = (m: Mode) => {
    setMode(m);
    setError(null);
    setExists(false);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!EMAIL.test(em)) return setError(t("acct.errEmail"));
    if (mode === "signUp" && password.length < 8) return setError(t("acct.errShort"));
    if (!password) return setError(t("acct.errNoPassword"));
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email: em, password, flow: mode });
      // The page switches to "Your account" once the sign-in handshake finishes.
    } catch (err) {
      const msg = authError(t, err, mode);
      setError(msg);
      setExists(msg === t("acct.errExists"));
      setBusy(false);
    }
  }

  return (
    <section className="acct-card rc-card" aria-labelledby={`${uid}-h`}>
      {googleFailed && (
        <p className="error-note acct-error" role="alert">
          {t("acct.googleFailed")}
        </p>
      )}
      <div className="acct-tabs" role="group" aria-label={t("acct.modeLabel")}>
        <button type="button" className="acct-tab" aria-pressed={mode === "signUp"} onClick={() => pick("signUp")}>
          {t("acct.tabCreate")}
        </button>
        <button type="button" className="acct-tab" aria-pressed={mode === "signIn"} onClick={() => pick("signIn")}>
          {t("acct.tabSignIn")}
        </button>
      </div>
      <h2 id={`${uid}-h`} className="acct-card-h">
        {mode === "signUp" ? t("acct.tabCreate") : t("acct.tabSignIn")}
      </h2>
      <form onSubmit={submit} noValidate className="acct-form">
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
        <div className="details-field">
          <label className="details-label" htmlFor={`${uid}-pw`}>
            {t("acct.password")}
          </label>
          {mode === "signUp" && (
            <p className="details-hint" id={`${uid}-pw-hint`}>
              {t("acct.passwordHint")}
            </p>
          )}
          <div className="acct-pw">
            <input
              id={`${uid}-pw`}
              type={show ? "text" : "password"}
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              autoCapitalize="none"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={mode === "signUp" ? `${uid}-pw-hint` : undefined}
            />
            <button type="button" className="acct-pw-toggle" aria-pressed={show} onClick={() => setShow((s) => !s)}>
              {show ? t("acct.hide") : t("acct.show")}
            </button>
          </div>
        </div>
        {mode === "signUp" && <p className="acct-warn">{t("acct.noReset")}</p>}
        {error && (
          <p className="error-note acct-error" role="alert">
            {error}
            {exists && mode === "signUp" && (
              <>
                {" "}
                <button type="button" className="link-btn" onClick={() => pick("signIn")}>
                  {t("acct.toSignIn")}
                </button>
              </>
            )}
          </p>
        )}
        <button type="submit" className="rc-btn rc-btn--block acct-submit" disabled={busy}>
          {busy ? t("acct.working") : mode === "signUp" ? t("acct.create") : t("acct.signInBtn")}
        </button>
      </form>
      <GoogleButton next={next} />
      {mode === "signIn" && <p className="acct-quiet">{t("acct.noForgot")}</p>}
    </section>
  );
}
