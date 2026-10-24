"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "./i18n/I18nProvider";
import { translate } from "./i18n/strings";
import { printLetters } from "./PrintLetters";
import type { CaseView, Letter } from "./types";
import "./letters.css";

type StepKey = "call" | "send" | "pause" | "apply";
const ORDER: StepKey[] = ["call", "send", "pause", "apply"];

const stepsKey = (id: string) => `recount.sendsteps.${id}`;
const notesKey = (id: string) => `recount.notes.${id}`;

function readDone(id: string): StepKey[] {
  try {
    const data: unknown = JSON.parse(
      window.localStorage.getItem(stepsKey(id)) ?? "[]",
    );
    return Array.isArray(data) ? ORDER.filter((k) => data.includes(k)) : [];
  } catch {
    return [];
  }
}

function writeDone(id: string, done: StepKey[]) {
  try {
    if (done.length)
      window.localStorage.setItem(stepsKey(id), JSON.stringify(done));
    else window.localStorage.removeItem(stepsKey(id));
  } catch {
    // Storage is blocked; the ticks stay for this visit.
  }
}

function readNotes(id: string) {
  try {
    return window.localStorage.getItem(notesKey(id)) ?? "";
  } catch {
    return "";
  }
}

/** Which send steps are ticked for this bill, kept in this browser. */
export function useSendSteps(id: string) {
  // The guide renders only after the case loads in the browser, so storage is there to read.
  const [done, setDone] = useState<StepKey[]>(() =>
    typeof window === "undefined" ? [] : readDone(id),
  );
  const set = (k: StepKey, on: boolean) => {
    const next = ORDER.filter((x) => (x === k ? on : done.includes(x)));
    setDone(next);
    writeDone(id, next);
    return next;
  };
  return {
    done,
    set,
    total: ORDER.length,
    allDone: done.length === ORDER.length,
  };
}

function Tick({ done }: { done: boolean }) {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" className="sg-tick-ring" />
      {done && <path d="M9.5 16.5l4.5 4.5 8.5-9" className="sg-tick-mark" />}
    </svg>
  );
}

