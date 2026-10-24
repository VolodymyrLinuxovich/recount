"use client";

import { useState, useSyncExternalStore } from "react";
import { useT } from "../i18n/I18nProvider";
import "./install.css";

const KEY = "recount.installHint.dismissed";

/** iPhone or iPad Safari, not already opened from the home screen, and the tip not closed before. */
function shouldShow() {
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // Other iOS browsers name themselves; in-app browsers (Facebook, Instagram, Line) can't add to the home screen.
  const safari = /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\//.test(ua);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  if (!iOS || !safari || standalone) return false;
  try {
    return window.localStorage.getItem(KEY) !== "1";
  } catch {
    return true;
  }
}

const noSubscribe = () => () => {};

export function InstallHint() {
  const { t } = useT();
  const eligible = useSyncExternalStore(noSubscribe, shouldShow, () => false);
  const [closed, setClosed] = useState(false);
  if (!eligible || closed) return null;

  return (
    <aside className="install-hint" role="note">
      <svg className="install-share" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p>{t("install.text")}</p>
      <button
        type="button"
        className="install-close"
        aria-label={t("install.dismiss")}
        onClick={() => {
          setClosed(true);
          try {
            window.localStorage.setItem(KEY, "1");
          } catch {
            // Not saved; the tip stays hidden for this visit.
          }
        }}
      >
        ×
      </button>
    </aside>
  );
}
