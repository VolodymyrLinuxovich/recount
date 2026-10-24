"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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

/** Read "$1,234.56", "1234.56" or "402" as dollars. Anything else is not a number. */
const toMoney = (s: string) => {
  const m = s.trim().replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d{1,2})?)$/);
  return m ? Number(m[1]) : null;
};

/** "Fix this amount": an inline box to correct a misread charge before the questions are answered. */
function LineFix({ c, index, charge }: { c: CaseView; index: number; charge: number }) {
  const { t } = useT();
  const correctLine = useMutation(api.cases.correctLine);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"bill.fixBad" | "bill.fixFailed" | null>(null);
  const inputId = `fix-${index}`;

  if (!open)
    return (
      <button
        type="button"
        className="line-fix-link"
        onClick={() => {
          setValue(charge.toFixed(2));
          setError(null);
          setOpen(true);
        }}
      >
        {t("bill.fix")}
      </button>
    );

  async function save() {
    const n = toMoney(value);
    if (n == null) return setError("bill.fixBad");
    setBusy(true);
    setError(null);
    try {
      await correctLine({ id: c._id as Id<"cases">, token: c.token, index, charge: n });
      setOpen(false);
    } catch (e) {
      setError(/check the amount/i.test(String(e)) ? "bill.fixBad" : "bill.fixFailed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="line-fix"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor={inputId} className="visually-hidden">
        {t("bill.fixLabel", { line: index + 1 })}
      </label>
      <input
        id={inputId}
        className="line-fix-input"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={error === "bill.fixBad"}
        aria-describedby={error ? `${inputId}-err` : undefined}
        autoFocus
      />
      <div className="line-fix-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? t("bill.fixSaving") : t("bill.fixSave")}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)} disabled={busy}>
          {t("bill.fixCancel")}
        </button>
      </div>
      {error && (
        <p id={`${inputId}-err`} className="error-note" role="alert">
          {t(error)}
        </p>
      )}
    </form>
  );
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
  const free = c.eligibility?.tier === "FREE";
  const insured = Boolean(bill.insurancePayer || c.household?.insured);
  const noPriceList = !c.hospital?.mrf;
  const canFix = c.status === "needs_household" && Boolean(c.token);
  // What the reader wasn't sure of, and which lines it names ("line 3 may be 412.00").
  const unsure = bill.unreadable ?? [];
  const unsureLines = new Set<number>();
  for (const u of unsure) for (const m of u.matchAll(/\b(?:line|l[ií]nea)s?\s*#?(\d+)/gi)) unsureLines.add(Number(m[1]) - 1);

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
              {free ? (
                t("bill.stampFree")
              ) : (
                <>
                  {t("bill.stamp", { n: findings.length })}
                  {questionable > 0 && !insured && t("bill.stampUpTo", { amount: money(questionable, false, lang) })}
                  {insured && <span className="hand-stamp-sub">{t("bill.stampInsured")}</span>}
                </>
              )}
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

        {unsure.length > 0 && (
          <div className="sheet-unsure" role="note">
            <p className="sheet-unsure-h">{t("bill.checkPaperH")}</p>
            <ul>
              {unsure.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
            {canFix && <p className="sheet-unsure-fix">{t("bill.checkPaperFix")}</p>}
          </div>
        )}

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
                  {(unsureLines.has(i) || (l as { corrected?: boolean }).corrected) && (
                    <div className="line-flags">
                      {unsureLines.has(i) && !(l as { corrected?: boolean }).corrected && (
                        <span className="check-mark">{t("bill.checkLine")}</span>
                      )}
                      {(l as { corrected?: boolean }).corrected && <span className="corrected-mark">{t("bill.corrected")}</span>}
                    </div>
                  )}
                  {canFix && <LineFix key={`${i}-${l.charge}`} c={c} index={i} charge={l.charge} />}
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
        {free && bill.amountDue != null && bill.amountDue > 0 && <p className="hand due-free">{t("bill.dueFree")}</p>}
        {totalFinding && (
          <a href={`#finding-${totalFinding.n}`} className="margin-note totals-note">
            <span className="margin-n">{totalFinding.n}</span>
            <span className="hand">{t("bill.totalNote")}</span>
          </a>
        )}
      </div>

      {noPriceList && <p className="no-price-list">{t("bill.noPriceList")}</p>}
      {findings.length > 0 ? (
        <FindingList numbered={numbered} lines={bill.lines} />
      ) : (
        !noPriceList && <p className="quiet">{t("bill.noFindings")}</p>
      )}
    </section>
  );
}

const SHOW_FIRST = 3;

/** One finding as a card. */
function FindingCard({ f, n }: { f: Finding; n: number }) {
  const { t, lang } = useT();
  return (
    <li id={`finding-${n}`} className="finding">
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
  );
}

/** Many "ask for the cash price" findings read better as one card with a small table. */
function CashGroup({ items, lines }: { items: { f: Finding; n: number }[]; lines: { description: string; charge: number }[] }) {
  const { t, lang } = useT();
  const src = items.flatMap((x) => x.f.evidence.map((e) => e.source)).find(Boolean);
  const total = items.reduce((a, x) => a + x.f.amount, 0);
  return (
    <li className="finding cash-group">
      {items.map(({ n }) => (
        <span key={n} id={`finding-${n}`} className="anchor" aria-hidden />
      ))}
      <span className="margin-n">{items[0].n}</span>
      <div>
        <h3 className="finding-title">{t("bill.cashGroupH", { n: items.length })}</h3>
        <p className="finding-detail">{t("bill.cashGroupBody")}</p>
        <table className="cash-table">
          <thead>
            <tr>
              <th scope="col">{t("bill.colService")}</th>
              <th scope="col">{t("bill.colBilled")}</th>
              <th scope="col">{t("bill.colCash")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ f, n }) => {
              const i = f.lines[0];
              const line = lines[i];
              const cash = f.evidence.find((e) => /cash|efectivo/i.test(e.label))?.value ?? "";
              return (
                <tr key={n}>
                  <td>
                    <span className="margin-n margin-n-sm">{n}</span> {line?.description ?? ""}
                  </td>
                  <td>{line ? money(line.charge, true, lang) : ""}</td>
                  <td>{cash}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="confidence">
          {t("bill.confHigh")}
          {total > 0 && t("bill.couldTakeOff", { amount: money(total, true, lang) })}
          {src && (
            <>
              {" "}
              <a href={src} target="_blank" rel="noreferrer" className="src">
                {hostOf(src)}
              </a>
            </>
          )}
        </p>
      </div>
    </li>
  );
}

/** Biggest problems first; the rest behind one button. */
function FindingList({ numbered, lines }: { numbered: { f: Finding; n: number }[]; lines: { description: string; charge: number }[] }) {
  const { t } = useT();
  const [all, setAll] = useState(false);
  const cash = numbered.filter((x) => x.f.kind === "CASH_PRICE_GAP");
  const grouped = cash.length >= 3;
  const rest = (grouped ? numbered.filter((x) => x.f.kind !== "CASH_PRICE_GAP") : [...numbered]).sort((a, b) => b.f.amount - a.f.amount);
  const items: ({ kind: "one"; f: Finding; n: number; amount: number } | { kind: "cash"; amount: number })[] = [
    ...rest.map((x) => ({ kind: "one" as const, ...x, amount: x.f.amount })),
    ...(grouped ? [{ kind: "cash" as const, amount: cash.reduce((a, x) => a + x.f.amount, 0) }] : []),
  ].sort((a, b) => b.amount - a.amount);
  const shown = all ? items : items.slice(0, SHOW_FIRST);
  return (
    <>
      <ol className="findings">
        {shown.map((it) =>
          it.kind === "cash" ? <CashGroup key="cash" items={cash} lines={lines} /> : <FindingCard key={it.f.id} f={it.f} n={it.n} />,
        )}
      </ol>
      {items.length > SHOW_FIRST && (
        <button className="btn btn-quiet findings-more" onClick={() => setAll((x) => !x)} aria-expanded={all}>
          {all ? t("bill.showFewer") : t("bill.showAll", { n: items.length })}
        </button>
      )}
    </>
  );
}
