"use client";

import { useT } from "../i18n/I18nProvider";
import type { PlainKey } from "../i18n/strings";
import type { CaseView } from "../types";
import { KindBadge } from "./KindBadge";
import { type AgentRun, kindOf, providerName } from "./kinds";
import "./how.css";

/** On each bill: how many steps were rules, every AI call with its model, and what was left to the patient. */
export function WhoDidWhat({ c }: { c: CaseView }) {
  const { t, lang } = useT();
  const runs = ((c as CaseView & { agentRuns?: AgentRun[] }).agentRuns ?? []).slice().sort((a, b) => a.at - b.at);
  const ruleSteps = c.steps.filter((s) => kindOf(s) === "rule").length;
  if (!runs.length && !ruleSteps) return null;
  const secs = (ms: number) => new Intl.NumberFormat(lang === "es" ? "es-US" : "en-US", { maximumFractionDigits: 1 }).format(ms / 1000);

  return (
    <section className="more-sec who" aria-labelledby="who-h">
      <h2 id="who-h" className="more-h">
        {t("who.h")}
      </h2>
      <ul className="who-sum">
        <li>
          <KindBadge kind="rule" /> {t("who.rules", { n: ruleSteps })}
        </li>
        <li>
          <KindBadge kind="ai" /> {t("who.ai", { n: runs.length })}
        </li>
        <li>
          <KindBadge kind="you" /> {t("who.you")}
        </li>
      </ul>
      {runs.length > 0 && (
        <ol className="who-runs">
          {runs.map((r, i) => (
            <li key={`${r.at}-${i}`} className={r.ok ? "who-run" : "who-run who-run-bad"}>
              <span className="who-task">{t(`who.task.${r.task}` as PlainKey)}</span>
              <span className="who-model">
                {r.model} · {providerName(r.provider)}
              </span>
              <span className="who-meta">
                {t("who.secs", { s: secs(r.ms) })}
                {r.fallbackUsed && <span className="who-flag">{t("who.backup")}</span>}
                {!r.ok && <span className="who-flag who-flag-bad">{t("who.failed")}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="more-body">
        <a href="/how">{t("who.howLink")}</a>
      </p>
    </section>
  );
}
