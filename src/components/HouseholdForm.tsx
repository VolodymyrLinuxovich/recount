"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useT } from "./i18n/I18nProvider";
import { joinList, type PlainKey } from "./i18n/strings";
import { type CaseView, money } from "./types";
import "./letters.css";

/** Read "28k", "$28,000", "28000" or "1.2m" as dollars. Anything else is not a number. */
const toNumber = (s: string) => {
  const t = s.trim().toLowerCase().replace(/[$,\s]/g, "");
  const m = t.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
};

export function HouseholdForm({
  id,
  token,
  prior,
  needsOutOfPocket,
}: {
  id: string;
  token?: string;
  prior?: CaseView["household"];
  needsOutOfPocket?: boolean;
}) {
  const { t, lang } = useT();
  const dollars = (n: number) => money(n, false, lang);
  const submit = useMutation(api.cases.submitHousehold);
  const [size, setSize] = useState(prior?.size ?? 1);
  const [income, setIncome] = useState(prior ? String(prior.annualIncome) : "");
  const [insured, setInsured] = useState<boolean | null>(prior ? prior.insured : null);
  const [oop, setOop] = useState(prior?.outOfPocket12mo != null ? String(prior.outOfPocket12mo) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlainKey | null>(null);

  const incomeN = toNumber(income);
  const oopN = toNumber(oop);
  const ready = incomeN != null && insured !== null && (!insured || oopN != null);
  const missing = (
    [
      incomeN == null && (income.trim() ? "hh.checkIncome" : "hh.addIncome"),
      insured === null && "hh.answerIns",
      insured && oopN == null && (oop.trim() ? "hh.checkOop" : "hh.addOop"),
    ].filter(Boolean) as PlainKey[]
  ).map((k) => t(k));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await submit({
        id: id as Id<"cases">,
        token,
        size,
        annualIncome: incomeN!,
        insured: insured!,
        outOfPocket12mo: insured ? oopN! : undefined,
      });
    } catch {
      setError("hh.failed");
      setBusy(false);
    }
  }

  return (
    <form className="questions" onSubmit={onSubmit} aria-labelledby="q-h">
      <h2 id="q-h" className="h-section">
        {t("hh.h")}
      </h2>
      <p className="lede">{t("hh.lede")}</p>
      {needsOutOfPocket && <p className="error-note">{t("hh.needOop")}</p>}

      <fieldset className="q">
        <legend className="q-label">
          <span className="q-n">1</span> {t("hh.q1")}
        </legend>
        <p className="q-help">{t("hh.q1help")}</p>
        <div className="stepper">
          <button type="button" onClick={() => setSize((s) => Math.max(1, s - 1))} aria-label={t("hh.fewer")} disabled={size <= 1}>
            −
          </button>
          <output aria-live="polite">
            {t("hh.people", { n: size })}
          </output>
          <button type="button" onClick={() => setSize((s) => Math.min(20, s + 1))} aria-label={t("hh.more")}>
            +
          </button>
        </div>
      </fieldset>

      <div className="q">
        <label className="q-label" htmlFor="income">
          <span className="q-n">2</span> {t("hh.q2")}
        </label>
        <p className="q-help">{t("hh.q2help")}</p>
        <div className="money-input">
          <span aria-hidden>$</span>
          <input
            id="income"
            inputMode="text"
            autoComplete="off"
            className="hint-placeholder"
            placeholder={t("hh.incomeEg")}
            value={income}
            onChange={(e) => setIncome(e.target.value)}
          />
        </div>
        {income.trim() !== "" && (
          <p className={`q-check ${incomeN == null ? "q-check-bad" : ""}`} aria-live="polite">
            {incomeN == null
              ? t("hh.typeIncome")
              : incomeN < 2000
                ? t("hh.smallIncome", { amount: dollars(incomeN), n: incomeN })
                : t("hh.perYear", { amount: dollars(incomeN) })}
          </p>
        )}
      </div>

      <fieldset className="q">
        <legend className="q-label">
          <span className="q-n">3</span> {t("hh.q3")}
        </legend>
        <div className="choice">
          <button type="button" aria-pressed={insured === false} onClick={() => setInsured(false)}>
            {t("hh.no")}
          </button>
          <button type="button" aria-pressed={insured === true} onClick={() => setInsured(true)}>
            {t("hh.yes")}
          </button>
        </div>
        {insured && (
          <div className="q-sub">
            <label className="q-label-sm" htmlFor="oop">
              {t("hh.oopLabel")}
            </label>
            <div className="money-input">
              <span aria-hidden>$</span>
              <input id="oop" className="hint-placeholder" inputMode="numeric" autoComplete="off" placeholder={t("hh.oopEg")} value={oop} onChange={(e) => setOop(e.target.value)} />
            </div>
            {oop.trim() !== "" && (
              <p className={`q-check ${oopN == null ? "q-check-bad" : ""}`} aria-live="polite">
                {oopN == null ? t("hh.typeOop") : dollars(oopN)}
              </p>
            )}
          </div>
        )}
      </fieldset>

      <button className="btn btn-primary btn-big" type="submit" disabled={!ready || busy}>
        {busy ? t("hh.checking") : t("hh.submit")}
      </button>
      {!ready && missing.length > 0 && <p className="q-missing">{t("hh.missing", { list: joinList(lang, missing) })}</p>}
      {error && (
        <p className="error-note" role="alert">
          {t(error)}
        </p>
      )}
    </form>
  );
}
