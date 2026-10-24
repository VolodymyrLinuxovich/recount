"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { type Lang, type T, translate } from "./strings";

export type { Lang } from "./strings";

const STORAGE_KEY = "recount.lang";

// The chosen language lives in a tiny store so every component reads the same value,
// the server always renders English, and the browser switches right after hydration.
let current: Lang | null = null;
const listeners = new Set<() => void>();

function detect(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {
    // Storage can be blocked (private mode, settings). Fall back to the browser language.
  }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  return langs[0]?.toLowerCase().startsWith("es") ? "es" : "en";
}

function getSnapshot(): Lang {
  if (current === null) current = detect();
  return current;
}

const getServerSnapshot = (): Lang => "en";

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && (e.newValue === "en" || e.newValue === "es")) {
      current = e.newValue;
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function storeLang(lang: Lang) {
  current = lang;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not saved; the choice still holds for this visit.
  }
  listeners.forEach((l) => l());
}

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: T;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback<T>((key, ...args) => translate(lang, key, ...args), [lang]);
  const value = useMemo(() => ({ lang, setLang: storeLang, t }), [lang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** The current language, a setter, and t(key, vars?) for UI text. */
export function useT(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used inside <I18nProvider>");
  return ctx;
}
