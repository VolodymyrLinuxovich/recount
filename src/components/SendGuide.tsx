"use client";

import { useState } from "react";
import { useT } from "./i18n/I18nProvider";
import { translate } from "./i18n/strings";
import { printLetters } from "./PrintLetters";
import type { CaseView, Letter } from "./types";
import "./letters.css";

const notesKey = (id: string) => `recount.notes.${id}`;

function readNotes(id: string) {
  try {
    return window.localStorage.getItem(notesKey(id)) ?? "";
  } catch {
    return "";
  }
}

/** Call notes, kept only in this browser. */
function Notes({ id }: { id: string }) {
  const { t } = useT();
  // The guide renders only after the case loads in the browser, so storage is there to read.
  const [text, setText] = useState(() => (typeof window === "undefined" ? "" : readNotes(id)));
  return (
    <label className="send-notes">
      <span className="send-notes-label">{t("send.notesLabel")}</span>
      <textarea
        value={text}
        rows={4}
        placeholder={t("send.notesPlaceholder")}
        onChange={(e) => {
          setText(e.target.value);
          try {
            if (e.target.value) window.localStorage.setItem(notesKey(id), e.target.value);
            else window.localStorage.removeItem(notesKey(id));
          } catch {
            // Storage is blocked; the notes stay on screen for this visit.
          }
        }}
      />
      <span className="quiet send-notes-hint">{t("send.notesSaved")}</span>
    </label>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="send-step">
      <span className="send-n" aria-hidden="true">
        {n}
      </span>
      <div className="send-step-body">
        <h4 className="send-step-h">
          <span className="visually-hidden">{n}. </span>
          {title}
        </h4>
        {children}
      </div>
    </li>
  );
}

/** What to do after approving: plain numbered steps. Nothing here sends anything by itself. */
export function SendGuide({ c, letters }: { c: CaseView; letters: Letter[] }) {
  const { t, lang } = useT();
  const phone = c.bill?.billingPhone ?? c.hospital?.fap?.phone ?? null;
  const policyUrl = c.hospital?.fap?.url ?? null;
  const applicationUrl = c.hospital?.fap?.applicationUrl ?? null;
  const mailto = (l: Letter) => `mailto:?subject=${encodeURIComponent(l.subject)}&body=${encodeURIComponent(l.body)}`;
  const printAllTitle = letters.length === 1 ? letters[0].title : "Letters";

  return (
    <div className="send">
      <h3 className="send-h">{t("send.h")}</h3>
      <p className="send-intro">{t("send.intro")}</p>
      <ol className="send-steps">
        <Step n={1} title={t("send.step1H")}>
          <p>{t("send.step1")}</p>
          <p className="send-ask">{t("send.step1Ask")}</p>
          {lang !== "en" && (
            <p className="quiet send-ask-en">
              {t("send.inEnglish")} <span lang="en">{translate("en", "send.step1Ask")}</span>
            </p>
          )}
          {phone ? (
            <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`} className="btn btn-primary btn-big send-call">
              {t("send.call")}&nbsp;<span className="send-phone">{phone}</span>
            </a>
          ) : (
            <p className="quiet">{t("send.noPhone")}</p>
          )}
        </Step>

        <Step n={2} title={t("send.step2H")}>
          <p>{t("send.step2")}</p>
          <p className="quiet">{t("send.step2Mail")}</p>
          <div className="send-actions">
            <button
              type="button"
              className="btn btn-big"
              onClick={() => printLetters("all", printAllTitle)}
            >
              {letters.length > 1 ? t("print.all") : t("print.one")}
            </button>
            {letters.map((l) => (
              <a key={l.kind} href={mailto(l)} className="btn btn-big">
                {l.kind === "assistance" ? t("letters.emailAssist") : t("letters.emailDispute")}
              </a>
            ))}
          </div>
        </Step>

        <Step n={3} title={t("send.step3H")}>
          <p>{t("send.step3")}</p>
        </Step>

        <Step n={4} title={t("send.step4H")}>
          <p>{t("send.step4")}</p>
          <Notes id={c._id} />
        </Step>

        <Step n={5} title={t("send.step5H")}>
          <p>{t("send.step5")}</p>
          {(policyUrl || applicationUrl) && (
            <div className="send-actions">
              {applicationUrl && (
                <a href={applicationUrl} target="_blank" rel="noreferrer" className="btn btn-big btn-quiet">
                  {t("send.applicationLink")}
                  <span className="visually-hidden"> {t("send.opensNew")}</span>
                </a>
              )}
              {policyUrl && (
                <a href={policyUrl} target="_blank" rel="noreferrer" className="btn btn-big btn-quiet">
                  {t("send.policyLink")}
                  <span className="visually-hidden"> {t("send.opensNew")}</span>
                </a>
              )}
            </div>
          )}
        </Step>
      </ol>
    </div>
  );
}
