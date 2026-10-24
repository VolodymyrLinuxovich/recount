"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { CaseView, Letter } from "./types";
import "./letters.css";

export type PrintChoice = Letter["kind"] | "all";

/**
 * Opens the browser's print dialog for one letter or all of them.
 * The body attribute tells the print stylesheet to hide the app and show only those letters.
 */
export function printLetters(choice: PrintChoice, title: string) {
  const body = document.body;
  const oldTitle = document.title;
  body.dataset.print = choice;
  // The title becomes the PDF's suggested file name.
  document.title = title;
  const done = () => {
    delete body.dataset.print;
    document.title = oldTitle;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

const CLOSINGS = /^(thank you|thanks|sincerely|respectfully|regards|best regards|best|with thanks)\b.*,\s*$/i;
const GREETING = /^(dear\b|to\b|hello\b|to whom\b).*[,:]\s*$/i;
const DATE_SLOT = /^\[(date|today'?s date|fecha)\]$/i;
const MONTH_DATE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}, \d{4}$/i;
const SIGN_SLOT = /^\[(your )?signature\]$/i;

interface Paper {
  /** Lines to add above the letter, when the letter doesn't already have them. */
  date: boolean;
  from: boolean;
  re: boolean;
  /** Body up to and including the closing ("Thank you,"). */
  main: string;
  /** Name and contact lines under the signature space. */
  after: string;
  /** Whether a closing was found, so the signature space has a place. */
  closed: boolean;
}

/**
 * Lays a letter out on paper. Some letters already start with their own header
 * (date, hospital address, "Re:" line); then we only fill in the date and don't repeat the rest.
 */
function layout(body: string, today: string, account: string | null): Paper {
  const lines = body.replace(/\s+$/, "").split("\n");
  const greet = lines.findIndex((x, i) => i < 25 && GREETING.test(x.trim()));
  const header = greet > 0 ? lines.slice(0, greet) : [];
  let hasDate = false;
  for (let i = 0; i < header.length; i++) {
    const x = lines[i].trim();
    if (DATE_SLOT.test(x)) {
      lines[i] = today;
      hasDate = true;
    } else if (MONTH_DATE.test(x)) hasDate = true;
  }
  const headerText = header.join("\n");
  const hasRe = /^\s*(re|subject)\s*:/im.test(headerText);
  const hasAccount = /account/i.test(headerText) || (!!account && headerText.includes(account));

  let main = lines.join("\n");
  let after = "";
  let closed = false;
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
    if (CLOSINGS.test(lines[i].trim())) {
      // The space we leave is where they sign, so a "[Signature]" line right under it goes away.
      const rest = lines.slice(i + 1);
      while (rest.length && (rest[0].trim() === "" || SIGN_SLOT.test(rest[0].trim()))) rest.shift();
      main = lines.slice(0, i + 1).join("\n");
      after = rest.join("\n");
      closed = true;
      break;
    }
  }
  return { date: !hasDate, from: !hasAccount, re: !hasRe, main, after, closed };
}

const subscribeNothing = () => () => {};

/** Paper copies of the letters, in English, for the print stylesheet. Hidden on screen. */
export function PrintLetters({ c, letters }: { c: CaseView; letters: Letter[] }) {
  const onClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  if (!onClient) return null;

  // The letter goes to the hospital, so the date is written the US English way.
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const name = c.bill?.patientName?.trim() || "[Your name]";
  const account = c.bill?.accountNumber?.trim() || "[account number]";

  return createPortal(
    <div className="print-sheets" aria-hidden="true" lang="en">
      {letters.map((l, i) => {
        const p = layout(l.body, today, c.bill?.accountNumber?.trim() || null);
        return (
          <article className="print-sheet" data-kind={l.kind} key={l.kind + i}>
            {p.date && <p className="print-date">{today}</p>}
            {p.from && (
              <p className="print-from">
                {name}
                <br />
                Account number: {account}
              </p>
            )}
            {p.re && (
              <p className="print-re">
                <strong>Re:</strong> {l.subject}
              </p>
            )}
            <div className="print-body">{p.main}</div>
            <div className={p.closed ? "print-sign" : "print-sign print-sign-line"}>{p.closed ? null : "Signature"}</div>
            {p.after && <div className="print-body">{p.after}</div>}
          </article>
        );
      })}
    </div>,
    document.body,
  );
}
