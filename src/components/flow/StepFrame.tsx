"use client";

import type { ReactNode } from "react";
import { useT } from "../i18n/I18nProvider";
import type { Phase } from "./steps";

export interface Action {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  busy?: boolean;
  /** Shown under a disabled button: what's still missing. */
  hint?: string | null;
}

/** One screen of the flow: where you are, one thing to read or do, one big button at the bottom. */
export function StepFrame({
  phase,
  eyebrow,
  title,
  children,
  primary,
  secondary,
  onBack,
}: {
  phase: Phase;
  eyebrow?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  primary?: Action;
  secondary?: Action;
  onBack?: () => void;
}) {
  const { t } = useT();
  return (
    <div className="step-screen">
      <div className="step-top">
        <div className="step-progress" aria-label={t("progress.of", { n: phase, total: 4 })}>
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={n < phase ? "seg done" : n === phase ? "seg now" : "seg"} />
          ))}
        </div>
        <p className="step-progress-text">
          {t("progress.of", { n: phase, total: 4 })} · {t(`progress.${phase}`)}
        </p>
      </div>

      <div className="step-body">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {title && <h1 className="step-title">{title}</h1>}
        {children}
      </div>

      {(primary || secondary || onBack) && (
        <div className="step-bar">
          <div className="step-bar-inner">
            {primary && (
              <>
                {primary.href ? (
                  <a className="btn btn-primary btn-big" href={primary.href}>
                    {primary.label}
                  </a>
                ) : (
                  <button className="btn btn-primary btn-big" onClick={primary.onClick} disabled={primary.disabled || primary.busy}>
                    {primary.label}
                  </button>
                )}
                {primary.disabled && primary.hint && <p className="step-hint">{primary.hint}</p>}
              </>
            )}
            <div className="step-bar-row">
              {onBack ? (
                <button className="step-back" onClick={onBack}>
                  ← {t("flow.back")}
                </button>
              ) : (
                <span />
              )}
              {secondary &&
                (secondary.href ? (
                  <a className="step-back" href={secondary.href}>
                    {secondary.label}
                  </a>
                ) : (
                  <button className="step-back" onClick={secondary.onClick} disabled={secondary.disabled}>
                    {secondary.label}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
