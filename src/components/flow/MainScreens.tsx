"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Answer } from "../Answer";
import { BillTools } from "../BillTools";
import { plainError } from "../CaseScreen";
import { HospitalConfirm } from "../HospitalConfirm";
import { useT } from "../i18n/I18nProvider";
import { PolicyAside } from "../PolicyAside";
import { Sources } from "../Sources";
import { StepLog } from "../StepLog";
import { money } from "../types";
import { StepFrame } from "./StepFrame";
import { phaseOf } from "./steps";
import type { ScreenProps } from "./types";
import "./links.css";
import "../more.css";

/** Read "28k", "$28,000", "28000" or "1.2m" as whole dollars. */
export function parseDollars(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/[$,\s]/g, "");
  const m = t.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// ---------- 1. Reading ----------

export function ReadingStep({ c, go }: ScreenProps) {
  const { t } = useT();
  if (c.status === "error") {
    const pdf = c.fileType === "application/pdf";
    const raw = c.error ?? "";
    const notBill = /NOT_A_BILL|not a hospital|not a medical/i.test(raw);
    const code = raw.match(/\b(RETAKE|OUT_OF_STATE|NOT_A_BILL):\s*/)?.[1];
    // The backend writes these messages in the case's language: show them as they are.
    const said = code ? raw.slice(raw.indexOf(code) + code.length + 1).trim() : null;
    return (
      <StepFrame phase={1} title={code === "RETAKE" ? t("flow.retakeH") : code === "OUT_OF_STATE" ? t("flow.outOfStateH") : notBill ? t("flow.notBillH") : t("case.cantRead", { pdf })} primary={{ label: code === "RETAKE" ? t("flow.retake") : t("case.tryAgain"), href: "/" }} secondary={c.token ? { label: t("case.delete"), onClick: () => go("more") } : undefined}>
        <p>{said || (notBill ? t("flow.notBillBody") : plainError(t, c.error, pdf))}</p>
        {!code && !notBill && (
          <details className="log-details">
            <summary>{t("case.details")}</summary>
            <StepLog steps={c.steps.map((s) => (s.state === "running" ? { ...s, state: "error" as const } : s))} />
          </details>
        )}
      </StepFrame>
    );
  }
  return (
    <StepFrame phase={1} eyebrow={t("case.eyebrow")} title={t("case.reading")}>
      <p className="quiet">{t("progress.now1")}</p>
      {c.fileUrl && c.fileType?.startsWith("image/") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.fileUrl} alt={t("case.photoAlt")} className="bill-thumb" />
      )}
      <StepLog steps={c.steps} live />
    </StepFrame>
  );
}

// ---------- 1b. Which hospital ----------

export function HospitalStep({ c }: ScreenProps) {
  return (
    <StepFrame phase={1}>
      <HospitalConfirm c={c} />
    </StepFrame>
  );
}

// ---------- 2. Three questions, one per screen ----------

interface Draft {
  size: number;
  income: string;
  insured: boolean | null;
  oop: string;
}

function useDraft(id: string, prior: ScreenProps["c"]["household"]): [Draft, (d: Partial<Draft>) => void] {
  const key = `recount.draft.${id}`;
  const [d, setD] = useState<Draft>(() => {
    const base: Draft = prior
      ? { size: prior.size, income: String(prior.annualIncome), insured: prior.insured, oop: prior.outOfPocket12mo != null ? String(prior.outOfPocket12mo) : "" }
      : { size: 1, income: "", insured: null, oop: "" };
    try {
      const saved = typeof window !== "undefined" ? window.sessionStorage.getItem(key) : null;
      return saved ? { ...base, ...(JSON.parse(saved) as Partial<Draft>) } : base;
    } catch {
      return base;
    }
  });
  const update = (p: Partial<Draft>) =>
    setD((old) => {
      const n = { ...old, ...p };
      try {
        window.sessionStorage.setItem(key, JSON.stringify(n));
      } catch {}
      return n;
    });
  return [d, update];
}

