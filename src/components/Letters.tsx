"use client";

import { useMutation } from "convex/react";
import { useLayoutEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useT } from "./i18n/I18nProvider";
import type { CaseView, Letter } from "./types";

// What gets copied, downloaded and emailed is the English letter for the hospital.
function asText(l: Letter) {
  return `Subject: ${l.subject}\n\n${l.body}\n`;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A textarea that grows to show all of its text. */
function GrowingText(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

function LetterSheet({
  letter,
  onChange,
  readOnly,
}: {
  letter: Letter;
  onChange: (l: Letter) => void;
  readOnly: boolean;
}) {
  const { t, lang } = useT();
  const [copied, setCopied] = useState(false);
  const title = lang === "en" ? letter.title : t(letter.kind === "assistance" ? "letters.titleAssist" : "letters.titleDispute");
  const patientCopy = letter.bodyPatient ? [letter.subjectPatient, letter.bodyPatient].filter(Boolean).join("\n\n") : null;
  const slug = letter.kind === "assistance" ? "financial-assistance-request" : "billing-questions";
  return (
    <article className="letter">
      <h3 className="letter-title">{title}</h3>
      {lang !== "en" && <p className="quiet letter-lang-note">{t("letters.sentInEnglish")}</p>}
      <label className="letter-field">
        <span>{t("letters.subject")}</span>
        <GrowingText
          className="letter-subject"
          value={letter.subject}
          readOnly={readOnly}
          onChange={(e) => onChange({ ...letter, subject: e.target.value.replace(/\n/g, " ") })}
        />
      </label>
      <GrowingText
        className="letter-body"
        value={letter.body}
        readOnly={readOnly}
        lang="en"
        aria-label={t("letters.bodyLabel", { title })}
        onChange={(e) => onChange({ ...letter, body: e.target.value })}
      />
      <div className="row">
        <button
          className="btn btn-quiet"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(asText(letter));
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? t("letters.copied") : t("letters.copy")}
        </button>
        <button className="btn btn-quiet" type="button" onClick={() => download(`${slug}.txt`, asText(letter))}>
          {t("letters.download")}
        </button>
      </div>
      {patientCopy && (
        <div className="letter-patient-copy" lang="es">
          <h4 className="letter-patient-h">{t("letters.patientCopyH")}</h4>
          <p className="quiet">{t("letters.patientCopyNote")}</p>
          <div className="letter-patient-text">{patientCopy}</div>
        </div>
      )}
    </article>
  );
}

export function Letters({ c }: { c: CaseView }) {
  const { t } = useT();
  const approve = useMutation(api.cases.approve);
  const [edits, setEdits] = useState<Letter[] | null>(null);
  const [busy, setBusy] = useState(false);
  const letters = edits ?? c.letters ?? null;
  const approved = c.status === "approved";
  const phone = c.bill?.billingPhone ?? c.hospital?.fap?.phone ?? null;

  if (!letters) {
    return (
      <section className="letters">
        <h2 className="h-section">{t("letters.h")}</h2>
        <p className="quiet pulse">{t("letters.writing")}</p>
      </section>
    );
  }

  const update = (i: number, l: Letter) => setEdits(letters.map((x, j) => (j === i ? l : x)));
  const mailto = (l: Letter) => `mailto:?subject=${encodeURIComponent(l.subject)}&body=${encodeURIComponent(l.body)}`;

  return (
    <section className="letters" aria-labelledby="letters-h">
      <div className="section-head">
        <h2 id="letters-h" className="h-section">
          {approved ? t("letters.ready") : t("letters.h")}
        </h2>
        <span className="label">{c.lettersSource === "claude" ? t("letters.srcClaude") : t("letters.srcTemplate")}</span>
      </div>

      {approved ? (
        <div className="send">
          <p>{t("letters.approvedNote")}</p>
          {phone && (
            <p>
              {t("letters.callFirst")}{" "}
              <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`} className="phone">
                {phone}
              </a>
            </p>
          )}
          <div className="row">
            {letters.map((l) => (
              <a key={l.kind} href={mailto(l)} className="btn btn-primary">
                {l.kind === "assistance" ? t("letters.emailAssist") : t("letters.emailDispute")}
              </a>
            ))}
          </div>
        </div>
      ) : (
        <p className="lede">{t("letters.lede")}</p>
      )}

      {letters.map((l, i) => (
        <LetterSheet key={l.kind + i} letter={l} onChange={(nl) => update(i, nl)} readOnly={approved} />
      ))}

      {!approved && (
        <button
          className="btn btn-primary btn-big"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await approve({ id: c._id as Id<"cases">, letters });
              requestAnimationFrame(() => document.getElementById("letters-h")?.scrollIntoView({ behavior: "smooth", block: "start" }));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t("letters.saving") : t("letters.approve")}
        </button>
      )}
    </section>
  );
}
