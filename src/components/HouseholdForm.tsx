"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { CaseView } from "./types";

/** Read "28k", "$28,000", "28000" or "1.2m" as dollars. Anything else is not a number. */
const toNumber = (s: string) => {
  const t = s.trim().toLowerCase().replace(/[$,\s]/g, "");
  const m = t.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const dollars = (n: number) => `$${n.toLocaleString("en-US")}`;

export function HouseholdForm({
  id,
  prior,
  needsOutOfPocket,
}: {
  id: string;
  prior?: CaseView["household"];
  needsOutOfPocket?: boolean;
}) {
  const submit = useMutation(api.cases.submitHousehold);
  const [size, setSize] = useState(prior?.size ?? 1);
  const [income, setIncome] = useState(prior ? String(prior.annualIncome) : "");
  const [insured, setInsured] = useState<boolean | null>(prior ? prior.insured : null);
  const [oop, setOop] = useState(prior?.outOfPocket12mo != null ? String(prior.outOfPocket12mo) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const incomeN = toNumber(income);
  const oopN = toNumber(oop);
  const ready = incomeN != null && insured !== null && (!insured || oopN != null);
  const missing = [
    incomeN == null && (income.trim() ? "check the income amount" : "add your yearly income"),
    insured === null && "answer the insurance question",
    insured && oopN == null && (oop.trim() ? "check the out-of-pocket amount" : "add your out-of-pocket costs"),
  ].filter(Boolean) as string[];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await submit({
        id: id as Id<"cases">,
        size,
        annualIncome: incomeN!,
        insured: insured!,
        outOfPocket12mo: insured ? oopN! : undefined,
      });
    } catch {
      setError("That didn't go through. Check the numbers and try again.");
      setBusy(false);
    }
  }

  return (
    <form className="questions" onSubmit={onSubmit} aria-labelledby="q-h">
      <h2 id="q-h" className="h-section">
        Three questions
      </h2>
      <p className="lede">
        California hospitals have to give free or discounted care based on household size and income. Your answers stay
        with this bill.
      </p>
      {needsOutOfPocket && <p className="error-note">We need one more number: your out-of-pocket costs at this hospital.</p>}

      <fieldset className="q">
        <legend className="q-label">
          <span className="q-n">1</span> How many people are in your household?
        </legend>
        <p className="q-help">You, plus anyone you support or file taxes with.</p>
        <div className="stepper">
          <button type="button" onClick={() => setSize((s) => Math.max(1, s - 1))} aria-label="One fewer person" disabled={size <= 1}>
            −
          </button>
          <output aria-live="polite">
            {size} {size === 1 ? "person" : "people"}
          </output>
          <button type="button" onClick={() => setSize((s) => Math.min(20, s + 1))} aria-label="One more person">
            +
          </button>
        </div>
      </fieldset>

      <div className="q">
        <label className="q-label" htmlFor="income">
          <span className="q-n">2</span> About how much does your household make in a year?
        </label>
        <p className="q-help">Before taxes. A rough number is fine.</p>
        <div className="money-input">
          <span aria-hidden>$</span>
          <input
            id="income"
            inputMode="text"
            autoComplete="off"
            placeholder="32,000"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
          />
        </div>
        {income.trim() !== "" && (
          <p className={`q-check ${incomeN == null ? "q-check-bad" : ""}`} aria-live="polite">
            {incomeN == null
              ? "Type a number, like 32000 or 32k."
              : incomeN < 2000
                ? `That's ${dollars(incomeN)} a year. If you meant thousands, type ${incomeN}k.`
                : `${dollars(incomeN)} a year`}
          </p>
        )}
      </div>

      <fieldset className="q">
        <legend className="q-label">
          <span className="q-n">3</span> Did you have health insurance for this visit?
        </legend>
        <div className="choice">
          <button type="button" aria-pressed={insured === false} onClick={() => setInsured(false)}>
            No
          </button>
          <button type="button" aria-pressed={insured === true} onClick={() => setInsured(true)}>
            Yes
          </button>
        </div>
        {insured && (
          <div className="q-sub">
            <label className="q-label-sm" htmlFor="oop">
              How much have you paid or been billed at this hospital in the last 12 months, after insurance? Include this
              bill.
            </label>
            <div className="money-input">
              <span aria-hidden>$</span>
              <input id="oop" inputMode="numeric" autoComplete="off" placeholder="4,500" value={oop} onChange={(e) => setOop(e.target.value)} />
            </div>
            {oop.trim() !== "" && (
              <p className={`q-check ${oopN == null ? "q-check-bad" : ""}`} aria-live="polite">
                {oopN == null ? "Type a number, like 4500 or 4.5k." : dollars(oopN)}
              </p>
            )}
          </div>
        )}
      </fieldset>

      <button className="btn btn-primary btn-big" type="submit" disabled={!ready || busy}>
        {busy ? "Checking the rules…" : "See my answer"}
      </button>
      {!ready && missing.length > 0 && <p className="q-missing">To continue, {missing.join(" and ")}.</p>}
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
