"use client";

// After sending: what happens next, a day to check in, and a complaint to the state
// (HCAI's Hospital Bill Complaint Program) if the hospital says no or never answers.
// Every rule shown here is in pipeline/out/ca_law.json or on HCAI's pages. Recount never files anything.
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { HCAI_ADDRESS, HCAI_COMPLAINT_URL, HCAI_MAIL_URL } from "../../../convex/lib/complaint";
import { useDetails } from "../DetailsForm";
import { useT } from "../i18n/I18nProvider";
import { joinList, type Key } from "../i18n/strings";
import { fillLetter, leftovers } from "../letterFill";
import { LetterSheet, SLOT_KEY } from "../Letters";
import { privateLink } from "../bills/myBills";
import { shortDate, type ComplaintLetter, type Outcome } from "../types";
import { checkInIcs, daysFromToday, downloadIcs, isoDay } from "./ics";
import { StepFrame } from "./StepFrame";
import type { ScreenProps } from "./types";
import "../letters.css";
import "./letters-flow.css";
import "./followup.css";

const HCA_PHONE = "1-888-804-3536";
const FORM_EN = "https://hcai.ca.gov/document/560-legal-hbcp-hospital-bill-complaint-form-english/";
const FORM_ES = "https://hcai.ca.gov/document/560-legal-hbcp-hospital-bill-complaint-form-espanol/";

// The rules on the "what happens next" screen, each with where it comes from (see ca_law.json).
const RULES: { h: Key; p: Key[]; cite: string; url: string }[] = [
  { h: "after.reviewH", p: ["after.review", "after.anyTime"], cite: "HSC 127405(e)", url: "https://codes.findlaw.com/ca/health-and-safety-code/hsc-sect-127405/" },
  { h: "after.collectH", p: ["after.collect"], cite: "HSC 127425(f), (g)", url: "https://codes.findlaw.com/ca/health-and-safety-code/hsc-sect-127425/" },
  { h: "after.refundH", p: ["after.refund"], cite: "HSC 127440", url: "https://codes.findlaw.com/ca/health-and-safety-code/hsc-sect-127440/" },
];

function Cite({ cite, url }: { cite: string; url: string }) {
  const { t } = useT();
  return (
    <a href={url} target="_blank" rel="noreferrer" className="found-src fu-src">
      {t("found.source")}: {cite}
      <span className="visually-hidden"> {t("send.opensNew")}</span>
    </a>
  );
}

export function AfterStep({ c, go }: ScreenProps) {
  const { t } = useT();
  return (
    <StepFrame phase={4} title={t("after.h")} primary={{ label: t("after.saidNo"), onClick: () => go("outcome") }} onBack={() => go("send")}>
      <ol className="fu-rules">
        {RULES.map((r) => (
          <li key={r.h} className="fu-rule">
            <h2 className="fu-h">{t(r.h)}</h2>
            {r.p.map((k) => (
              <p key={k} className="fu-p">
                {t(k)}
              </p>
            ))}
            <Cite cite={r.cite} url={r.url} />
          </li>
        ))}
        <li className="fu-rule">
          <h2 className="fu-h">{t("after.noH")}</h2>
          <p className="fu-p">{t("after.no")}</p>
          <p className="fu-p">{t("after.help", { phone: HCA_PHONE })}</p>
          <a href={HCAI_COMPLAINT_URL} target="_blank" rel="noreferrer" className="found-src fu-src">
            {t("after.sourceHcai")}
            <span className="visually-hidden"> {t("send.opensNew")}</span>
          </a>
        </li>
      </ol>
      <CheckIn c={c} />
    </StepFrame>
  );
}

