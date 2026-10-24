"use client";

import { useT } from "./i18n/I18nProvider";
import type { Status } from "./types";

const STEP_OF: Record<Status, 1 | 2 | 3 | 4> = {
  reading: 1,
  error: 1,
  needs_household: 2,
  drafting: 3,
  ready: 3,
  approved: 4,
};

/** Where the patient is in the four steps, in plain words. */
export function Progress({ status }: { status: Status }) {
  const { t } = useT();
  const now = STEP_OF[status];
  const steps = [1, 2, 3, 4] as const;
  return (
    <nav className="progress" aria-label={t("progress.label")}>
      <p className="progress-of">{t("progress.of", { n: now, total: 4 })}</p>
      <ol className="progress-steps">
        {steps.map((n) => (
          <li key={n} className={n < now ? "done" : n === now ? "now" : ""} aria-current={n === now ? "step" : undefined}>
            <span className="progress-dot" aria-hidden>
              {n < now ? "✓" : n}
            </span>
            <span className="progress-name">{t(`progress.${n}`)}</span>
          </li>
        ))}
      </ol>
      <p className="progress-now">{t(`progress.now${now}`)}</p>
    </nav>
  );
}
