"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useT } from "../i18n/I18nProvider";
import type { PlainKey } from "../i18n/strings";
import { IconBill, IconCard, IconCheck, IconHome, IconLetter, PhotoTips } from "./Icons";
import { markOnboarded } from "./seen";
import "../flow/flow.css";
import "./onboarding.css";

export type OnboardPath = "photo" | "sample";

type VTDocument = Document & { startViewTransition?: (update: () => void) => unknown };

/** The same slide as the case flow (flow.css, useStep): direction on <html>, a View Transition when there is one. */
function slide(dir: "forward" | "back", update: () => void) {
  const root = document.documentElement;
  const doc = document as VTDocument;
  const vt = typeof doc.startViewTransition === "function";
  root.dataset.stepDir = dir;
  root.dataset.stepVia = vt ? "vt" : "css";
  if (!vt) return update();
  try {
    doc.startViewTransition!(() => flushSync(update));
  } catch {
    update();
  }
}

/**
 * "Before you start": a few one-screen steps shown once per browser, before the
 * camera opens or the sample starts. Uses the case flow's step classes so it
 * looks and behaves like the rest of the flow.
 *
 * `onPhoto` must open the file picker synchronously: it runs inside the tap
 * handler, which browsers require for a file input.
 */
export function Onboarding({
  path,
  busy,
  error,
  onPhoto,
  onSample,
  onClose,
}: {
  path: OnboardPath;
  busy: boolean;
  error: ReactNode;
  onPhoto: () => void;
  onSample: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const total = path === "sample" ? 1 : 3;
  const [step, setStep] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    title.current?.focus({ preventScroll: true });
  }, [step]);

  // Leave room under the content for the pinned bar, like StepFrame does.
  const bar = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const b = bar.current;
    const sc = screen.current;
    if (!b || !sc || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => sc.style.setProperty("--bar-h", `${b.offsetHeight}px`));
    ro.observe(b);
    return () => ro.disconnect();
  }, []);

  const go = (to: number) => slide(to > step ? "forward" : "back", () => setStep(to));

  const finish = () => {
    markOnboarded(path);
    if (path === "sample") onSample();
    else onPhoto();
  };

  const last = step === total - 1;
  const primaryLabel = path === "sample" ? (busy ? t("start.sampleBusy") : t("onboard.startSample")) : last ? t("onboard.takePhoto") : t("onboard.next");

  const item = (icon: ReactNode, key: PlainKey) => (
    <li key={key}>
      <span className="onb-icon-wrap">{icon}</span>
      <span>{t(key)}</span>
    </li>
  );

  let titleKey: PlainKey;
  let body: ReactNode;
  if (step === 0) {
    titleKey = "onboard.helpTitle";
    body = (
      <>
        <ul className="onb-list">
          {item(<IconBill />, "onboard.help1")}
          {item(<IconCheck />, "onboard.help2")}
          {item(<IconLetter />, "onboard.help3")}
        </ul>
        <p className="onb-note">{t("onboard.helpTime")}</p>
        {path === "sample" && <p className="onb-note">{t("onboard.sampleNote")}</p>}
      </>
    );
  } else if (step === 1) {
    titleKey = "onboard.needTitle";
    body = (
      <>
        <ul className="onb-list">
          {item(<IconBill />, "onboard.need1")}
          {item(<IconHome />, "onboard.need2")}
          {item(<IconCard />, "onboard.need3")}
        </ul>
        <p className="onb-private">{t("onboard.private")}</p>
      </>
    );
  } else {
    titleKey = "onboard.photoTitle";
    body = (
      <>
        <PhotoTips label={t("onboard.photoAlt")} />
        <ul className="onb-tips">
          <li>{t("onboard.tip1")}</li>
          <li>{t("onboard.tip2")}</li>
          <li>{t("onboard.tip3")}</li>
        </ul>
        <p className="onb-note">{t("onboard.tipPdf")}</p>
      </>
    );
  }

  return (
    <div className="step-screen step-anim onb" ref={screen}>
      <div className="step-top onb-top">
        {total > 1 ? (
          <div className="onb-dots" role="img" aria-label={t("onboard.of", { n: step + 1, total })}>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i === step ? "onb-dot now" : i < step ? "onb-dot done" : "onb-dot"} />
            ))}
          </div>
        ) : (
          <span />
        )}
        <button type="button" className="step-back onb-skip" onClick={finish} disabled={busy}>
          {t("onboard.skip")}
        </button>
      </div>

      <div className="step-body onb-body" key={step}>
        <p className="eyebrow">{t("onboard.eyebrow")}</p>
        <h1 className="step-title" ref={title} tabIndex={-1}>
          {t(titleKey)}
        </h1>
        {body}
        {error}
      </div>

      <div className="step-bar" ref={bar}>
        <div className="step-bar-inner">
          <div className="step-bar-row">
            <button
              type="button"
              className="btn btn-big bar-btn bar-secondary bar-back"
              onClick={() => (step === 0 ? onClose() : go(step - 1))}
              disabled={busy}
            >
              <span aria-hidden="true" className="bar-arrow">
                ←
              </span>
              <span>{t("flow.back")}</span>
            </button>
            <button
              type="button"
              className="btn btn-big bar-btn bar-primary"
              disabled={busy}
              aria-busy={busy || undefined}
              onClick={() => (last ? finish() : go(step + 1))}
            >
              <span>{primaryLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