/** Pick a day to check in: save it on the bill, and offer a calendar file. */
function CheckIn({ c }: { c: ScreenProps["c"] }) {
  const { t, lang } = useT();
  const setCheckIn = useMutation(api.followUp.setCheckIn);
  const [day, setDay] = useState(() => c.checkInOn ?? daysFromToday(30));
  const [state, setState] = useState<"idle" | "busy" | "saved" | "failed">(c.checkInOn ? "saved" : "idle");
  const today = isoDay(new Date());
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(day) && day > today;

  const save = async (calendar: boolean) => {
    if (!valid || state === "busy") return;
    // The calendar file needs no server, so it's offered even if saving fails.
    if (calendar) {
      const hospital = c.hospital?.name ?? c.bill?.hospitalName ?? "Recount";
      downloadIcs(
        "recount-check-in.ics",
        checkInIcs({
          day,
          title: t("after.calTitle", { hospital }),
          description: t("after.calBody"),
          url: c.token ? privateLink(c._id, c.token) : undefined,
          uid: `${c._id}-check-in`,
        }),
      );
    }
    setState("busy");
    try {
      await setCheckIn({ id: c._id as Id<"cases">, token: c.token, on: day });
      setState("saved");
    } catch {
      setState("failed");
    }
  };

  return (
    <section className="fu-remind" aria-labelledby="fu-remind-h">
      <h2 id="fu-remind-h" className="fu-h">
        {t("after.remindH")}
      </h2>
      <p className="fu-p">{t("after.remindLede")}</p>
      <label className="fu-date">
        <span className="q-label-sm">{t("after.remindLabel")}</span>
        <input
          type="date"
          value={day}
          min={daysFromToday(1)}
          onChange={(e) => {
            setDay(e.target.value);
            if (state !== "busy") setState("idle");
          }}
          aria-invalid={!valid || undefined}
          aria-describedby={!valid ? "fu-date-err" : undefined}
        />
      </label>
      {!valid && (
        <p id="fu-date-err" className="error-note">
          {t("after.badDate")}
        </p>
      )}
      <div className="fu-remind-actions">
        <button type="button" className="btn btn-big" onClick={() => save(true)} disabled={!valid || state === "busy"}>
          {t("after.addCal")}
        </button>
        <button type="button" className="link-btn" onClick={() => save(false)} disabled={!valid || state === "busy"}>
          {t("after.saveOnly")}
        </button>
      </div>
      <p className="fu-status" role="status">
        {state === "saved" && valid ? t("after.saved", { date: shortDate(day, lang) }) : state === "failed" ? t("after.saveFailed") : ""}
      </p>
    </section>
  );
}

const CHOICES: { o: Outcome; k: Key }[] = [
  { o: "denied", k: "after.oDenied" },
  { o: "no_reply", k: "after.oNoReply" },
  { o: "collections", k: "after.oCollections" },
];

