"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import type { Details } from "../letterFill";
import { fromServer, toServer } from "./profileFields";

/**
 * The signed-in person's saved details in the letter's shape (only the fields they filled in).
 * null when signed out or nothing is saved; undefined while loading.
 */
export function useAccountProfile() {
  const { isAuthenticated } = useConvexAuth();
  const raw = useQuery(api.profile.get, isAuthenticated ? {} : "skip");
  const set = useMutation(api.profile.set);
  const profile = useMemo((): Partial<Details> | null | undefined => {
    if (!isAuthenticated) return null;
    if (raw === undefined) return undefined;
    const d = fromServer(raw);
    const out = Object.fromEntries(Object.entries(d).filter(([, v]) => v.trim())) as Partial<Details>;
    return Object.keys(out).length ? out : null;
  }, [isAuthenticated, raw]);
  /** Save to the account. A typo the server refuses just isn't saved; the letter keeps what was typed. */
  const save = (d: Details) => set(toServer(d)).catch(() => {});
  return { signedIn: isAuthenticated, profile, save };
}
