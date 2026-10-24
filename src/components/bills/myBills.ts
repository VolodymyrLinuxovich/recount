"use client";

// Bills remembered on this device only. No accounts: the list lives in localStorage.
import { useEffect, useSyncExternalStore } from "react";

export interface SavedBill {
  id: string;
  addedAt: number;
}

const KEY = "recount.bills";
const CAP = 50;
const LOCAL_EVENT = "recount-bills-change";
const EMPTY: SavedBill[] = [];

let cacheRaw: string | null | undefined;
let cacheList: SavedBill[] = EMPTY;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): SavedBill[] {
  if (!raw) return EMPTY;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return EMPTY;
    const seen = new Set<string>();
    const out: SavedBill[] = [];
    for (const x of data) {
      if (!x || typeof x !== "object") continue;
      const { id, addedAt } = x as Partial<SavedBill>;
      if (typeof id !== "string" || !id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, addedAt: typeof addedAt === "number" ? addedAt : 0 });
    }
    return out.slice(0, CAP);
  } catch {
    return EMPTY;
  }
}

/** Newest first. Returns the same array while storage is unchanged (safe for useSyncExternalStore). */
export function listCases(): SavedBill[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = readRaw();
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cacheList = parse(raw);
  }
  return cacheList;
}

function write(list: SavedBill[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, CAP)));
  } catch {
    // Storage full or blocked: the app still works, the list just isn't saved.
  }
  try {
    window.dispatchEvent(new Event(LOCAL_EVENT));
  } catch {}
}

export function rememberCase(id: string) {
  if (typeof window === "undefined" || !id) return;
  const list = listCases();
  if (list[0]?.id === id) return;
  write([{ id, addedAt: Date.now() }, ...list.filter((b) => b.id !== id)]);
}

export function forgetCase(id: string) {
  if (typeof window === "undefined") return;
  write(listCases().filter((b) => b.id !== id));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(LOCAL_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LOCAL_EVENT, onChange);
  };
}

/** The bills saved on this device. Empty during server render and the first client render. */
export function useMyBills(): SavedBill[] {
  return useSyncExternalStore(subscribe, listCases, () => EMPTY);
}

/** Remember a case once it has loaded (found is true). Adding an opened link keeps its original order if already saved. */
export function useRememberCase(id: string | undefined, found: unknown) {
  const ok = !!found;
  useEffect(() => {
    if (ok && id && !listCases().some((b) => b.id === id)) rememberCase(id);
  }, [ok, id]);
}

const noop = () => () => {};

/** False on the server and during hydration, true after; avoids flashing the empty state. */
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
