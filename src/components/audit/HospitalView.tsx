import Link from "next/link";
import { hostOf } from "../types";
import { useT } from "../i18n/I18nProvider";
import type { T } from "../i18n/strings";
import { type AuditFinding, type DocType, type Hospital, type Rule, displayName, docLabel, longDate, place, verdictLabel, worst } from "./data";

// A sentence ends at . ; or : followed by a space and a capital letter (or the end), so "$5.00" and "704.10" don't count.
const SENTENCE_END = /[.;:](?=\s+[A-Z("“]|\s*$)/g;

/** The sentence just before the quote, or nothing if it's long or a list fragment. */
function lead(before: string) {
  const text = before.replace(/(\s|^)[(]?[a-z0-9]{1,2}[.)]\s*$/i, "").trimEnd();
  if (!/[.;:]$/.test(text)) return "…";
  const ends = [...text.slice(0, -1).matchAll(SENTENCE_END)].map((m) => m.index! + 1);
  const from = ends.length ? ends[ends.length - 1] : 0;
  const last = text.slice(from).trim();
  if (!last || last.length > 160 || !/^[A-Z("“]/.test(last)) return "…";
  return (from > 0 ? "…" : "") + last + " ";
}

/** The rest of the quote's sentence and the next one, kept short. */
function tail(after: string) {
  const text = after.trimEnd();
  if (!text) return "";
  const ends = [...text.matchAll(SENTENCE_END)].map((m) => m.index! + 1);
  let cut = ends.find((e) => e > 0) ?? text.length;
  const second = ends.find((e) => e > cut);
  if (second && second <= 220) cut = second;
  if (cut > 260) return text.slice(0, 240).replace(/\s+\S*$/, "") + " …";
  return text.slice(0, cut) + (cut < text.length ? " …" : "");
}

/** Show the flagged sentence in red pen, with a little of the text around it. */
function InContext({ f }: { f: AuditFinding }) {
  const at = f.context.indexOf(f.quote);
  if (at < 0) return <mark className="policy-mark">{f.quote}</mark>;
  return (
    <>
      {lead(f.context.slice(0, at))}
      <mark className="policy-mark">{f.quote}</mark>
      {tail(f.context.slice(at + f.quote.length))}
    </>
  );
}

function FindingCard({ f, rule }: { f: AuditFinding; rule?: Rule }) {
  const { t, lang } = useT();
  return (
    <li className={`a-finding a-${f.verdict}`}>
      <div className="a-finding-head">
        <h4 className="a-rule">{rule?.title ?? f.rule}</h4>
        <span className={`verdict verdict-${f.verdict}`}>{verdictLabel(f.verdict, lang)}</span>
      </div>
      <div className="versus">
        <div className="versus-col">
          <div className="versus-label">{t("hosp.theirSays")}</div>
          <blockquote className="policy-quote">
            <InContext f={f} />
          </blockquote>
          <div className="versus-cite">
            <a href={f.docUrl} target="_blank" rel="noreferrer">
              {docLabel(f.docType, lang)}
              {f.page != null && t("policy.page", { n: f.page })}
            </a>
            <span className="quiet"> · {t("doc.effective", { date: f.effectiveDate ? longDate(f.effectiveDate, lang) : null })}</span>
          </div>
        </div>
        <div className="versus-col versus-law">
          <div className="versus-label">{t("hosp.lawSays")}</div>
          <blockquote className="law-quote">{rule?.lawQuote ?? t("hosp.seeRule")}</blockquote>
          {rule && (
            <div className="versus-cite">
              <a href={rule.url} target="_blank" rel="noreferrer">
                {rule.cite}
              </a>
            </div>
          )}
        </div>
      </div>
      <p className="a-explain">{f.explanation}</p>
    </li>
  );
}

function summary(t: T, h: Hospital) {
  const bad = h.findings.filter((f) => f.verdict !== "ask").length;
  return t("hosp.summary", { bad, ask: h.findings.length - bad });
}

export function HospitalView({ h, rules }: { h: Hospital; rules: Rule[] }) {
  const { t, lang } = useT();
  const w = worst(h);
  const byId = new Map(rules.map((r) => [r.id, r]));
  const order = { conflict: 0, likely: 1, ask: 2 } as const;
  const findings = [...h.findings].sort((a, b) => order[a.verdict] - order[b.verdict]);
  const docs = Object.entries(h.docs) as [DocType, { url: string; effectiveDate: string | null }][];

  return (
    <article className="hospital" aria-labelledby="hospital-h">
      <p className="eyebrow">{place(h, lang) || "California"}</p>
      <h2 id="hospital-h" className="h-hospital">
        {displayName(h.name)}
      </h2>
      <p className={`hospital-verdict verdict-text-${w}`}>
        {h.checked === false
          ? t("hosp.unread")
          : w === "none"
            ? t("hosp.none")
            : summary(t, h)}
      </p>

      {findings.length > 0 && <ol className="a-findings">{findings.map((f, i) => <FindingCard key={f.rule + i} f={f} rule={byId.get(f.rule)} />)}</ol>}

      <div className="hospital-docs">
        <div className="versus-label">{t("hosp.docsRead")}</div>
        <ul>
          {docs.map(([type, d]) => (
            <li key={type}>
              <a href={d.url} target="_blank" rel="noreferrer">
                {docLabel(type, lang)}
              </a>{" "}
              <span className="quiet">{t("doc.effective", { date: d.effectiveDate ? longDate(d.effectiveDate, lang) : null })}</span>
            </li>
          ))}
          <li>
            <a href={h.detailUrl} target="_blank" rel="noreferrer">
              {t("hosp.stateListing")}
            </a>{" "}
            <span className="quiet">{hostOf(h.detailUrl)}</span>
          </li>
        </ul>
      </div>

      <Link href="/" className="btn btn-primary btn-big">
        {t("hosp.checkBill")}
      </Link>
    </article>
  );
}
