"use client";

import Link from "next/link";
import { useState } from "react";
import { useT } from "./i18n/I18nProvider";
import type { PlainKey } from "./i18n/strings";
import { shortDate } from "./types";
import "./policy-aside.css";

export interface PolicyFinding {
  rule: string;
  verdict: "conflict" | "likely" | "ask";
  quote: string;
  page: number | null;
  docType: string;
  docUrl: string | null;
  effectiveDate: string | null;
  explanation: string;
  /** English original of `explanation` when the case is in Spanish. */
  explanationEn?: string;
}

const HSC = (n: string) => `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=${n}.`;

// One plain line per state rule (text in i18n/strings.ts), with the section it comes from.
const LAW: Record<string, { line: PlainKey; cite: string; url: string }> = {
  DEADLINE: { line: "law.DEADLINE", cite: "Health & Safety Code 127405", url: HSC("127405") },
  ASSETS: { line: "law.ASSETS", cite: "Health & Safety Code 127405", url: HSC("127405") },
  INCOME_PROOF: { line: "law.INCOME_PROOF", cite: "Health & Safety Code 127405", url: HSC("127405") },
  CREDIT_REPORTING: { line: "law.CREDIT_REPORTING", cite: "Health & Safety Code 127425", url: HSC("127425") },
  LIENS: { line: "law.LIENS", cite: "Health & Safety Code 127425", url: HSC("127425") },
  MEDICAL_FIRST: { line: "law.MEDICAL_FIRST", cite: "Health & Safety Code 127405", url: HSC("127405") },
};

export function PolicyAside({
  findings,
  hospitalName,
  hospitalKey,
  inLetter,
}: {
  findings: PolicyFinding[];
  hospitalName: string | null;
  hospitalKey: string | null;
  inLetter: boolean;
}) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  if (!findings.length) return null;
  // Two or more: a summary line, the first finding in full, and the rest behind "See them".
  const many = findings.length >= 2;
  const shown = many && !open ? findings.slice(0, 1) : findings;
  const firm = findings.filter((f) => f.verdict !== "ask");
  const conflicts = findings.filter((f) => f.verdict === "conflict").length;
  const head = conflicts
    ? t("policy.headBreaks", { name: hospitalName, n: conflicts })
    : firm.length
      ? t("policy.headLikely", { name: hospitalName, n: firm.length })
      : t("policy.headUnclear", { name: hospitalName });

  return (
    <aside className={firm.length ? "policy-aside" : "policy-aside policy-aside-ask"} aria-labelledby="policy-aside-h">
      <h2 id="policy-aside-h" className="policy-aside-h">
        {head}
      </h2>
      {many && firm.length > 0 && <p className="policy-aside-sum">{t("policy.cites", { added: inLetter })}</p>}
      <ol className="policy-aside-list" id="policy-aside-list">
        {shown.map((f, i) => {
          const law = LAW[f.rule];
          return (
            <li key={f.rule + i}>
              <p className="policy-aside-label">
                {t("policy.theirSays", { doc: f.docType })}
                {f.verdict === "likely" && t("policy.likely")}
                {f.verdict === "ask" && t("policy.ask")}
              </p>
              <blockquote className="policy-aside-quote">&ldquo;{f.quote}&rdquo;</blockquote>
              <div className="policy-aside-cite">
                {f.docUrl ? (
                  <a href={f.page != null ? `${f.docUrl}#page=${f.page}` : f.docUrl} target="_blank" rel="noreferrer">
                    {t("policy.pdf")}
                    {f.page != null && t("policy.page", { n: f.page })}
                  </a>
                ) : (
                  <span>
                    {t("policy.policy")}
                    {f.page != null && t("policy.page", { n: f.page })}
                  </span>
                )}
                <span className="quiet"> · {t("doc.effective", { date: f.effectiveDate ? shortDate(f.effectiveDate, lang) : null })}</span>
              </div>
              <p className="policy-aside-law">
                <strong>{t("policy.lawLabel")}</strong> {law ? t(law.line) : f.explanation}{" "}
                {law && (
                  <a href={law.url} target="_blank" rel="noreferrer" className="src">
                    {law.cite}
                  </a>
                )}
              </p>
            </li>
          );
        })}
      </ol>
      {many && (
        <button
          type="button"
          className="policy-aside-more"
          aria-expanded={open}
          aria-controls="policy-aside-list"
          onClick={() => setOpen(!open)}
        >
          {open ? t("policy.hideThem") : t("policy.seeThem", { n: findings.length - 1 })}
        </button>
      )}
      <p className="policy-aside-foot">
        {!many && firm.length > 0 && t("policy.foot", { added: inLetter, firm: firm.length, total: findings.length })}
        <Link href={hospitalKey ? `/audit#h=${encodeURIComponent(hospitalKey)}` : "/audit"}>
          {t("policy.seeOthers")}
        </Link>
      </p>
    </aside>
  );
}
