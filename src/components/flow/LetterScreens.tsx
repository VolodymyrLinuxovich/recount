"use client";

// Phase 3 and 4: the patient's details, one letter per screen, then how to send them.
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { DetailsForm, readWho, saveWho, useDetails, useDetailsMissing, type Who } from "../DetailsForm";
import { useT } from "../i18n/I18nProvider";
import { joinList } from "../i18n/strings";
import { EMPTY_DETAILS, leftovers, saveDetails } from "../letterFill";
import { LetterSheet, SLOT_KEY } from "../Letters";
import { PrintLetters } from "../PrintLetters";
import { SendGuide, useSendSteps } from "../SendGuide";
import type { CaseView, Letter } from "../types";
import { forApproval, useLetters } from "./letterEdits";
import { StepFrame } from "./StepFrame";
import type { ScreenProps } from "./types";
import "../letters.css";
import "./letters-flow.css";

export function LettersWaitStep({ back }: ScreenProps) {
  const { t } = useT();
  return (
    <StepFrame phase={3} title={t("flow.writingH")} onBack={back}>
      <p className="flow-wait pulse">{t("flow.writingBody")}</p>
    </StepFrame>
  );
}

export function DetailsStep({ c, next, back }: ScreenProps) {
  const { t } = useT();
  // Only the patient's own details count here; amounts or dates of service are theirs to check in the letter.
  const asks = (c.letters ?? []).some((l) => leftovers(l).some((x) => x.slot && x.slot !== "date"));
  // Whose bill it is decides what we prefill and what we offer to keep. Asked once per bill.
  const [who, setWho] = useState<Who | null>(() => (typeof window === "undefined" ? null : readWho(c._id)));
  const [asking, setAsking] = useState(false);

  if (!asks)
    return (
      <StepFrame phase={3} title={t("flow.detailsH")} primary={{ label: t("flow.next"), onClick: next }} onBack={back}>
        <p className="flow-note">{t("flow.detailsNone")}</p>
      </StepFrame>
    );

  if (!who || asking) {
    const choose = (w: Who) => {
      // A different person: start over from the bill, not from what was typed for the other one.
      if (who && who !== w) saveDetails(c._id, EMPTY_DETAILS);
      saveWho(c._id, w);
      setWho(w);
      setAsking(false);
    };
    return (
      <StepFrame phase={3} title={t("flow.detailsWhoH")} onBack={asking ? () => setAsking(false) : back}>
        <p className="flow-note">{t("flow.detailsWhoHint")}</p>
        <div className="choice choice-big details-who" role="group" aria-label={t("flow.detailsWhoH")}>
          <button type="button" aria-pressed={who === "self"} onClick={() => choose("self")}>
            {t("flow.detailsWhoSelf")}
          </button>
          <button type="button" aria-pressed={who === "other"} onClick={() => choose("other")}>
            {t("flow.detailsWhoOther")}
          </button>
        </div>
      </StepFrame>
    );
  }

  // Keyed by whose bill it is, so the prefill is worked out again after a change.
  return <DetailsFill key={who} c={c} who={who} next={next} back={back} onChangeWho={() => setAsking(true)} />;
}

function DetailsFill({
  c,
  who,
  next,
  back,
  onChangeWho,
}: {
  c: CaseView;
  who: Who;
  next: () => void;
  back?: () => void;
  onChangeWho: () => void;
}) {
  const { t } = useT();
  const [details, setDetails, { sources, keep }] = useDetails(c);
  // Someone else's details are only kept for next time when the helper asks for it.
  const [remember, setRemember] = useState(who === "self");
  const [tried, setTried] = useState(0);
  const missing = useDetailsMissing(details);
  return (
    <StepFrame
      phase={3}
      title={t(who === "other" ? "flow.detailsHOther" : "flow.detailsH")}
      primary={{
        label: t("flow.next"),
        onClick: () => {
          // Nothing goes on with a field missing: show what's needed and go to the first one.
          if (missing) return setTried((n) => n + 1);
          keep(remember);
          next();
        },
      }}
      onBack={back}
    >
      <p className="details-who-line">
        <span>{t(who === "other" ? "flow.detailsForOther" : "flow.detailsForSelf")}</span>{" "}
        <button type="button" className="details-who-change" onClick={onChangeWho}>
          {t("flow.detailsWhoChange")}
        </button>
      </p>
      {tried > 0 && missing && (
        <p className="details-summary" role="alert">
          {missing}
        </p>
      )}
      <DetailsForm
        details={details}
        onChange={setDetails}
        bare
        sources={sources}
        // The sample's made-up patient isn't kept for the next bill, so there's nothing to tick.
        remember={c.sample ? undefined : remember}
        onRemember={c.sample ? undefined : setRemember}
        tried={tried}
        forOther={who === "other"}
      />
    </StepFrame>
  );
}

/** The brackets still left in the letters, each with the letter it's in. */
function useBlanks(letters: Letter[], here: number) {
  const { t } = useT();
  return letters.flatMap((l, i) =>
    leftovers(l).map((x) => {
      const name = x.slot && x.slot !== "date" ? t(SLOT_KEY[x.slot]) : x.label;
      return letters.length > 1 && i !== here ? `${name} (${t("flow.inLetter", { n: i + 1 })})` : name;
    }),
  );
}

/** The backend's "FILL_IN: Please fill in [X] before approving." as plain text, or null for other errors. */
function fillInMessage(err: unknown): string | null {
  const text = err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : String(err);
  const m = /FILL_IN:\s*([^\n]+)/.exec(text);
  return m ? m[1].replace(/\s+at\s.*$/, "").trim() : null;
}

