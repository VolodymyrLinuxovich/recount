"use client";

import { useState } from "react";
import { PenCircle, PenStrike, PenUnderline } from "./Pen";
import { type CaseView, type Finding, hostOf, money, questionableTotal, shortDate } from "./types";

interface LineMark {
  n: number; // finding number shown in the margin
  finding: Finding;
  strike: boolean;
  note: string;
}

function noteFor(f: Finding, lineIndex: number): { note: string; strike: boolean } | null {
  switch (f.kind) {
    case "DUPLICATE_LINE": {
      const [first, dup] = f.lines;
      if (lineIndex === dup) return { strike: true, note: `same as line ${first + 1}? take off ${money(f.amount, false)}` };
      return { strike: false, note: `listed again on line ${dup + 1}` };
    }
    case "ABOVE_LIST_PRICE":
      return { strike: false, note: `${money(f.amount, false)} over their own list price` };
    case "CASH_PRICE_GAP": {
      const cash = f.evidence.find((e) => /cash/i.test(e.label))?.value;
      return { strike: false, note: cash ? `cash price is ${cash} a unit` : `ask for the cash price` };
    }
    default:
      return null;
  }
}

export function BillMarkup({ c, findings }: { c: CaseView; findings: Finding[] }) {
  const bill = c.bill!;
  const [showPhoto, setShowPhoto] = useState(false);
  const numbered = findings.map((f, i) => ({ f, n: i + 1 }));

  const marks = new Map<number, LineMark[]>();
  for (const { f, n } of numbered) {
    for (const i of f.lines) {
      const m = noteFor(f, i);
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
          Your bill, recounted
        </h2>
        <span className="label">{c.billSource === "claude" ? "read by Claude from your photo" : "sample bill source data"}</span>
      </div>

      {c.fileUrl && (
        <div className="photo-wrap">
          {isImage ? (
            <button className={`photo-btn ${showPhoto ? "open" : ""}`} onClick={() => setShowPhoto((s) => !s)} aria-expanded={showPhoto}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.fileUrl} alt="The bill you uploaded" className="photo" />
              <span className="photo-toggle">{showPhoto ? "Show less" : "Your photo. Tap to see all of it"}</span>
            </button>
          ) : (
            <a href={c.fileUrl} target="_blank" rel="noreferrer" className="link">
              Open the file you uploaded
            </a>
          )}
          {findings.length > 0 && (
            <p className="hand-stamp" aria-hidden>
              {findings.length} {findings.length === 1 ? "thing" : "things"} to ask about
              {questionable > 0 && <> · up to {money(questionable, false)}</>}
            </p>
          )}
        </div>
      )}

      <div className="sheet">
        <div className="sheet-head">
          <div className="sheet-hospital">{bill.hospitalName ?? "Hospital name not printed"}</div>
          <dl className="sheet-meta">
            {bill.patientName && (
              <>
                <dt>Patient</dt>
                <dd>{bill.patientName}</dd>
              </>
            )}
            {bill.accountNumber && (
              <>
                <dt>Account</dt>
                <dd>{bill.accountNumber}</dd>
              </>
            )}
            {bill.serviceDate && (
              <>
                <dt>Visit</dt>
                <dd>{shortDate(bill.serviceDate)}</dd>
              </>
            )}
            {bill.statementDate && (
              <>
                <dt>Statement</dt>
                <dd>{shortDate(bill.statementDate)}</dd>
              </>
            )}
          </dl>
        </div>

        {summary && (
          <div className="sheet-summary">
            <span className="margin-n">{summary.n}</span>
            <span className="hand">Summary bill. Ask for the itemized one.</span>
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
                      {money(l.charge)}
                      {circle && <PenCircle delay={d} />}
                    </span>
                  </div>
                  <div className="line-codes">
                    {[l.date && l.date !== bill.serviceDate && shortDate(l.date), l.code && `code ${l.code}`, l.revCode && `rev ${l.revCode}`, l.quantity !== 1 && `qty ${l.quantity}`]
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
              <dt>Total charges</dt>
              <dd>
                {money(bill.totalCharges)}
                {totalFinding && <PenUnderline delay={totalDelay} />}
              </dd>
            </div>
          )}
          {bill.insurancePaid > 0 && (
            <div>
              <dt>Insurance paid</dt>
              <dd>−{money(bill.insurancePaid)}</dd>
            </div>
          )}
          {bill.adjustments > 0 && (
            <div>
              <dt>Adjustments</dt>
              <dd>−{money(bill.adjustments)}</dd>
            </div>
          )}
          {bill.patientPaid > 0 && (
            <div>
              <dt>You paid</dt>
              <dd>−{money(bill.patientPaid)}</dd>
            </div>
          )}
          {bill.amountDue != null && (
            <div className="due">
              <dt>They say you owe</dt>
              <dd>{money(bill.amountDue)}</dd>
            </div>
          )}
        </dl>
        {totalFinding && (
          <a href={`#finding-${totalFinding.n}`} className="margin-note totals-note">
            <span className="margin-n">{totalFinding.n}</span>
            <span className="hand">lines don&rsquo;t add up to this</span>
          </a>
        )}
      </div>

      {findings.length === 0 ? (
        <p className="quiet">
          No line-level problems found against the hospital&rsquo;s published prices. Financial assistance can still cover
          the whole bill.
        </p>
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
                  {f.confidence === "high" ? "Based on the hospital's published number." : "Worth asking. It may have a reason."}
                  {f.amount > 0 && <> Could take off {money(f.amount)}.</>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
