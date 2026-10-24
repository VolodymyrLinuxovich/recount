"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "../i18n/I18nProvider";
import type { PlainKey } from "../i18n/strings";
import { type Contrast, getServerVision, getVision, setVision, subscribeVision, type TextSize } from "./vision";
import "./a11y.css";

const TEXT: { value: TextSize; key: PlainKey }[] = [
  { value: "standard", key: "a11y.standard" },
  { value: "large", key: "a11y.large" },
];

const CONTRAST: { value: Contrast; key: PlainKey }[] = [
  { value: "standard", key: "a11y.standard" },
  { value: "hv-light", key: "a11y.hvLight" },
  { value: "hv-dark", key: "a11y.hvDark" },
];

/** "Aa Display" in the masthead: opens a small sheet with text size and contrast choices. */
export function VisionToggle() {
  const { t } = useT();
  const v = useSyncExternalStore(subscribeVision, getVision, getServerVision);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const name = useId();
  const on = v.text !== "standard" || v.contrast !== "standard";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div className="vision" ref={wrap}>
      <button
        ref={button}
        type="button"
        className={on ? "vision-btn on" : "vision-btn"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="vision-aa" aria-hidden="true">
          A+
        </span>
        <span className="vision-word">{t("a11y.open")}</span>
      </button>
      {open && (
        <div className="vision-panel" id={panelId} role="dialog" aria-label={t("a11y.title")}>
          <p className="vision-title">{t("a11y.title")}</p>
          <fieldset className="vision-group">
            <legend>{t("a11y.textSize")}</legend>
            <div className="vision-options">
              {TEXT.map((o) => (
                <label key={o.value} className="vision-option">
                  <input
                    type="radio"
                    name={`${name}-text`}
                    value={o.value}
                    checked={v.text === o.value}
                    onChange={() => setVision({ ...v, text: o.value })}
                  />
                  <span>{t(o.key)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="vision-group">
            <legend>{t("a11y.contrast")}</legend>
            <div className="vision-options vision-options-3">
              {CONTRAST.map((o) => (
                <label key={o.value} className={`vision-option vision-swatch-${o.value}`}>
                  <input
                    type="radio"
                    name={`${name}-contrast`}
                    value={o.value}
                    checked={v.contrast === o.value}
                    onChange={() => setVision({ ...v, contrast: o.value })}
                  />
                  <span>{t(o.key)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" className="btn vision-done" onClick={close}>
            {t("a11y.done")}
          </button>
        </div>
      )}
    </div>
  );
}