/** The moment after approving: a check that draws itself, then on to sending. Nothing is sent here. */
function ApprovedMoment({ onContinue }: { onContinue: () => void }) {
  const { t } = useT();
  const h = useRef<HTMLHeadingElement>(null);
  // Moving focus to the heading is what announces the moment to screen readers.
  useEffect(() => h.current?.focus(), []);
  return (
    <StepFrame phase={4} primary={{ label: t("done.continue"), onClick: onContinue }}>
      <div className="approved-moment">
        <svg className="approved-check" viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
          <circle cx="60" cy="60" r="52" className="approved-ring" />
          <path d="M36 62l16 16 32-34" className="approved-mark" />
        </svg>
        <h1 className="approved-h" ref={h} tabIndex={-1}>
          {t("done.h")}
        </h1>
        <p className="approved-p">{t("done.line")}</p>
      </div>
    </StepFrame>
  );
}

export function LetterStep({ c, index, next, back, go }: ScreenProps & { index: number }) {
  const { t, lang } = useT();
  const [details] = useDetails(c);
  const { letters, update, clear } = useLetters(c, details);
  const approve = useMutation(api.cases.approve);
  const unapprove = useMutation(api.cases.unapprove);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<{ text: string; retry: boolean } | null>(null);
  const sending = useRef(false);
  const [moment, setMoment] = useState(false);
  const approved = c.status === "approved";
  const blanks = useBlanks(letters, index);
  const letter = letters[index];
  // Continue replaces this letter's entry, so Back from the send screen doesn't land on an approved letter.
  if (moment) return <ApprovedMoment onContinue={() => go("send", true)} />;
  if (!letter) return <StepFrame phase={3} onBack={back} />;

  const last = index === letters.length - 1;
  const title = lang === "en" ? letter.title : t(letter.kind === "assistance" ? "letters.titleAssist" : "letters.titleDispute");

  const onApprove = async () => {
    // Older hands double tap; one approve at a time.
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailed(null);
    try {
      await approve({ id: c._id as Id<"cases">, token: c.token, letters: forApproval(letters), requireFilled: true });
      clear();
      setMoment(true);
      window.scrollTo({ top: 0 });
    } catch (err) {
      const fill = fillInMessage(err);
      setFailed(fill ? { text: fill, retry: false } : { text: t("flow.approveFailed"), retry: true });
      // Show the letter that still has the blank.
      const first = fill ? /\[[^\]\n]+\]/.exec(fill)?.[0] : null;
      const at = first ? letters.findIndex((l) => `${l.subject}\n${l.body}`.includes(first)) : -1;
      if (at >= 0 && at !== index) go(`letter-${at}`);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const onChange = async () => {
    setBusy(true);
    try {
      await unapprove({ id: c._id as Id<"cases">, token: c.token });
    } finally {
      setBusy(false);
    }
  };

  const primary = approved
    ? last
      ? { label: t("flow.toSend"), onClick: () => go("send") }
      : { label: t("flow.nextLetter"), onClick: next }
    : last
      ? {
          label: busy ? t("letters.saving") : t("letters.approve"),
          onClick: onApprove,
          busy,
          disabled: blanks.length > 0,
          hint: blanks.length ? t("flow.approveBlocked", { list: joinList(lang, [...new Set(blanks)]) }) : null,
        }
      : { label: t("flow.nextLetter"), onClick: next };

  return (
    <StepFrame
      phase={3}
      eyebrow={letters.length > 1 ? t("flow.letterOf", { n: index + 1, total: letters.length }) : undefined}
      title={title}
      primary={primary}
      secondary={approved ? { label: busy ? t("letters.saving") : t("letters.change"), onClick: onChange, disabled: busy } : undefined}
      onBack={back}
    >
      {approved && <p className="flow-note">{t("flow.approvedNote")}</p>}
      <div className="flow-letter">
        <LetterSheet letter={letter} onChange={(l) => update(index, l)} readOnly={approved} inFlow />
      </div>
      {!approved && leftovers(letter).length > 0 && <p className="flow-fill-hint">{t("letters.fillHint")}</p>}
      <PrintLetters c={c} letters={letters} name={details.name} />
      {failed && (
        <div className="flow-failed" role="alert">
          <p className="error-note">{failed.text}</p>
          {failed.retry && (
            <button type="button" className="btn btn-big" onClick={onApprove} disabled={busy}>
              {busy ? t("letters.saving") : t("flow.tryAgain")}
            </button>
          )}
        </div>
      )}
      {!approved && last && <p className="flow-reassure">{t("flow.nothingSent")}</p>}
    </StepFrame>
  );
}

export function SendStep({ c, go }: ScreenProps) {
  const { t } = useT();
  const [details] = useDetails(c);
  const { letters } = useLetters(c, details);
  const steps = useSendSteps(c._id);
  const unapprove = useMutation(api.cases.unapprove);
  const [busy, setBusy] = useState(false);
  const onChange = async () => {
    setBusy(true);
    try {
      await unapprove({ id: c._id as Id<"cases">, token: c.token });
      go("letter-0");
    } finally {
      setBusy(false);
    }
  };
  return (
    <StepFrame
      phase={4}
      title={t("flow.sendH")}
      secondary={{ label: t("flow.seeLettersAgain"), onClick: () => go("letter-0") }}
    >
      <SendGuide c={c} letters={letters} steps={steps} />
      <p className="sg-change">
        <button type="button" className="sg-undo" onClick={onChange} disabled={busy}>
          {busy ? t("letters.saving") : t("letters.change")}
        </button>
      </p>
      <PrintLetters c={c} letters={letters} name={details.name} />
    </StepFrame>
  );
}
