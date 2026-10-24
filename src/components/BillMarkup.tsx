"use client";

import { useState } from "react";
import { useT } from "./i18n/I18nProvider";
import type { Lang, T } from "./i18n/strings";
import { PenCircle, PenStrike, PenUnderline } from "./Pen";
import { type CaseView, type Finding, hostOf, money, questionableTotal, shortDate } from "./types";

interface LineMark {
  n: number; // finding number shown in the margin
  finding: Finding;
  strike: boolean;
  note: string;
}

function noteFor(t: T, lang: Lang, f: Finding, lineIndex: number): { note: string; strike: boolean } | null {
  switch (f.kind) {
    case "DUPLICATE_LINE": {
      const [first, dup] = f.lines;
      if (lineIndex === dup) return { strike: true, note: t("bill.dupThis", { line: first + 1, amount: money(f.amount, false, lang) }) };
      return { strike: false, note: t("bill.dupOther", { line: dup + 1 }) };
    }
    case "ABOVE_LIST_PRICE":
      return { strike: false, note: t("bill.aboveList", { amount: money(f.amount, false, lang) }) };
    case "CASH_PRICE_GAP": {
      // Evidence labels arrive in the case's language ("Published cash price" / "...en efectivo").
      const cash = f.evidence.find((e) => /cash|efectivo|contado/i.test(e.label))?.value;
      return { strike: false, note: cash ? t("bill.cashIs", { cash }) : t("bill.askCash") };
    }
    default:
      return null;
  }
}

