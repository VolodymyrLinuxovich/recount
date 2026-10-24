"use client";

// The current screen lives in the link: /case/<id>#t=<token>&s=<step>.
// Moving forward adds a browser history entry, so the phone's Back button works.
// Each entry we add carries { recountI, s, prev } in history.state: its depth (so popstate can
// tell Back from Forward) and the step it came from (so in-app Back can be a real history.back()).
//
// Changing screens also slides them: a later screen comes in from the right, an earlier one
// (or the browser's Back button) from the left. The direction goes on <html data-step-dir>
// and the swap runs inside a View Transition when the browser has one (flow.css has the motion).
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

export type StepDir = "forward" | "back";

interface StepState {
  recountI?: number;
  s?: string | null;
  prev?: string | null;
}

function readStep(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("s");
}

function entry(): StepState {
  const st = window.history.state as StepState | null;
  return st && typeof st === "object" ? st : {};
}

/** How deep into this tab's history the current entry is. */
function depth(): number {
  const i = entry().recountI;
  return typeof i === "number" ? i : 0;
}

type VTDocument = Document & { startViewTransition?: (update: () => void) => unknown };

/** Swap screens with a slide in `dir`. Input is never blocked: flow.css lets taps through the transition layer. */
function slide(dir: StepDir, update: () => void) {
  const root = document.documentElement;
  const doc = document as VTDocument;
  const vt = typeof doc.startViewTransition === "function";
  root.dataset.stepDir = dir;
  // Without View Transitions, flow.css plays a keyframe on the newly mounted screen instead.
  root.dataset.stepVia = vt ? "vt" : "css";
  if (!vt) return update();
  try {
    doc.startViewTransition!(() => flushSync(update));
  } catch {
    update();
  }
}

// ---- a tiny store over the link, shared by the (single) flow on the page ----

const listeners = new Set<() => void>();
let shown: string | null = null; // the step we're moving to (or showing)
// What the screen renders. It changes only inside the transition's update, never earlier:
// Next re-renders the tree as soon as the URL changes, and the View Transition must
// photograph the old screen first.
let committed: string | null | undefined;
let at = 0; // depth of the entry the screen is showing
let path = "";

function notify() {
  listeners.forEach((l) => l());
}

function show(dir: StepDir | null, next: string | null) {
  shown = next;
  const update = () => {
    committed = next;
    notify();
    window.scrollTo({ top: 0 });
  };
  if (dir) slide(dir, update);
  else update();
}

function onPop() {
  if (window.location.pathname !== path) return; // leaving the case page: the router handles it
  const s = readStep();
  const i = depth();
  const dir: StepDir = i < at ? "back" : "forward";
  at = i;
  if (s !== shown) show(dir, s);
}

function onHash() {
  // Someone editing the link by hand: no history state to compare, so just follow it.
  const s = readStep();
  if (s !== shown) show(null, s);
}

function subscribe(cb: () => void) {
  if (listeners.size === 0) {
    shown = readStep();
    committed = shown;
    at = depth();
    path = window.location.pathname;
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onHash);
  }
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      committed = undefined;
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onHash);
    }
  };
}

const getStep = () => (committed === undefined ? readStep() : committed);

// The server has no link fragment, so it renders the bill's home screen; the client then follows the link.
const getServerStep = () => null;

/** Move to `step`. `replace` rewrites the current history entry; `quiet` skips the slide. */
export type Go = (step: string, replace?: boolean, quiet?: boolean) => void;
/** Go back to `prev`: a real history.back() when that's where this entry came from. */
export type GoBack = (prev: string) => void;

/**
 * The screen named in the link, and functions to move.
 * `order` gives a screen's place in the flow, so moving to a later screen slides forward.
 */
export function useStep(order?: (step: string | null) => number): [string | null, Go, GoBack] {
  const step = useSyncExternalStore(subscribe, getStep, getServerStep);
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  });

  const move = useCallback((next: string, replace: boolean, dir: StepDir | null) => {
    const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    p.set("s", next);
    const url = `${window.location.pathname}${window.location.search}#${p.toString()}`;
    const from = shown;
    if (replace) {
      window.history.replaceState({ ...entry(), recountI: at, s: next } satisfies StepState, "", url);
    } else {
      at += 1;
      window.history.pushState({ recountI: at, s: next, prev: from } satisfies StepState, "", url);
    }
    show(next === from ? null : dir, next);
  }, []);

  const go = useCallback<Go>(
    (next, replace = false, quiet = false) => {
      const ord = orderRef.current;
      // A replace is the bill moving the patient on by itself (reading done, answer ready): always forward.
      const back = !replace && ord != null && ord(next) < ord(shown);
      move(next, replace, quiet ? null : back ? "back" : "forward");
    },
    [move],
  );

  const goBack = useCallback<GoBack>(
    (prev) => {
      const st = entry();
      // This entry was pushed from `prev`: step back through history, so the phone's
      // Back and Forward keep matching the screens. popstate does the slide.
      if (st.prev === prev && typeof st.recountI === "number" && st.recountI > 0) window.history.back();
      else move(prev, true, "back");
    },
    [move],
  );

  return [step, go, goBack];
}
