"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useT } from "../i18n/I18nProvider";
import type { Phase } from "./steps";

export interface Action {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  busy?: boolean;
  /** Shown above the buttons while the button is disabled: what's still missing. */
  hint?: string | null;
}

// The phase the last screen showed, so the progress bar can fill from there instead of from empty.
let lastPhase: Phase | null = null;

/** A bar button: the primary is filled with ink, everything else is an outline on the sheet color. */
function BarButton({ action, kind }: { action: Action; kind: "primary" | "secondary" }) {
  const cls = `btn btn-big bar-btn bar-${kind}`;
  if (action.href) {
    return (
      <a className={cls} href={action.href}>
        <span>{action.label}</span>
      </a>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      onClick={action.onClick}
      disabled={action.disabled || action.busy}
      aria-busy={action.busy || undefined}
    >
      <span>{action.label}</span>
    </button>
  );
}

/**
 * One screen of the flow: where you are, one thing to read or do, and a bar pinned at the bottom.
 * The bar is one row: Back on the left, the main button on the right, the same height.
 * A second action sits in that row when there's no Back, or as a full-width outline button above it.
 */
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

  // Progress: draw the previous screen's phase first, then let the segments fill to this one.
  const [shown, setShown] = useState<Phase>(() => lastPhase ?? phase);
  useEffect(() => {
    lastPhase = phase;
    if (shown === phase) return;
    const id = requestAnimationFrame(() => setShown(phase));
    return () => cancelAnimationFrame(id);
  }, [phase, shown]);

  // After moving between screens, put keyboard and screen reader focus on the new title,
  // unless the screen already focused something itself (like a text box).
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!document.documentElement.dataset.stepDir) return;
    const a = document.activeElement;
    if (a && a !== document.body && document.contains(a)) return;
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  // The pinned bar changes height (hint, second button, larger text), so the page leaves room for it.
  const barRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    const screen = screenRef.current;
    if (!bar || !screen || typeof ResizeObserver === "undefined") return;
    // Also on <html>, whose scroll-padding keeps a focused control from landing under the bar.
    const root = document.documentElement;
    const ro = new ResizeObserver(() => {
      const h = `${bar.offsetHeight}px`;
      screen.style.setProperty("--bar-h", h);
      root.style.setProperty("--bar-h", h);
    });
    ro.observe(bar);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--bar-h");
    };
  }, []);

  const back: Action | undefined = onBack ? { label: t("flow.back"), onClick: onBack } : undefined;
  // At most two buttons in the row. With Back + primary, a secondary goes above as a full-width outline.
  const above = secondary && back && primary ? secondary : undefined;
  const left = back ?? (primary ? secondary : undefined);
  const right = primary ?? secondary;
  const solo = !left || !right;
  const hasBar = Boolean(primary || secondary || onBack);

  return (
    <div className="step-screen" ref={screenRef}>
      <div className="step-top">
        <div className="step-progress" role="img" aria-label={t("progress.of", { n: phase, total: 4 })}>
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={n < shown ? "seg done" : n === shown ? "seg now" : "seg"} />
          ))}
        </div>
        <p className="step-progress-text">
          {t("progress.of", { n: phase, total: 4 })} · {t(`progress.${phase}`)}
        </p>
      </div>

      <div className="step-body">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {title ? (
          <h1 className="step-title" ref={titleRef} tabIndex={-1}>
            {title}
          </h1>
        ) : null}
        {children}
      </div>

      {hasBar && (
        <div className="step-bar" ref={barRef}>
          <div className="step-bar-inner">
            {primary?.disabled && primary.hint && (
              <p className="step-hint" role="status">
                {primary.hint}
              </p>
            )}
            {above && (
              <div className="step-bar-above">
                <BarButton action={above} kind="secondary" />
              </div>
            )}
            <div className={solo ? "step-bar-row solo" : "step-bar-row"}>
              {left &&
                (left === back ? (
                  <button type="button" className="btn btn-big bar-btn bar-secondary bar-back" onClick={onBack}>
                    <span aria-hidden="true" className="bar-arrow">
                      ←
                    </span>
                    <span>{back.label}</span>
                  </button>
                ) : (
                  <BarButton action={left} kind="secondary" />
                ))}
              {right && <BarButton action={right} kind={right === primary ? "primary" : "secondary"} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