export function BillMarkup({ c, findings }: { c: CaseView; findings: Finding[] }) {
  const { t, lang } = useT();
  const bill = c.bill!;
  const [showPhoto, setShowPhoto] = useState(false);
  const numbered = findings.map((f, i) => ({ f, n: i + 1 }));

  const marks = new Map<number, LineMark[]>();
  for (const { f, n } of numbered) {
    for (const i of f.lines) {
      const m = noteFor(t, lang, f, i);
      if (!m) continue;
      marks.set(i, [...(marks.get(i) ?? []), { n, finding: f, ...m }]);
    }
  }
  const totalFinding = numbered.find((x) => x.f.kind === "TOTAL_MISMATCH");
  const summary = numbered.find((x) => x.f.kind === "NOT_ITEMIZED");
  const questionable = questionableTotal(findings);
  const isImage = c.fileUrl && (c.fileType?.startsWith("image/") ?? true);
  // Marks are drawn one after another, top to bottom.
  const flaggedOrder = [...marks.keys()].sort((a, b) => a - b);
  const delayFor = (i: number) => 300 + 350 * Math.max(0, flaggedOrder.indexOf(i));
  const totalDelay = 300 + 350 * flaggedOrder.length;

  return (
    <section className="bill-section" aria-labelledby="bill-h">
      <div className="section-head">
        <h2 id="bill-h" className="h-section">
          {t("bill.h")}
        </h2>
        <span className="label">{c.billSource === "claude" ? t("bill.srcClaude") : t("bill.srcSample")}</span>
      </div>

      {c.fileUrl && (
        <div className="photo-wrap">
          {isImage ? (
            <button className={`photo-btn ${showPhoto ? "open" : ""}`} onClick={() => setShowPhoto((s) => !s)} aria-expanded={showPhoto}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.fileUrl} alt={t("bill.photoAlt")} className="photo" />
              <span className="photo-toggle">{showPhoto ? t("bill.showLess") : c.sample ? t("bill.tapSample") : t("bill.tapPhoto")}</span>
            </button>
          ) : (
            <a href={c.fileUrl} target="_blank" rel="noreferrer" className="link">
              {t("bill.openFile")}
            </a>
          )}
          {findings.length > 0 && (
            <p className="hand-stamp" aria-hidden>
              {t("bill.stamp", { n: findings.length })}
              {questionable > 0 && t("bill.stampUpTo", { amount: money(questionable, false, lang) })}
            </p>
          )}
        </div>
      )}

      <div className="sheet">
        <div className="sheet-head">
          <div className="sheet-hospital">{bill.hospitalName ?? t("bill.noName")}</div>
          <dl className="sheet-meta">
            {bill.patientName && (
              <>
                <dt>{t("bill.patient")}</dt>
                <dd>{bill.patientName}</dd>
              </>
            )}
            {bill.accountNumber && (
              <>
                <dt>{t("bill.account")}</dt>
                <dd>{bill.accountNumber}</dd>
              </>
            )}
            {bill.serviceDate && (
              <>
                <dt>{t("bill.visit")}</dt>
                <dd>{shortDate(bill.serviceDate, lang)}</dd>
              </>
            )}
            {bill.statementDate && (
              <>
                <dt>{t("bill.statement")}</dt>
                <dd>{shortDate(bill.statementDate, lang)}</dd>
              </>
            )}
          </dl>
        </div>

        {summary && (
          <div className="sheet-summary">
            <span className="margin-n">{summary.n}</span>
            <span className="hand">{t("bill.summary")}</span>
          </div>
        )}

        <ol className="lines">
          {bill.lines.map((l, i) => {
            const m = marks.get(i) ?? [];
            const strike = m.some((x) => x.strike);
            const circle = m.some((x) => !x.strike && x.finding.kind !== "DUPLICATE_LINE");
            const d = delayFor(i);
            return (
              <li key={i} className={`line ${m.length ? "flagged" : ""}`}>
                <span className="line-no">{i + 1}</span>
                <div className="line-main">
                  <div className="line-top">
                    <span className="line-desc">{l.description}</span>
                    <span className="line-charge">
                      {money(l.charge, true, lang)}
                      {circle && <PenCircle delay={d} />}
                    </span>
                  </div>
                  <div className="line-codes">
                    {[
                      l.date && l.date !== bill.serviceDate && shortDate(l.date, lang),
                      l.code && t("bill.code", { code: l.code }),
                      l.revCode && t("bill.rev", { code: l.revCode }),
                      l.quantity !== 1 && t("bill.qty", { n: l.quantity }),
                    ]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </div>
                  {strike && <PenStrike delay={d} />}
                  {m.map((x) => (
                    <a key={x.finding.id + i} href={`#finding-${x.n}`} className="margin-note">
                      <span className="margin-n">{x.n}</span>
                      <span className="hand">{x.note}</span>
                    </a>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>

        <dl className="totals">
          {bill.totalCharges != null && (
            <div className={totalFinding ? "flagged" : ""}>
              <dt>{t("bill.total")}</dt>
              <dd>
                {money(bill.totalCharges, true, lang)}
                {totalFinding && <PenUnderline delay={totalDelay} />}
              </dd>
            </div>
          )}
          {bill.insurancePaid > 0 && (
            <div>
              <dt>{t("bill.insurancePaid")}</dt>
              <dd>−{money(bill.insurancePaid, true, lang)}</dd>
            </div>
          )}
          {bill.adjustments > 0 && (
            <div>
              <dt>{t("bill.adjustments")}</dt>
              <dd>−{money(bill.adjustments, true, lang)}</dd>
            </div>
          )}
          {bill.patientPaid > 0 && (
            <div>
              <dt>{t("bill.youPaid")}</dt>
              <dd>−{money(bill.patientPaid, true, lang)}</dd>
            </div>
          )}
          {bill.amountDue != null && (
            <div className="due">
              <dt>{t("bill.owe")}</dt>
              <dd>{money(bill.amountDue, true, lang)}</dd>
            </div>
          )}
        </dl>
        {totalFinding && (
          <a href={`#finding-${totalFinding.n}`} className="margin-note totals-note">
            <span className="margin-n">{totalFinding.n}</span>
            <span className="hand">{t("bill.totalNote")}</span>
          </a>
        )}
      </div>

      {findings.length === 0 ? (
        <p className="quiet">{t("bill.noFindings")}</p>
      ) : (
        <ol className="findings">
          {numbered.map(({ f, n }) => (
            <li key={f.id} id={`finding-${n}`} className="finding">
              <span className="margin-n">{n}</span>
              <div>
                <h3 className="finding-title">{f.title}</h3>
                <p className="finding-detail">{f.detail}</p>
                {f.evidence.length > 0 && (
                  <dl className="evidence">
                    {f.evidence.map((e) => (
                      <div key={e.label}>
                        <dt>{e.label}</dt>
                        <dd>
                          {e.value}
                          {e.source && (
                            <>
                              {" "}
                              <a href={e.source} target="_blank" rel="noreferrer" className="src">
                                {hostOf(e.source)}
                              </a>
                            </>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="confidence">
                  {f.confidence === "high" ? t("bill.confHigh") : t("bill.confCheck")}
                  {f.amount > 0 && t("bill.couldTakeOff", { amount: money(f.amount, true, lang) })}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
