"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { useT } from "../i18n/I18nProvider";
import type { PlainKey } from "../i18n/strings";
import { KindBadge } from "./KindBadge";
import { type Kind, providerName } from "./kinds";
import "./how.css";

/** Every step from photo to letter, and who does it. */
const STEPS: { kind: Kind; n: number }[] = [
  { kind: "ai", n: 1 }, // read the photo
  { kind: "ai", n: 2 }, // second read of the charges column
  { kind: "you", n: 3 }, // confirm amounts that differ
  { kind: "rule", n: 4 }, // find the hospital and its price list
  { kind: "rule", n: 5 }, // check every line
  { kind: "rule", n: 6 }, // the hospital's own policy
  { kind: "you", n: 7 }, // three questions
  { kind: "rule", n: 8 }, // charity care decision
  { kind: "ai", n: 9 }, // draft letters
  { kind: "rule", n: 10 }, // check the drafts, fill in details
  { kind: "you", n: 11 }, // edit, approve, send yourself
];

export function HowScreen() {
  const { t } = useT();
  const k = (s: string) => s as PlainKey;
  const map = useQuery(api.pipeline.map);
  const TASKS = ["read", "column", "letters", "chat"] as const;
  return (
    <article className="how">
      <p className="eyebrow">{t("how.eyebrow")}</p>
      <h1 className="how-h1">{t("how.h1")}</h1>
      <p className="how-lede">{t("how.lede")}</p>

      <ul className="how-legend" aria-label={t("how.legendLabel")}>
        {(["rule", "ai", "you"] as Kind[]).map((kind) => (
          <li key={kind}>
            <KindBadge kind={kind} />
            <span>{t(k(`how.legend.${kind}`))}</span>
          </li>
        ))}
      </ul>

      <ol className="how-steps">
        {STEPS.map((s) => (
          <li key={s.n} className={`how-step how-step-${s.kind}`}>
            <span className="how-step-n" aria-hidden="true">
              {s.n}
            </span>
            <div className="how-step-body">
              <div className="how-step-top">
                <h2 className="how-step-h">{t(k(`how.s${s.n}.h`))}</h2>
                <KindBadge kind={s.kind} />
              </div>
              <p>{t(k(`how.s${s.n}.p`))}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="how-limits" aria-labelledby="how-limits-h">
        <h2 id="how-limits-h">{t("how.limitsH")}</h2>
        <div className="how-limit-cols">
          <div className="how-limit-col">
            <h3>{t("how.mayH")}</h3>
            <ul>
              {[1, 2, 3, 4].map((i) => (
                <li key={i}>{t(k(`how.may${i}`))}</li>
              ))}
            </ul>
          </div>
          <div className="how-limit-col how-limit-no">
            <h3>{t("how.mayNotH")}</h3>
            <ul>
              {[1, 2, 3, 4, 5].map((i) => (
                <li key={i}>{t(k(`how.mayNot${i}`))}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {map && (
        <section className="how-models" aria-labelledby="how-models-h">
          <h2 id="how-models-h">{t("how.modelsH")}</h2>
          <p>{t("how.modelsLede")}</p>
          <ul className="how-model-list">
            {TASKS.map((task) => {
              const m = (map.models as Record<string, { primary: { provider: string; model: string }; fallback: { provider: string; model: string } | null }>)[task];
              if (!m) return null;
              return (
                <li key={task}>
                  <b>{t(k(`who.task.${task}`))}</b>
                  <span>
                    <code>{m.primary.model}</code> · {providerName(m.primary.provider)}
                    {m.fallback && (
                      <span className="how-model-backup">
                        {t("how.backup")} <code>{m.fallback.model}</code> · {providerName(m.fallback.provider)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="how-why" aria-labelledby="how-why-h">
        <h2 id="how-why-h">{t("how.whyH")}</h2>
        <ul>
          <li>{t("how.why1")}</li>
          <li>{t("how.why2")}</li>
          <li>{t("how.why3")}</li>
          <li>{t("how.why4")}</li>
        </ul>
      </section>

      <div className="how-end">
        <Link href="/" className="rc-btn rc-btn--block">
          {t("how.cta")}
        </Link>
        <Link href="/privacy" className="how-link">
          {t("how.privacyLink")}
        </Link>
      </div>
    </article>
  );
}
