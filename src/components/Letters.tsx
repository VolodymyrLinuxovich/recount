"use client";

import { useMutation } from "convex/react";
import { useLayoutEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useT } from "./i18n/I18nProvider";
import { PrintLetters, printLetters } from "./PrintLetters";
import { SendGuide } from "./SendGuide";
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
      <button className="btn btn-big letter-print" type="button" onClick={() => printLetters(letter.kind, letter.title)}>
        {t("print.one")}
      </button>
      {/\[[^\]\n]+\]/.test(letter.subject + letter.body) && <p className="quiet letter-print-note">{t("print.brackets")}</p>}
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
  const unapprove = useMutation(api.cases.unapprove);
  const [edits, setEdits] = useState<Letter[] | null>(null);
  const [busy, setBusy] = useState(false);
  const letters = edits ?? c.letters ?? null;
  const approved = c.status === "approved";

  if (!letters) {
    return (
      <section className="letters">
        <h2 className="h-section">{t("letters.h")}</h2>
        <p className="quiet pulse">{t("letters.writing")}</p>
      </section>
    );
  }

  const update = (i: number, l: Letter) => setEdits(letters.map((x, j) => (j === i ? l : x)));

  return (
    <section className="letters" aria-labelledby="letters-h">
      <div className="section-head">
        <h2 id="letters-h" className="h-section">
          {approved ? t("letters.ready") : t("letters.h")}
        </h2>
        <span className="label">{c.lettersSource === "claude" ? t("letters.srcClaude") : t("letters.srcTemplate")}</span>
      </div>

      {approved ? (
        <>
          <SendGuide c={c} letters={letters} />
          <button
            type="button"
            className="btn btn-quiet btn-big"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await unapprove({ id: c._id as Id<"cases">, token: c.token! });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t("letters.saving") : t("letters.change")}
          </button>
        </>
      ) : (
        <p className="lede">{t("letters.lede")}</p>
      )}

      <PrintLetters c={c} letters={letters} />

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
              // approve accepts only these fields; drop anything else the letters carry.
              const clean = letters.map(({ kind, title, subject, body, subjectPatient, bodyPatient }) => ({
                kind,
                title,
                subject,
                body,
                ...(subjectPatient != null ? { subjectPatient } : {}),
                ...(bodyPatient != null ? { bodyPatient } : {}),
              }));
              await approve({ id: c._id as Id<"cases">, token: c.token!, letters: clean });
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
