// Display settings ("Display / Pantalla"): text size and contrast, saved per device in
// localStorage ("recount.a11y") and applied on <html> as data-text ("large" | "largest") and data-contrast.
// The inline script in the root layout applies the saved choice before the first paint.
// With nothing saved, a system "more contrast" setting turns on Large + black on white.

export type TextSize = "standard" | "large" | "largest";
export type Contrast = "standard" | "hv-light" | "hv-dark";

export interface Vision {
  text: TextSize;
  contrast: Contrast;
}

export const VISION_KEY = "recount.a11y";

const STANDARD: Vision = { text: "standard", contrast: "standard" };
const MORE: Vision = { text: "large", contrast: "hv-light" };

/** Runs in <head> before paint. Kept tiny and self-contained (no imports). */
export const VISION_SCRIPT = `(function(){var d=document.documentElement,v=null;try{v=JSON.parse(localStorage.getItem("${VISION_KEY}")||"null")}catch(e){}if(!v&&window.matchMedia&&matchMedia("(prefers-contrast: more)").matches)v={text:"large",contrast:"hv-light"};if(!v)return;if(v.text==="large"||v.text==="largest")d.setAttribute("data-text",v.text);if(v.contrast==="hv-light"||v.contrast==="hv-dark")d.setAttribute("data-contrast",v.contrast)})()`;

let current: Vision | null = null;
const listeners = new Set<() => void>();

function clean(v: Partial<Vision> | null): Vision | null {
  if (!v || typeof v !== "object") return null;
  return {
    text: v.text === "large" || v.text === "largest" ? v.text : "standard",
    contrast: v.contrast === "hv-light" || v.contrast === "hv-dark" ? v.contrast : "standard",
  };
}

function read(): Vision {
  try {
    const saved = clean(JSON.parse(window.localStorage.getItem(VISION_KEY) ?? "null") as Partial<Vision> | null);
    if (saved) return saved;
  } catch {
    // Storage blocked: fall back to what the page already shows.
    const d = document.documentElement;
    return clean({ text: d.dataset.text as TextSize, contrast: d.dataset.contrast as Contrast }) ?? STANDARD;
  }
  return window.matchMedia?.("(prefers-contrast: more)").matches ? MORE : STANDARD;
}

function apply(v: Vision) {
  const d = document.documentElement;
  if (v.text !== "standard") d.dataset.text = v.text;
  else delete d.dataset.text;
  if (v.contrast !== "standard") d.dataset.contrast = v.contrast;
  else delete d.dataset.contrast;
}

export function getVision(): Vision {
  if (current === null) current = read();
  return current;
}

export const getServerVision = (): Vision => STANDARD;

export function setVision(v: Vision) {
  current = v;
  apply(v);
  try {
    window.localStorage.setItem(VISION_KEY, JSON.stringify(v));
  } catch {
    // Can't save (private mode): it still applies until the tab closes.
  }
  listeners.forEach((l) => l());
}

export function subscribeVision(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== VISION_KEY) return;
    current = read();
    apply(current);
    listeners.forEach((l) => l());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}
