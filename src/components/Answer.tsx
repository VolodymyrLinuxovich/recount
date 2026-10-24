import { useT } from "./i18n/I18nProvider";
import { PenUnderline } from "./Pen";
import { locale } from "./i18n/strings";
import { type CaseView, hostOf, money, questionableTotal } from "./types";

export function Answer({ c }: { c: CaseView }) {
  const { t, lang } = useT();
  const e = c.eligibility!;
  const due = c.bill?.amountDue ?? null;
  const questionable = questionableTotal(c.findings ?? []);

  let big: React.ReactNode = e.headline;
  if (e.tier === "FREE") big = <>{t("answer.freeLead")} <span className="answer-amt">$0<PenUnderline delay={200} /></span></>;
  else if (e.tier === "DISCOUNT") big = t("answer.discount");
  else if (e.tier === "NOT_ELIGIBLE" && e.owedEstimate != null && questionable > 0)
    big = <>{t("answer.askOffLead")} <span className="answer-amt">{money(questionable, false, lang)}</span></>;

  return (
    <section className="answer" aria-labelledby="answer-h">
      <p className="eyebrow">{t("answer.eyebrow")}</p>
      <h1 id="answer-h" className="h-answer">
        {big}
      </h1>
      <p className="answer-sub">
        {e.tier === "FREE" && due != null && due > 0 && t("answer.billSays", { amount: money(due, true, lang) })}
        {e.tier === "FREE" && t("answer.freeSub")}
        {e.tier === "DISCOUNT" && t("answer.discountSub")}
        {e.tier === "NOT_ELIGIBLE" && e.headline + "."}
        {e.tier !== "FREE" && questionable > 0 && e.tier !== "NOT_ELIGIBLE" && (
          t("answer.alsoMarked", { amount: money(questionable, false, lang) })
        )}
      </p>

      <div className="receipts">
        <h2 className="receipts-h">{t("answer.why")}</h2>
        <ol>
          {e.basis.map((b, i) => (
            <li key={i} className="receipt">
              <div className="receipt-rule">{b.rule}</div>
              <p>{b.text}</p>
              {b.source && (
                <a href={b.source} target="_blank" rel="noreferrer" className="src">
                  {hostOf(b.source)}
                </a>
              )}
            </li>
          ))}
        </ol>
      </div>

      {e.medicalLikely && (
        <p className="aside">
          <strong>{t("answer.mediStrong")}</strong> {t("answer.mediBody", { pct: e.fplPct.toLocaleString(locale(lang)) })}{" "}
          <a href="https://www.coveredca.com/" target="_blank" rel="noreferrer">
            coveredca.com
          </a>{" "}
          {t("answer.mediTail")}
        </p>
      )}
    </section>
  );
}
