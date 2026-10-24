"use client";

// After sign-in, the bills saved on this phone are attached to the account (cases.claim).
// AccountSync runs it once per bill while signed in; the count is kept for a short "We added N bills" note.
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMyBills } from "../bills/myBills";

let added = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** How many bills from this phone were just added to the account (0 when there's nothing to say). */
export function useClaimedCount() {
  return useSyncExternalStore(
    subscribe,
    () => added,
    () => 0,
  );
}

export function clearClaimed() {
  if (!added) return;
  added = 0;
  emit();
}

const validId = (id: string) => /^[0-9a-z]{25,40}$/.test(id);

export function AccountSync() {
  const { isAuthenticated } = useConvexAuth();
  const claim = useMutation(api.cases.claim);
  const bills = useMyBills();
  const tried = useRef(new Set<string>());

  useEffect(() => {
    if (!isAuthenticated) {
      tried.current.clear();
      return;
    }
    const items = bills
      .filter((b) => b.token && validId(b.id) && !tried.current.has(b.id))
      .map((b) => ({ id: b.id as Id<"cases">, token: b.token! }));
    if (!items.length) return;
    items.forEach((i) => tried.current.add(i.id));
    const note = (n: number) => {
      if (n > 0) {
        added += n;
        emit();
      }
    };
    claim({ items })
      .then(note)
      .catch(async () => {
        // One bad id (say, from another deployment) fails the whole batch: try them one by one.
        for (const it of items) {
          try {
            note(await claim({ items: [it] }));
          } catch {
            // That bill can't be attached; it stays on this phone as before.
          }
        }
      });
  }, [isAuthenticated, bills, claim]);

  return null;
}
