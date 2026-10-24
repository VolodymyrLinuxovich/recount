"use client";

// "What we found": the whole bill as a clean list, then one problem per screen.
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useT } from "../i18n/I18nProvider";
import { type BillLine, type CaseView, type Finding, hostOf, money } from "../types";
import { StepFrame } from "./StepFrame";
import { findingScreens } from "./steps";
import type { ScreenProps } from "./types";
import "./found.css";
import "./found-extra.css";

/* ---------- helpers ---------- */

/** Read "$1,234.56", "1234.56" or "402" as dollars. Anything else is not a number. */
const toMoney = (s: string) => {
  const m = s.trim().replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d{1,2})?)$/);
  return m ? Number(m[1]) : null;
};

/** Bill lines the reader wasn't sure of, from notes like "line 3 may be 412.00". */
function unsureLines(notes: string[]) {
  const out = new Set<number>();
  for (const u of notes) for (const m of u.matchAll(/\b(?:line|l[ií]nea)s?\s*#?(\d+)/gi)) out.add(Number(m[1]) - 1);
  return out;
}

const isCorrected = (l: BillLine) => Boolean((l as { corrected?: boolean }).corrected);

/** Can the patient still fix a misread amount? Only before the three questions are answered. */
const canFix = (c: CaseView) => c.status === "needs_household" && Boolean(c.token);

/** Where the last problem screen leads: the questions before an answer exists, the answer after. */
function afterFindings(c: CaseView, go: (s: string) => void, t: ReturnType<typeof useT>["t"]) {
  const beforeAnswer = c.status === "needs_household" || c.eligibility?.tier === "NEEDS_INFO";
  return beforeAnswer ? { label: t("found.answerQs"), onClick: () => go("q1") } : { label: t("found.backToAnswer"), onClick: () => go("answer") };
}

/* ---------- the bill picture ---------- */

function BillThumb({ c }: { c: CaseView }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!c.fileUrl) return null;
  const isImage = c.fileType?.startsWith("image/") ?? true;
  if (!isImage)
    return (
      <a href={c.fileUrl} target="_blank" rel="noreferrer" className="found-file-link">
        {t("found.openFile")}
      </a>
    );
  return (
    <>
      <button type="button" className="found-thumb" onClick={() => setOpen(true)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={c.fileUrl} alt="" />
        <span>{t("found.tapBill")}</span>
      </button>
      {open && (
        <div className="found-viewer" role="dialog" aria-modal="true" aria-label={t("found.billAlt")}>
          <button type="button" className="found-viewer-close btn btn-primary" onClick={() => setOpen(false)} autoFocus>
            {t("found.closeBill")}
          </button>
          <div className="found-viewer-scroll">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.fileUrl} alt={t("found.billAlt")} />
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- one bill line, with "fix this amount" ---------- */

function LineRow({
  c,
  line,
  index,
  badges,
  unsure,
  go,
}: {
  c: CaseView;
  line: BillLine;
  index: number;
  badges: number[];
  unsure: boolean;
  go: (s: string) => void;
}) {
  const { t, lang } = useT();
  const correctLine = useMutation(api.cases.correctLine);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"bill.fixBad" | "bill.fixFailed" | null>(null);
  const fixable = canFix(c);
  const corrected = isCorrected(line);
  const inputId = `fix-${index}`;

  async function save() {
    const n = toMoney(value);
    if (n == null) return setError("bill.fixBad");
    setBusy(true);
    setError(null);
    try {
      await correctLine({ id: c._id as Id<"cases">, token: c.token, index, charge: n });
      setEditing(false);
    } catch (e) {
      setError(/check the amount/i.test(String(e)) ? "bill.fixBad" : "bill.fixFailed");
    } finally {
      setBusy(false);
    }
  }

  const amount = money(line.charge, true, lang);
  return (
    <li className={`found-line ${badges.length ? "has-problem" : ""}`}>
      <div className="found-line-row">
        <span className="found-line-no">{index + 1}</span>
        <div className="found-line-main">
          <span className="found-line-desc" lang={billLang(lang)}>
            {line.description}
          </span>
          {(badges.length > 0 || unsure || corrected) && (
            <span className="found-line-tags">
              {badges.map((b) => (
                <button key={b} type="button" className="found-badge" onClick={() => go(`finding-${b}`)} aria-label={t("found.seeProblem", { n: b + 1 })}>
                  {b + 1}
                </button>
              ))}
              {unsure && !corrected && <span className="found-pill found-pill-check">{t("bill.checkLine")}</span>}
              {corrected && <span className="found-pill found-pill-ok">{t("bill.corrected")}</span>}
            </span>
          )}
        </div>
        {fixable && !editing ? (
          <button
            type="button"
            className="found-line-amt found-line-fix"
            onClick={() => {
              setValue(line.charge.toFixed(2));
              setError(null);
              setEditing(true);
            }}
            aria-label={t("found.fixAria", { line: index + 1, amount })}
          >
            <span>{amount}</span>
            <span className="found-fix-word">{t("found.fixShort")}</span>
          </button>
        ) : (
          <span className="found-line-amt">{amount}</span>
        )}
      </div>
      {fixable && editing && (
        <form
          className="found-fix"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor={inputId}>{t("bill.fixLabel", { line: index + 1 })}</label>
          <input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error === "bill.fixBad"}
            aria-describedby={error ? `${inputId}-err` : undefined}
            autoFocus
          />
          <div className="found-fix-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t("bill.fixSaving") : t("bill.fixSave")}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)} disabled={busy}>
              {t("bill.fixCancel")}
            </button>
          </div>
          {error && (
            <p id={`${inputId}-err`} className="error-note" role="alert">
              {t(error)}
            </p>
          )}
        </form>
      )}
    </li>
  );
}

/* ---------- "what we found" ---------- */

export function FoundStep({ c, next, back, go }: ScreenProps) {
  const { t, lang } = useT();
  const bill = c.bill!;
  const screens = findingScreens(c);
  const n = screens.length;
  // Notes from the reader, without internal field names like "hospitalAddress: …".
  const unsure = (bill.unreadable ?? []).map((u) => u.replace(/^[a-z]+[A-Z][A-Za-z]*(\[\d+\])?(\.[A-Za-z]+)?\s*:\s*/, "")).filter(Boolean);
  const unsureSet = unsureLines(unsure);
  const name = c.hospital?.name ?? bill.hospitalName;

  // Which problem screens point at each bill line.
  const byId = new Map((c.findings ?? []).map((f) => [f.id, f]));
  const badgesFor = new Map<number, number[]>();
  screens.forEach((s, i) => {
    for (const id of s.ids)
      for (const line of byId.get(id)?.lines ?? []) {
        const list = badgesFor.get(line) ?? [];
        if (!list.includes(i)) badgesFor.set(line, [...list, i]);
      }
  });

  // Nothing readable: ask for a better photo instead of carrying on with an empty bill.
  if (bill.lines.length === 0 && unsure.length > 0 && c.status === "needs_household")
    return (
      <StepFrame
        phase={1}
        title={t("flow.retakeH")}
        primary={{ label: t("flow.retake"), href: "/" }}
        secondary={{ label: t("flow.continueAnyway"), onClick: n > 0 ? next : () => go("q1") }}
      >
        <p>{t("flow.retakeBody")}</p>
        <button className="link-btn" onClick={() => go("more")}>
          {t("flow.moreLink")}
        </button>
      </StepFrame>
    );

  return (
    <StepFrame
      phase={2}
      title={t("flow.foundH", { n })}
      primary={n > 0 ? { label: t("flow.next"), onClick: next } : afterFindings(c, go, t)}
      onBack={back}
    >
      <div className="found-summary">
        <BillThumb c={c} />
        <div className="found-summary-text">
          {name && <p className="found-hospital">{name}</p>}
          {bill.amountDue != null && <p>{t("found.billSays", { amount: money(bill.amountDue, true, lang) })}</p>}
          <p className="found-quiet">{t("found.linesRead", { n: bill.lines.length })}</p>
        </div>
      </div>

      {unsure.length > 0 && (
        <div className="found-box found-box-check" role="note">
          <p className="found-box-h">{t("bill.checkPaperH")}</p>
          <ul>
            {unsure.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
          {canFix(c) && <p className="found-quiet">{t("found.fixHint")}</p>}
        </div>
      )}

      {/* No price list: the good news first, the missing list as one small muted line. */}
      {!c.hospital?.mrf && (
        <div className="found-noprice">
          <p className="found-noprice-lead">{t("bill.noPriceLead")}</p>
          <p className="found-quiet">{t("bill.noPriceList")}</p>
        </div>
      )}

      {bill.lines.length > 0 && (
        <section className="found-lines" aria-labelledby="found-lines-h">
          <div className="found-lines-head">
            <h2 id="found-lines-h">{t("found.linesH")}</h2>
            <span>{t("found.colAmount")}</span>
          </div>
          <ol>
            {bill.lines.map((l, i) => (
              <LineRow
                key={`${i}-${l.charge}`}
                c={c}
                line={l}
                index={i}
                badges={badgesFor.get(i) ?? []}
                unsure={unsureSet.has(i)}
                go={go}
              />
            ))}
          </ol>
          {badgesFor.size > 0 && <p className="found-quiet found-legend">{t("found.flagNote")}</p>}
          {!unsure.length && canFix(c) && <p className="found-quiet found-legend">{t("found.fixHint")}</p>}
        </section>
      )}
      <div className="step-links">
        <button className="link-btn" onClick={() => go("more")}>
          {t("flow.moreLink")}
        </button>
      </div>
    </StepFrame>
  );
}

/* ---------- one problem per screen ---------- */

function SourceLink({ url }: { url?: string }) {
  const { t } = useT();
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="found-src">
      {t("found.source")}: {hostOf(url)}
    </a>
  );
}

function Versus({ left, right }: { left: { label: string; value: string }; right: { label: string; value: string; note?: string; src?: string } }) {
  return (
    <div className="found-versus">
      <div>
        <p className="found-versus-label">{left.label}</p>
        <p className="found-versus-num">{left.value}</p>
      </div>
      <div>
        <p className="found-versus-label">{right.label}</p>
        <p className="found-versus-num">{right.value}</p>
        {right.note && <p className="found-quiet">{right.note}</p>}
      </div>
      {right.src && (
        <p className="found-versus-src">
          <SourceLink url={right.src} />
        </p>
      )}
    </div>
  );
}

/** Bill text is printed in English; on a Spanish page it says so for screen readers (WCAG 3.1.2). */
const billLang = (lang: string) => (lang === "en" ? undefined : "en");

/** Insurance already adjusted the bill, so the gap to a published price overstates what the patient pays. */
const isInsured = (c: CaseView) => !!c.bill?.insurancePayer?.trim() || !!c.household?.insured;

function Save({ c, amount }: { c: CaseView; amount: number }) {
  const { t, lang } = useT();
  if (amount <= 0) return null;
  return (
    <p className="found-save">{isInsured(c) ? t("found.saveInsured") : t("found.save", { amount: money(amount, true, lang) })}</p>
  );
}

/**
 * An insured patient's duplicate: "You could save" is vague for them (insurance already adjusted the bill),
 * but taking a repeated charge off the amount due is plain subtraction. Only for duplicates.
 */
function DupOwe({ c, amount }: { c: CaseView; amount: number }) {
  const { t, lang } = useT();
  const due = c.bill?.amountDue;
  if (!isInsured(c) || typeof due !== "number" || amount <= 0 || amount > due) return null;
  return <p className="found-owe">{t("found.dupInsuredOwe", { amount: money(due - amount, true, lang) })}</p>;
}

function Confidence({ c, f, amount }: { c: CaseView; f: Finding; amount: number }) {
  const { t } = useT();
  return (
    <>
      <Save c={c} amount={amount} />
      <p className="found-quiet">{f.confidence === "high" ? t("bill.confHigh") : t("bill.confCheck")}</p>
    </>
  );
}

/** One finding as a clean card: what, the two numbers, what you could save, why. */
function FindingCard({ c, f }: { c: CaseView; f: Finding }) {
  const { t, lang } = useT();
  const lines = c.bill?.lines ?? [];
  const line = lines[f.lines[f.lines.length - 1]];

  if (f.kind === "ABOVE_LIST_PRICE" || f.kind === "CASH_PRICE_GAP") {
    const cash = f.kind === "CASH_PRICE_GAP";
    const qty = line && line.quantity > 1 ? line.quantity : 1;
    const billed = line?.charge ?? 0;
    // Published prices are per unit in the evidence. One finding can carry both the list and the cash price.
    const unit = (re: RegExp) => {
      const v = f.evidence.find((e) => re.test(e.label))?.value;
      const n = v ? Number(v.replace(/[^0-9.]/g, "")) : NaN;
      return Number.isFinite(n) && n > 0 ? n * qty : null;
    };
    const listTotal = unit(/gross|list|lista|bruto/i);
    const cashTotal = unit(/cash|efectivo|sin seguro/i);
    const shown = cash ? (cashTotal ?? billed - f.amount) : (listTotal ?? billed - f.amount);
    return (
      <div className="found-card">
        <p className="found-card-name" lang={billLang(lang)}>
          {line?.description}
        </p>
        <p className="found-quiet">{t("found.lineN", { n: f.lines[0] + 1 })}</p>
        <Versus
          left={{ label: t("found.billed"), value: money(billed, true, lang) }}
          right={{
            label: cash ? t("found.cashPrice") : t("found.listPrice"),
            value: money(Math.max(0, shown), true, lang),
            note: qty > 1 ? t("found.forUnits", { n: qty }) : undefined,
            src: f.evidence.find((e) => e.source)?.source,
          }}
        />
        {!cash && cashTotal != null && listTotal != null && cashTotal < listTotal && (
          <p className="found-quiet">{t("found.cashToo", { amount: money(cashTotal, true, lang) })}</p>
        )}
        <Confidence c={c} f={f} amount={f.amount} />
        <p className="found-why">{cash ? t("found.whyCash") : t("found.whyAbove")}</p>
      </div>
    );
  }

  if (f.kind === "DUPLICATE_LINE") {
    const [a, b] = f.lines;
    return (
      <div className="found-card">
        <p className="found-card-name" lang={billLang(lang)}>
          {line?.description}
        </p>
        <Versus
          left={{ label: t("found.lineN", { n: a + 1 }), value: money(lines[a]?.charge ?? f.amount, true, lang) }}
          right={{ label: t("found.lineN", { n: b + 1 }), value: money(lines[b]?.charge ?? f.amount, true, lang) }}
        />
        <Confidence c={c} f={f} amount={f.amount} />
        <DupOwe c={c} amount={f.amount} />
        <p className="found-why">{t("found.whyDup", { a: a + 1, b: b + 1 })}</p>
      </div>
    );
  }

  if (f.kind === "TOTAL_MISMATCH") {
    const unsure = (c.bill?.unreadable ?? []).length > 0;
    const [sum, printed] = f.evidence;
    return (
      <div className="found-card">
        {sum && printed && (
          <Versus left={{ label: t("found.sumLines"), value: sum.value }} right={{ label: t("found.printedTotal"), value: printed.value }} />
        )}
        <Confidence c={c} f={f} amount={f.amount} />
        <p className="found-why">{unsure ? t("found.whyTotalUnsure") : t("found.whyTotal")}</p>
      </div>
    );
  }

  // NOT_ITEMIZED and anything new: a plain explanation.
  return (
    <div className="found-card">
      <p className="found-why">{f.kind === "NOT_ITEMIZED" ? t("found.whySummary") : f.detail}</p>
      <Confidence c={c} f={f} amount={f.amount} />
    </div>
  );
}

function titleFor(t: ReturnType<typeof useT>["t"], c: CaseView, f: Finding) {
  switch (f.kind) {
    case "ABOVE_LIST_PRICE":
      return t("found.titleAbove");
    case "CASH_PRICE_GAP":
      return t("found.titleCash");
    case "DUPLICATE_LINE":
      return t("found.titleDup");
    case "TOTAL_MISMATCH":
      return (c.bill?.unreadable ?? []).length > 0 ? t("found.titleTotalUnsure") : t("found.titleTotal");
    case "NOT_ITEMIZED":
      return t("found.titleSummary");
    default:
      return f.title;
  }
}

/** Many "ask for the cash price" findings on one screen, as a small table. */
function CashGroup({ c, items }: { c: CaseView; items: Finding[] }) {
  const { t, lang } = useT();
  const lines = c.bill?.lines ?? [];
  const total = items.reduce((a, f) => a + f.amount, 0);
  const src = items.flatMap((f) => f.evidence.map((e) => e.source)).find(Boolean);
  return (
    <div className="found-card">
      <p className="found-why">{t("bill.cashGroupBody")}</p>
      <table className="found-table cash-table">
        <thead>
          <tr>
            <th scope="col">{t("bill.colService")}</th>
            <th scope="col">{t("bill.colBilled")}</th>
            <th scope="col">{t("bill.colCash")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((f) => {
            const line = lines[f.lines[0]];
            const billed = line?.charge ?? 0;
            return (
              <tr key={f.id}>
                <td lang={billLang(lang)}>{line?.description ?? ""}</td>
                <td data-label={t("bill.colBilled")}>{money(billed, true, lang)}</td>
                <td data-label={t("bill.colCash")}>{money(Math.max(0, billed - f.amount), true, lang)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <SourceLink url={src} />
      <Save c={c} amount={total} />
      <p className="found-quiet">{t("bill.confHigh")}</p>
    </div>
  );
}

export function FindingStep({ c, index, next, back, go }: ScreenProps & { index: number }) {
  const { t } = useT();
  const screens = findingScreens(c);
  const screen = screens[index];
  const items = (c.findings ?? []).filter((f) => screen?.ids.includes(f.id));
  const last = index >= screens.length - 1;
  const primary = last ? afterFindings(c, go, t) : { label: t("flow.next"), onClick: next };
  const grouped = screen?.key === "cash";

  if (!items.length)
    return <StepFrame phase={2} title={t("flow.foundH", { n: screens.length })} primary={primary} onBack={back} />;

  return (
    <StepFrame
      phase={2}
      eyebrow={t("found.problemOf", { i: index + 1, n: screens.length })}
      title={grouped ? t("bill.cashGroupH", { n: items.length }) : titleFor(t, c, items[0])}
      primary={primary}
      onBack={back}
    >
      {grouped ? <CashGroup c={c} items={items} /> : <FindingCard c={c} f={items[0]} />}
    </StepFrame>
  );
}