export function QuestionStep({ c, n, next, back }: ScreenProps & { n: 1 | 2 | 3 }) {
  const { t, lang } = useT();
  const submit = useMutation(api.cases.submitHousehold);
  const [d, set] = useDraft(c._id, c.household);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (n === 2) inputRef.current?.focus();
  }, [n]);

  const income = parseDollars(d.income);
  const oop = parseDollars(d.oop);
  const title = n === 1 ? t("hh.q1") : n === 2 ? t("hh.q2") : t("hh.q3");

  async function finish() {
    if (income == null || d.insured === null || (d.insured && oop == null)) return;
    setBusy(true);
    setFailed(false);
    try {
      await submit({
        id: c._id as Id<"cases">,
        token: c.token,
        size: d.size,
        annualIncome: income,
        insured: d.insured,
        outOfPocket12mo: d.insured ? oop! : undefined,
      });
      try {
        window.sessionStorage.removeItem(`recount.draft.${c._id}`);
      } catch {}
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  const q3Ready = d.insured !== null && (!d.insured || oop != null);
  const primary =
    n === 1
      ? { label: t("flow.next"), onClick: next }
      : n === 2
        ? { label: t("flow.next"), onClick: next, disabled: income == null, hint: d.income.trim() ? t("hh.typeIncome") : null }
        : {
            label: busy ? t("hh.checking") : t("hh.submit"),
            onClick: finish,
            disabled: !q3Ready || income == null,
            busy,
            hint: income == null ? t("flow.goBackIncome") : d.insured === null ? t("hh.missing", { list: t("hh.answerIns") }) : null,
          };

  return (
    <StepFrame phase={2} eyebrow={t("flow.qOf", { n })} title={title} primary={primary} onBack={back}>
      {n === 1 && (
        <>
          <p className="quiet">{t("hh.q1help")}</p>
          <div className="stepper stepper-big">
            <button type="button" onClick={() => set({ size: Math.max(1, d.size - 1) })} aria-label={t("hh.fewer")} disabled={d.size <= 1}>
              −
            </button>
            <output aria-live="polite">{t("hh.people", { n: d.size })}</output>
            <button type="button" onClick={() => set({ size: Math.min(20, d.size + 1) })} aria-label={t("hh.more")}>
              +
            </button>
          </div>
        </>
      )}
      {n === 2 && (
        <>
          <p className="quiet">{t("hh.q2help")}</p>
          <label className="visually-hidden" htmlFor="income">
            {t("hh.q2")}
          </label>
          <div className="money-input money-input-big">
            <span aria-hidden>$</span>
            <input
              ref={inputRef}
              id="income"
              inputMode="decimal"
              autoComplete="off"
              placeholder={t("hh.incomeEg")}
              value={d.income}
              onChange={(e) => set({ income: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && income != null && next()}
            />
          </div>
          {d.income.trim() !== "" && (
            <p className={`q-check ${income == null ? "q-check-bad" : ""}`} aria-live="polite">
              {income == null
                ? t("hh.typeIncome")
                : income < 2000
                  ? t("hh.smallIncome", { amount: money(income, false, lang), n: income })
                  : t("hh.perYear", { amount: money(income, false, lang) })}
            </p>
          )}
        </>
      )}
      {n === 3 && (
        <>
          <div className="choice choice-big">
            <button type="button" aria-pressed={d.insured === false} onClick={() => set({ insured: false })}>
              {t("hh.no")}
            </button>
            <button type="button" aria-pressed={d.insured === true} onClick={() => set({ insured: true })}>
              {t("hh.yes")}
            </button>
          </div>
          {d.insured && (
            <div className="q-sub">
              <label className="q-label-sm" htmlFor="oop">
                {t("hh.oopLabel")}
              </label>
              <div className="money-input money-input-big">
                <span aria-hidden>$</span>
                <input id="oop" inputMode="decimal" autoComplete="off" placeholder={t("hh.oopEg")} value={d.oop} onChange={(e) => set({ oop: e.target.value })} />
              </div>
              {d.oop.trim() !== "" && (
                <p className={`q-check ${oop == null ? "q-check-bad" : ""}`}>{oop == null ? t("hh.typeOop") : money(oop, false, lang)}</p>
              )}
            </div>
          )}
          {failed && (
            <p className="error-note" role="alert">
              {t("hh.failed")}
            </p>
          )}
        </>
      )}
    </StepFrame>
  );
}

// ---------- 3. The answer ----------

export function AnswerStep({ c, back, go }: ScreenProps) {
  const { t } = useT();
  const writing = c.status === "drafting" || !(c.letters ?? []).length;
  return (
    <StepFrame
      phase={phaseOf("answer")}
      primary={
        c.status === "approved"
          ? { label: t("flow.toSend"), onClick: () => go("send") }
          : { label: writing ? t("flow.seeLettersWait") : t("flow.seeLetters"), onClick: () => go(writing ? "letters-wait" : "details") }
      }
      secondary={{ label: t("flow.whatWeFound"), onClick: () => go("found") }}
      onBack={c.status === "approved" ? () => go("send") : back}
    >
      <Answer c={c} />
      <PolicyAside
        findings={c.policyFindings ?? []}
        hospitalName={c.hospital?.name ?? c.bill?.hospitalName ?? null}
        hospitalKey={c.hospitalKey ?? c.hospital?.key ?? null}
        inLetter={Boolean(c.letters?.length)}
      />
      <div className="step-links">
        {(c.status === "drafting" || c.status === "ready") && (
          <button className="link-btn" onClick={() => go("q1")}>
            {t("flow.changeAnswers")}
          </button>
        )}
        <button className="link-btn" onClick={() => go("more")}>
          {t("flow.moreLink")}
        </button>
      </div>
      <p className="quiet small-print">{t("footer")}</p>
    </StepFrame>
  );
}

// ---------- More: sources, share, delete, log ----------

export function MoreStep({ c, back }: ScreenProps) {
  const { t } = useT();
  const phase = c.status === "approved" ? 4 : c.status === "error" || c.status === "reading" ? 1 : phaseOf("more");
  return (
    <StepFrame phase={phase} title={t("flow.moreH")} onBack={back}>
      <div className="more">
        <Sources c={c} />
        {c.token && <BillTools id={c._id} token={c.token} />}
        <section className="more-sec" aria-labelledby="log-h">
          <h2 id="log-h" className="more-h">
            {t("case.log")}
          </h2>
          <details className="more-log">
            <summary>{t("more.showLog")}</summary>
            <StepLog steps={c.steps} />
          </details>
        </section>
        <section className="more-sec">
          <p className="more-note">{t("footer")}</p>
          <Link href="/bills" className="more-link">
            {t("bills.title")}
          </Link>
        </section>
      </div>
    </StepFrame>
  );
}
