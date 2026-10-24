"use client";

// The current screen lives in the link: /case/<id>#t=<token>&s=<step>.
// Moving forward adds a browser history entry, so the phone's Back button works.
import { useCallback, useEffect, useState } from "react";

function readHash(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

export function useStep(): [string | null, (step: string, replace?: boolean) => void] {
  const [step, setStep] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setStep(readHash().get("s"));
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, []);
  const go = useCallback((next: string, replace = false) => {
    const p = readHash();
    p.set("s", next);
    const url = `${window.location.pathname}${window.location.search}#${p.toString()}`;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    setStep(next);
    window.scrollTo({ top: 0 });
  }, []);
  return [step, go];
}