/** One question: what did the hospital do? Then we draft the complaint. */
export function OutcomeStep({ c, go }: ScreenProps) {
  const { t } = useT();
  const start = useMutation(api.followUp.startComplaint);
  const [outcome, setOutcome] = useState<Outcome | null>(c.followUp?.outcome ?? null);
  const [sentOn, setSentOn] = useState(() => c.followUp?.sentOn ?? (c.approvedAt ? isoDay(new Date(c.approvedAt)) : ""));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const today = isoDay(new Date());
  const okDate = !sentOn || (/^\d{4}-\d{2}-\d{2}$/.test(sentOn) && sentOn <= today);

  const onWrite = async () => {
    if (!outcome || !okDate || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await start({ id: c._id as Id<"cases">, token: c.token, outcome, sentOn: sentOn || null });
      go("complaint");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepFrame
      phase={4}
      title={t("after.outcomeH")}
      primary={{ label: t("after.write"), onClick: onWrite, busy, disabled: !outcome || !okDate, hint: !outcome ? t("after.pickOne") : null }}
      onBack={() => go("after")}
    >
      <p className="flow-note">{t("after.outcomeLede")}</p>
      <div className="choice choice-big fu-choices" role="group" aria-label={t("after.outcomeH")}>
        {CHOICES.map(({ o, k }) => (
          <button key={o} type="button" aria-pressed={outcome === o} onClick={() => setOutcome(o)}>
            {t(k)}
          </button>
        ))}
      </div>
      <label className="fu-date fu-sent">
        <span className="q-label-sm">{t("after.sentOnLabel")}</span>
        <input type="date" value={sentOn} max={today} onChange={(e) => setSentOn(e.target.value)} aria-invalid={!okDate || undefined} />
        <span className="quiet">{t("after.sentOnHint")}</span>
      </label>
      {failed && (
        <p className="error-note" role="alert">
          {t("flow.approveFailed")}
        </p>
      )}
    </StepFrame>
  );
}

/** The backend's "FILL_IN: Please fill in [X] before approving." as plain text, or null for other errors. */
function fillInMessage(err: unknown): string | null {
  const text = err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : String(err);
  const m = /FILL_IN:\s*([^\n]+)/.exec(text);
  return m ? m[1].replace(/\s+at\s.*$/, "").trim() : null;
}

export function ComplaintStep({ c, go }: ScreenProps) {
  const { t, lang } = useT();
  const [details] = useDetails(c);
  const approve = useMutation(api.followUp.approveComplaint);
  const unapprove = useMutation(api.followUp.unapproveComplaint);
  const [edit, setEdit] = useState<ComplaintLetter | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const f = c.followUp;

  if (!f || f.status === "drafting" || !f.letter) {
    return (
      <StepFrame phase={4} title={t("after.writing")} onBack={() => go("outcome")}>
        <p className="flow-wait pulse">{t("flow.writingBody")}</p>
      </StepFrame>
    );
  }

  const approved = f.status === "approved";
  const letter = fillLetter(approved ? f.letter : (edit ?? f.letter), details);
  const blanks = [...new Set(leftovers(letter).map((x) => (x.slot && x.slot !== "date" ? t(SLOT_KEY[x.slot]) : x.label)))];

  const onApprove = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const { kind, title, subject, body, subjectPatient, bodyPatient } = letter;
      await approve({
        id: c._id as Id<"cases">,
        token: c.token,
        letter: { kind, title, subject, body, ...(subjectPatient != null ? { subjectPatient } : {}), ...(bodyPatient != null ? { bodyPatient } : {}) },
      });
      setEdit(null);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setFailed(fillInMessage(err) ?? t("flow.approveFailed"));
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

  return (
    <StepFrame
      phase={4}
      title={t("after.complaintTitle")}
      primary={
        approved
          ? { label: t("after.openPage"), href: HCAI_COMPLAINT_URL }
          : {
              label: busy ? t("letters.saving") : t("after.approve"),
              onClick: onApprove,
              busy,
              disabled: blanks.length > 0,
              hint: blanks.length ? t("flow.approveBlocked", { list: joinList(lang, blanks) }) : null,
            }
      }
      secondary={approved ? { label: busy ? t("letters.saving") : t("after.change"), onClick: onChange, disabled: busy } : undefined}
      onBack={() => go("outcome")}
    >
      {approved ? <p className="flow-note">{t("after.approvedNote")}</p> : <p className="flow-note">{t("after.scope")}</p>}
      <div className="flow-letter">
        <LetterSheet letter={letter} onChange={setEdit} readOnly={approved} inFlow />
      </div>
      {failed && (
        <p className="error-note" role="alert">
          {failed}
        </p>
      )}
      {approved ? <HowToFile /> : <p className="flow-reassure">{t("after.never")}</p>}
      <nav className="fu-done" aria-label={t("after.doneH")}>
        <p className="fu-done-h">{t("after.doneH")}</p>
        <div className="fu-done-links">
          <Link href="/bills" className="rc-btn rc-btn--secondary">
            {t("after.toBills")}
          </Link>
          <Link href="/" className="rc-btn rc-btn--secondary">
            {t("after.toHome")}
          </Link>
        </div>
      </nav>
    </StepFrame>
  );
}

function HowToFile() {
  const { t } = useT();
  return (
    <section className="fu-file" aria-labelledby="fu-file-h">
      <h2 id="fu-file-h" className="fu-h">
        {t("after.fileH")}
      </h2>
      <p className="fu-p">{t("after.never")}</p>
      <p className="fu-p">{t("after.fileOnline")}</p>
      <p className="fu-p">{t("after.fileMail")}</p>
      <address className="fu-address">
        {HCAI_ADDRESS.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </address>
      <p className="fu-p">{t("after.attach")}</p>
      <p className="fu-links">
        <a href={FORM_EN} target="_blank" rel="noreferrer">
          {t("after.formEn")}
          <span className="visually-hidden"> {t("send.opensNew")}</span>
        </a>
        <a href={FORM_ES} target="_blank" rel="noreferrer" hrefLang="es">
          {t("after.formEs")}
          <span className="visually-hidden"> {t("send.opensNew")}</span>
        </a>
        <a href={HCAI_MAIL_URL} target="_blank" rel="noreferrer">
          {t("after.sourceHcai")}
          <span className="visually-hidden"> {t("send.opensNew")}</span>
        </a>
      </p>
      <p className="fu-p">{t("after.help", { phone: HCA_PHONE })}</p>
    </section>
  );
}
