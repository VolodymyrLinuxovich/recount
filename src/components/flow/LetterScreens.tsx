"use client";

// Phase 3 and 4: the patient's details, one letter per screen, then how to send them.
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { DetailsForm, useDetails } from "../DetailsForm";
import { useT } from "../i18n/I18nProvider";
import { leftovers } from "../letterFill";
import { LetterSheet } from "../Letters";
import { PrintLetters } from "../PrintLetters";
import { SendGuide } from "../SendGuide";
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
  const [details, setDetails] = useDetails(c);
  // Only the patient's own details count here; amounts or dates of service are theirs to check in the letter.
  const asks = (c.letters ?? []).some((l) => leftovers(l).some((x) => x.slot && x.slot !== "date"));
  return (
    <StepFrame phase={3} title={t("flow.detailsH")} primary={{ label: t("flow.next"), onClick: next }} onBack={back}>
      {asks ? <DetailsForm details={details} onChange={setDetails} bare /> : <p className="flow-note">{t("flow.detailsNone")}</p>}
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
  const [failed, setFailed] = useState(false);
  const approved = c.status === "approved";
  const letter = letters[index];
  if (!letter) return <StepFrame phase={3} onBack={back} />;

  const last = index === letters.length - 1;
  const title = lang === "en" ? letter.title : t(letter.kind === "assistance" ? "letters.titleAssist" : "letters.titleDispute");

  const onApprove = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await approve({ id: c._id as Id<"cases">, token: c.token, letters: forApproval(letters) });
      clear();
      go("send");
    } catch {
      setFailed(true);
    } finally {
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
      ? { label: busy ? t("letters.saving") : t("letters.approve"), onClick: onApprove, busy }
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
      <PrintLetters c={c} letters={letters} name={details.name} />
      {failed && (
        <p className="error-note" role="alert">
          {t("flow.approveFailed")}
        </p>
      )}
      {!approved && last && <p className="flow-reassure">{t("flow.nothingSent")}</p>}
    </StepFrame>
  );
}

export function SendStep({ c, go }: ScreenProps) {
  const { t } = useT();
  const [details] = useDetails(c);
  const { letters } = useLetters(c, details);
  const phone = c.bill?.billingPhone ?? c.hospital?.fap?.phone ?? null;
  return (
    <StepFrame
      phase={4}
      title={t("flow.sendH")}
      primary={phone ? { label: `${t("flow.callBilling")} ${phone}`, href: `tel:${phone.replace(/[^0-9+]/g, "")}` } : undefined}
      secondary={{ label: t("flow.seeLettersAgain"), onClick: () => go("letter-0") }}
    >
      <p className="flow-done">
        <span aria-hidden="true">✓</span> {t("flow.readyToSend")}
      </p>
      <SendGuide c={c} letters={letters} />
      <PrintLetters c={c} letters={letters} name={details.name} />
    </StepFrame>
  );
}
