import { useT } from "./i18n/I18nProvider";
import { locale } from "./i18n/strings";
import { type CaseView, hostOf, money, questionableTotal } from "./types";

export function Answer({ c }: { c: CaseView }) {
  const { t, lang } = useT();
  const e = c.eligibility!;
  const due = c.bill?.amountDue ?? null;
  const questionable = questionableTotal(c.findings ?? []);

  const h = c.household;
  const insured = Boolean(h?.insured || c.bill?.insurancePayer);
  const marked = (c.findings ?? []).length > 0;

  let big: React.ReactNode = e.headline;
  if (e.tier === "FREE") big = <>{t("answer.freeLead")} <span className="answer-amt">$0</span></>;
  else if (e.tier === "DISCOUNT") big = t("answer.discount");
  else if (e.tier === "NOT_ELIGIBLE") big = t("answer.notEligible");

  // Why they don't qualify, in their own numbers, then what to do instead.
  let notEligibleWhy: string | null = null;
  if (e.tier === "NOT_ELIGIBLE" && h) {
    if (h.insured && h.outOfPocket12mo != null)
      notEligibleWhy = t("answer.oopUnder", { oop: money(h.outOfPocket12mo, false, lang), income: money(h.annualIncome, false, lang) });
    else if (!h.insured) notEligibleWhy = t("answer.incomeAbove", { income: money(h.annualIncome, false, lang), n: h.size });
  }

  return (
    <section className="answer" aria-labelledby="answer-h">
      <p className="eyebrow">{t("answer.eyebrow")}</p>
      <h1 id="answer-h" className="h-answer">
        {big}
      </h1>
      {e.tier === "NOT_ELIGIBLE" && <p className="answer-sub answer-sub-lead">{t("answer.notEligibleSub")}</p>}
      {e.tier === "NOT_ELIGIBLE" ? (
        <p className="answer-sub">
          {notEligibleWhy && <>{notEligibleWhy} </>}
          {marked ? t("answer.nextMarked") : t("answer.nextPlan")}
        </p>
      ) : (
        <p className="answer-sub">
          {e.tier === "FREE" && due != null && due > 0 && t("answer.billSays", { amount: money(due, true, lang) })}
          {e.tier === "FREE" && t("answer.freeSub")}
          {e.tier === "DISCOUNT" && t("answer.discountSub")}
          {e.tier === "DISCOUNT" && questionable > 0 && !insured && t("answer.alsoMarked", { amount: money(questionable, false, lang) })}
        </p>
      )}
      {e.tier === "DISCOUNT" && e.owedEstimate == null && <p className="answer-note">{t("answer.discountNoAmount")}</p>}

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