/** Call notes, kept only in this browser. */
function Notes({ id }: { id: string }) {
  const { t } = useT();
  const [text, setText] = useState(() =>
    typeof window === "undefined" ? "" : readNotes(id),
  );
  return (
    <label className="send-notes">
      <span className="send-notes-label">{t("send.noteLabel")}</span>
      <textarea
        value={text}
        rows={3}
        placeholder={t("send.notesPlaceholder")}
        onChange={(e) => {
          setText(e.target.value);
          try {
            if (e.target.value)
              window.localStorage.setItem(notesKey(id), e.target.value);
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

/**
 * What to do after approving, as a checklist: one step open at a time, a circle to tick each one.
 * Nothing here sends anything by itself.
 */
export function SendGuide({
  c,
  letters,
  steps: given,
}: {
  c: CaseView;
  letters: Letter[];
  /** The ticks, when the screen around the guide needs them too. */
  steps?: ReturnType<typeof useSendSteps>;
}) {
  const { t, lang } = useT();
  const own = useSendSteps(c._id);
  const { done, set, total, allDone } = given ?? own;
  const [open, setOpen] = useState<StepKey | null>(
    () => ORDER.find((k) => !done.includes(k)) ?? null,
  );
  const [ask, setAsk] = useState(false);
  const [later, setLater] = useState(false);
  const [showNote, setShowNote] = useState(
    () => typeof window !== "undefined" && !!readNotes(c._id),
  );
  const calling = useRef(false);
  const askRef = useRef<HTMLDivElement>(null);

  // Bring what just appeared (the "Did you reach them?" question, the next step) into view.
  const reveal = (el: Element | null) => {
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({
      block: "nearest",
      behavior: still ? "auto" : "smooth",
    });
  };
  useEffect(() => {
    if (ask) reveal(askRef.current);
  }, [ask]);

  const phone = c.bill?.billingPhone ?? c.hospital?.fap?.phone ?? null;
  const policyUrl = c.hospital?.fap?.url ?? null;
  const applicationUrl = c.hospital?.fap?.applicationUrl ?? null;
  const mailto = (l: Letter) =>
    `mailto:?subject=${encodeURIComponent(l.subject)}&body=${encodeURIComponent(l.body)}`;
  const nameOf = (l: Letter) =>
    lang === "en"
      ? l.title
      : t(
          l.kind === "assistance"
            ? "letters.titleAssist"
            : "letters.titleDispute",
        );

  // After tapping Call, the phone app takes over. When the patient comes back to this page, ask how it went.
  useEffect(() => {
    const back = () => {
      if (!calling.current || document.visibilityState !== "visible") return;
      calling.current = false;
      setAsk(true);
      setOpen("call");
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, []);

  const mark = (k: StepKey, on: boolean, advance = true) => {
    const next = set(k, on);
    if (on && advance) openStep(ORDER.find((x) => !next.includes(x)) ?? null);
  };
  const openStep = (k: StepKey | null) => {
    setOpen(k);
    if (k)
      requestAnimationFrame(() =>
        reveal(document.getElementById(`sg-card-${k}`)),
      );
  };

  const titles: Record<StepKey, string> = {
    call: t("send.step1H"),
    send: t("send.step2H"),
    pause: t("send.step3H"),
    apply: t("send.step4H"),
  };
  const doneLines: Record<StepKey, string> = {
    call: t("send.step1Done"),
    send: t("send.step2Done"),
    pause: t("send.step3Done"),
    apply: t("send.step4Done"),
  };

  const card = (k: StepKey, n: number, body: React.ReactNode) => {
    const isDone = done.includes(k);
    const isOpen = open === k;
    const bodyId = `sg-${k}`;
    return (
      <li
        key={k}
        id={`sg-card-${k}`}
        className={`sg-card${isDone ? " done" : ""}${isOpen ? " open" : ""}`}
      >
        <div className="sg-head">
          <button
            type="button"
            className="sg-tick"
            aria-pressed={isDone}
            aria-label={t("send.tick", { title: titles[k], done: isDone })}
            onClick={() => mark(k, !isDone)}
          >
            <Tick done={isDone} />
          </button>
          <button
            type="button"
            className="sg-title"
            aria-expanded={isOpen}
            aria-controls={bodyId}
            onClick={() => setOpen(isOpen ? null : k)}
          >
            <span className="sg-title-text">
              <span className="visually-hidden">{n}. </span>
              {titles[k]}
            </span>
            {isDone && <span className="sg-done-line">{doneLines[k]}</span>}
            <span className="sg-chev" aria-hidden="true" />
          </button>
        </div>
        {isOpen && (
          <div className="sg-body" id={bodyId}>
            {body}
          </div>
        )}
      </li>
    );
  };

  const doneButton = (k: StepKey, label: string) =>
    done.includes(k) ? (
      <button type="button" className="sg-undo" onClick={() => mark(k, false)}>
        {t("send.undo")}
      </button>
    ) : (
      <button
        type="button"
        className="btn btn-big sg-done-btn"
        onClick={() => mark(k, true)}
      >
        <span aria-hidden="true">✓</span>&nbsp;{label}
      </button>
    );

  return (
    <div className="sg">
      <div className="sg-progress" role="status">
        <span className="sg-progress-text">
          {t("send.progress", { n: done.length, total })}
        </span>
        <span className="sg-progress-bar" aria-hidden="true">
          <span style={{ width: `${(done.length / total) * 100}%` }} />
        </span>
      </div>
      {!allDone && <p className="sg-lede">{t("send.lede")}</p>}

      {allDone && (
        <div className="sg-all">
          <svg
            viewBox="0 0 52 52"
            width="52"
            height="52"
            aria-hidden="true"
            className="sg-all-check"
          >
            <circle cx="26" cy="26" r="23" />
            <path d="M15 27l7.5 7.5L37.5 19" />
          </svg>
          <p className="sg-all-h">{t("send.allDoneH")}</p>
          <p className="sg-all-p">{t("send.allDone")}</p>
          <Link href="/bills" className="btn btn-big btn-quiet">
            {t("send.allDoneLink")}
          </Link>
        </div>
      )}

      <ol className="sg-list">
        {card(
          "call",
          1,
          <>
            <p className="sg-p">{t("send.step1")}</p>
            <p className="send-ask">{t("send.step1Ask")}</p>
            {lang !== "en" && (
              <p className="quiet send-ask-en">
                {t("send.inEnglish")}{" "}
                <span lang="en">{translate("en", "send.step1Ask")}</span>
              </p>
            )}
            {phone ? (
              <>
                {/* A computer can't place the call: show the number to dial from a phone (CSS picks one). */}
                <p className="sg-call-desk">
                  {t("send.callFromPhone", { phone: "\u0000" })
                    .split("\u0000")
                    .map((part, i) =>
                      i === 0
                        ? part
                        : [
                            <strong key="n" className="sg-call-num">
                              {phone}
                            </strong>,
                            part,
                          ],
                    )}
                </p>
                <a
                  href={`tel:${phone.replace(/[^0-9+]/g, "")}`}
                  className="btn btn-primary btn-big sg-call"
                  onClick={() => {
                    calling.current = true;
                    setAsk(false);
                    setLater(false);
                  }}
                >
                  {t("send.call")}&nbsp;
                  <span className="send-phone">{phone}</span>
                </a>
              </>
            ) : (
              <p className="quiet">{t("send.noPhone")}</p>
            )}
            {ask && (
              <div
                className="sg-ask"
                ref={askRef}
                role="group"
                aria-label={t("send.reachedQ")}
              >
                <p className="sg-ask-q">{t("send.reachedQ")}</p>
                <div className="sg-ask-row">
                  <button
                    type="button"
                    className="btn btn-big"
                    onClick={() => {
                      setAsk(false);
                      setShowNote(true);
                      mark("call", true, false);
                    }}
                  >
                    {t("send.reachedYes")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-big btn-quiet"
                    onClick={() => {
                      setAsk(false);
                      setLater(true);
                    }}
                  >
                    {t("send.reachedNo")}
                  </button>
                </div>
              </div>
            )}
            {later && <p className="sg-p quiet">{t("send.later")}</p>}
            {showNote ? (
              <Notes id={c._id} />
            ) : (
              <button
                type="button"
                className="sg-undo"
                onClick={() => setShowNote(true)}
              >
                {t("send.addNote")}
              </button>
            )}
            <p className="quiet sg-small">{t("send.step1Parent")}</p>
            {done.includes("call") ? (
              <button
                type="button"
                className="btn btn-big sg-done-btn"
                onClick={() =>
                  openStep(ORDER.find((x) => !done.includes(x)) ?? null)
                }
              >
                {t("flow.next")}
              </button>
            ) : (
              !ask && doneButton("call", t("send.reachedYes"))
            )}
          </>,
        )}

        {card(
          "send",
          2,
          <>
            <p className="sg-p">{t("send.step2")}</p>
            {letters.length > 1 && (
              <button
                type="button"
                className="btn btn-big sg-print-all"
                onClick={() => printLetters("all", "Letters")}
              >
                {t("print.all")}
              </button>
            )}
            <ul className="sg-letters">
              {letters.map((l) => (
                <li key={l.kind} className="sg-letter">
                  <span className="sg-letter-name">{nameOf(l)}</span>
                  <span className="sg-letter-btns">
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => printLetters(l.kind, l.title)}
                    >
                      {t("send.print")}
                    </button>
                    <a href={mailto(l)} className="btn btn-quiet">
                      {t("send.email")}
                    </a>
                  </span>
                </li>
              ))}
            </ul>
            <p className="quiet sg-small">{t("send.emailTo")}</p>
            <p className="quiet sg-small">{t("send.step2Mail")}</p>
            {doneButton("send", t("send.step2Btn"))}
          </>,
        )}

        {card(
          "pause",
          3,
          <>
            <p className="sg-p">{t("send.step3")}</p>
            <p className="sg-say">{t("send.say")}</p>
            <p className="send-ask" lang="en">
              {translate("en", "send.step3Ask")}
            </p>
            {lang !== "en" && (
              <p className="quiet sg-small">{t("send.step3Ask")}</p>
            )}
            {doneButton("pause", t("send.step3Btn"))}
          </>,
        )}

        {card(
          "apply",
          4,
          <>
            <p className="sg-p">{t("send.step4")}</p>
            {(applicationUrl || policyUrl) && (
              <div className="sg-links">
                {applicationUrl && (
                  <a
                    href={applicationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="sg-link"
                  >
                    {t("send.applicationLink")} ↗
                    <span className="visually-hidden">
                      {" "}
                      {t("send.opensNew")}
                    </span>
                  </a>
                )}
                {policyUrl && (
                  <a
                    href={policyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="sg-link"
                  >
                    {t("send.policyLink")} ↗
                    <span className="visually-hidden">
                      {" "}
                      {t("send.opensNew")}
                    </span>
                  </a>
                )}
              </div>
            )}
            {doneButton("apply", t("send.step4Btn"))}
          </>,
        )}
      </ol>
    </div>
  );
}
