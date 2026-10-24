"use client";

// Whether the helper panel is open, shared by every trigger (masthead button, desktop pill)
// and the panel itself. `trigger` remembers which button opened it, so focus can go back there.

import { useSyncExternalStore } from "react";

let open = false;
let trigger: HTMLElement | null = null;
const listeners = new Set<() => void>();

export function setHelperOpen(next: boolean, from?: HTMLElement | null) {
  if (next && from) trigger = from;
  if (open === next) return;
  open = next;
  listeners.forEach((l) => l());
}

/** The button that last opened the panel, if it is still on the page and visible. */
export function lastTrigger(): HTMLElement | null {
  return trigger && trigger.isConnected && trigger.offsetParent !== null ? trigger : null;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useHelperOpen() {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}
