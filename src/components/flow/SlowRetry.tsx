"use client";

// "Taking too long? Try again" for a bill stuck reading or writing letters (see cases.retry).
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useT } from "../i18n/I18nProvider";
import type { CaseView } from "../types";
import type { Action } from "./StepFrame";

const SLOW_MS = 3 * 60_000;

/** When the current reading or writing started: statusAt, else the bill's start (reading) or its newest step. */
function busySince(c: CaseView): number | null {
  if (c.statusAt) return c.statusAt;
  if (c.status === "reading" && c.createdAt) return c.createdAt;
  const ats = c.steps.map((s) => s.at ?? 0).filter((a) => a > 0);
  return ats.length ? Math.max(...ats) : null;
}

/** The retry button once the bill has been busy for SLOW_MS, and whether the last try failed. */
export function useSlowRetry(c: CaseView): { action: Action | undefined; failed: boolean } {
  const { t } = useT();
  const retry = useMutation(api.cases.retry);
  const busy = c.status === "reading" || c.status === "drafting";
  const since = busySince(c);
  const [now, setNow] = useState(() => Date.now());
  // The start we already asked to retry: the button hides until the bill starts again.
  const [sentFor, setSentFor] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, [busy]);
  const slow = busy && since != null && now - since > SLOW_MS && sentFor !== since;
  const action: Action | undefined = slow
    ? {
        label: t("flow.slowRetry"),
        onClick: async () => {
          setSentFor(since);
          setFailed(false);
          try {
            await retry({ id: c._id as Id<"cases">, token: c.token });
          } catch {
            setFailed(true);
            setSentFor(null);
          }
        },
      }
    : undefined;
  return { action, failed };
}
