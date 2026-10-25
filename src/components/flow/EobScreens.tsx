"use client";

// The insurance statement (Explanation of Benefits, EOB): add it, wait while it's read,
// then see the key numbers next to the bill's. The rules that compare them run on the server
// (convex/lib/eobChecks.ts, docs/EOB.md); this screen only shows what they found.
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useT } from "../i18n/I18nProvider";
import type { Key } from "../i18n/strings";
import { FileProblem, prepareFile } from "../prepareFile";
import { type CaseView, type Finding, type ParsedEob, money } from "../types";
import { billDue, eobGap, eobNumbersApply, eobStillOwes, isEobKind, targetOf } from "./eobView";
import { findingTitle } from "./FoundScreens";
import { StepFrame } from "./StepFrame";
import { canChangeEob, findingScreens } from "./steps";
import type { ScreenProps } from "./types";
import "./links.css";
import "./found.css";
import "./eob.css";
import { BadDocument } from "./BadDocument";

const isImage = (type: string | undefined, url: string) => (type ? type.startsWith("image/") : /\.(png|jpe?g|webp)$/i.test(url));

/** The picture or file of the statement, if there is one. The sample has its own picture. */
function statementFile(c: CaseView): { url: string; image: boolean } | null {
  if (c.eobFileUrl) return { url: c.eobFileUrl, image: isImage(c.eobFileType, c.eobFileUrl) };
  if (c.eobSource === "sample-source") return { url: "/sample-eob.png", image: true };
  return null;
}

/* ---------- the screen ---------- */

type View = "ask" | "sending" | "reading" | "error" | "result";

export function EobStep({ c, go, back }: ScreenProps) {
  const { t } = useT();
  const generateUploadUrl = useMutation(api.cases.generateUploadUrl);
  const addEob = useMutation(api.cases.addEob);
  const addSampleEob = useMutation(api.cases.addSampleEob);
  const removeEob = useMutation(api.cases.removeEob);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState<null | "file" | "sample" | "remove">(null);
  const [problem, setProblem] = useState<Key | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const changeable = canChangeEob(c);
  const beforeAnswer = c.status === "needs_household" || c.eligibility?.tier === "NEEDS_INFO";
  // Skip, Continue and Keep going all lead on: to the questions first time through, else back to the answer.
  const onward = () => go(beforeAnswer ? "q1" : "answer");
  const onBack = beforeAnswer ? back : () => go("answer");

  const view: View =
    busy === "file" || busy === "sample"
      ? "sending"
      : c.eobStatus === "reading"
        ? "reading"
        : c.eobStatus === "error"
          ? "error"
          : c.eobStatus === "done" && c.eob
            ? "result"
            : "ask";

  // The view changes without the screen changing (reading → result): say the new title,
  // and if the button that had focus is gone, put focus on the title.
  const live = useRef<HTMLParagraphElement>(null);
  const lastView = useRef(view);
  useEffect(() => {
    if (lastView.current === view) return;
    lastView.current = view;
    const title = document.querySelector<HTMLElement>('[data-step="eob"] h1');
    const a = document.activeElement;
    if (title && (!a || a === document.body || !a.isConnected)) title.focus({ preventScroll: true });
    if (live.current) live.current.textContent = document.activeElement === title ? "" : (title?.textContent ?? "");
  }, [view]);

  async function upload(file: Blob): Promise<Id<"_storage">> {
    const url = await generateUploadUrl();
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "image/jpeg" }, body: file });
    if (!res.ok) throw new Error("Upload failed");
    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
    return storageId;
  }

  async function onFile(input: HTMLInputElement | null) {
    const file = input?.files?.[0];
    if (!file || running.current || !changeable) return;
    running.current = true;
    setBusy("file");
    setProblem(null);
    try {
      const { blob, type } = await prepareFile(file);
      const fileId = await upload(blob);
      await addEob({ id: c._id as Id<"cases">, token: c.token, fileId, fileType: type });
    } catch (e) {
      setProblem(e instanceof FileProblem ? e.key : /too many/i.test(String(e)) ? "start.busy" : "eob.uploadFailed");
    } finally {
      running.current = false;
      setBusy(null);
      if (input) input.value = "";
    }
  }

  async function onSample() {
    if (running.current || !changeable) return;
    running.current = true;
    setBusy("sample");
    setProblem(null);
    try {
      await addSampleEob({ id: c._id as Id<"cases">, token: c.token });
    } catch {
      setProblem("eob.uploadFailed");
    } finally {
      running.current = false;
      setBusy(null);
    }
  }

  async function onRemove() {
    if (running.current) return;
    running.current = true;
    setBusy("remove");
    setProblem(null);
    try {
      await removeEob({ id: c._id as Id<"cases">, token: c.token });
      setConfirmRemove(false);
    } catch {
      setProblem("eob.removeFailed");
    } finally {
      running.current = false;
      setBusy(null);
    }
  }

  const inputs = changeable && (
    <>
      {/* The visible buttons open these; they aren't Tab stops of their own. */}
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onFile(e.currentTarget)}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*,application/pdf"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onFile(e.currentTarget)}
      />
    </>
  );
  const problemNote = problem && (
    <p className="error-note" role="alert">
      {t(problem)}
    </p>
  );
  const liveRegion = <p className="visually-hidden" aria-live="polite" ref={live} />;
  const photo = { label: t("eob.photo"), onClick: () => photoInput.current?.click() };
  const skip = { label: t("eob.skip"), onClick: onward };

  if (view === "sending" || view === "reading") {
    const file = statementFile(c);
    return (
      <StepFrame
        phase={2}
        eyebrow={t("eob.eyebrow")}
        title={view === "sending" ? t("eob.sending") : t("eob.readingH")}
        primary={{ label: t("eob.keepGoing"), onClick: onward, disabled: view === "sending" }}
        onBack={onBack}
      >
        <p className="flow-wait pulse" role="status">
          {t("eob.readingBody")}
        </p>
        {view === "reading" && file?.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.url} alt={t("eob.statementAlt")} className="bill-thumb eob-thumb-wait" />
        )}
        {liveRegion}
      </StepFrame>
    );
  }

  if (view === "error") {
    const notEob = /NOT_AN_EOB/.test(c.eobError ?? "");
    return (
      <StepFrame
        phase={2}
        eyebrow={t("eob.eyebrow")}
        title={notEob ? t("eob.notEobH") : t("eob.failedH")}
        primary={changeable ? (c.sample ? { label: t("eob.sample"), onClick: onSample } : { label: t("eob.tryAgain"), onClick: photo.onClick }) : skip}
        secondary={changeable ? skip : undefined}
        onBack={onBack}
      >
        {inputs}
        {notEob && c.eobFileUrl && isImage(c.eobFileType, c.eobFileUrl) && <BadDocument url={c.eobFileUrl} alt={t("eob.statementAlt")} label={t("flow.invalidDoc")} />}
        <p>{notEob ? t("eob.notEobBody") : /TOO_LARGE/.test(c.eobError ?? "") ? t("eob.tooLargeBody") : /APPROVED/.test(c.eobError ?? "") ? t("eob.approvedBody") : t("eob.failedBody")}</p>
        {changeable && (
          <div className="step-links">
            {c.sample && (
              <button type="button" className="link-btn" onClick={photo.onClick}>
                {t("eob.photoInstead")}
              </button>
            )}
            <button type="button" className="link-btn" onClick={() => fileInput.current?.click()}>
              {t("eob.file")}
            </button>
          </div>
        )}
        {problemNote}
        {liveRegion}
      </StepFrame>
    );
  }

  if (view === "result") {
    return (
      <StepFrame phase={2} eyebrow={t("eob.eyebrow")} title={t("eob.resultH")} primary={{ label: t("eob.continue"), onClick: onward }} onBack={onBack}>
        <EobResult c={c} eob={c.eob!} go={go} />
        {c.status === "drafting" && <p className="flow-note">{t("eob.redrafting")}</p>}
        {!changeable && c.status === "approved" && <p className="found-quiet">{t("eob.locked")}</p>}
        {changeable &&
          (confirmRemove ? (
            <div className="eob-remove" role="group" aria-label={t("eob.removeQ")}>
              <p className="eob-remove-q">{t("eob.removeQ")}</p>
              <div className="eob-remove-row">
                <button type="button" className="btn btn-big" onClick={onRemove} disabled={busy === "remove"} aria-busy={busy === "remove" || undefined}>
                  {busy === "remove" ? t("eob.removing") : t("eob.removeYes")}
                </button>
                <button type="button" className="btn btn-big btn-quiet" onClick={() => setConfirmRemove(false)} disabled={busy === "remove"}>
                  {t("eob.removeNo")}
                </button>
              </div>
            </div>
          ) : (
            <div className="step-links">
              <button type="button" className="link-btn" onClick={() => setConfirmRemove(true)}>
                {t("eob.remove")}
              </button>
            </div>
          ))}
        {problemNote}
        {liveRegion}
      </StepFrame>
    );
  }

  // Ask: do you have insurance, and its statement?
  const main = !changeable ? { label: t("eob.continue"), onClick: onward } : c.sample ? { label: busy === "sample" ? t("eob.sampleBusy") : t("eob.sample"), onClick: onSample } : photo;
  return (
    <StepFrame phase={2} eyebrow={t("eob.eyebrow")} title={t("eob.askH")} primary={main} secondary={changeable ? skip : undefined} onBack={onBack}>
      {inputs}
      <div className="eob-hint" aria-hidden="true">
        <span className="eob-hint-kicker">Explanation of Benefits</span>
        <span className="eob-hint-stamp">This is not a bill</span>
        <span className="eob-hint-row" />
        <span className="eob-hint-row short" />
      </div>
      <p>{t("eob.what")}</p>
      <p>{t("eob.why")}</p>
      <p className="quiet">{t("eob.where")}</p>
      {changeable && (
        <div className="step-links">
          {c.sample && (
            <button type="button" className="link-btn" onClick={photo.onClick}>
              {t("eob.photoInstead")}
            </button>
          )}
          <button type="button" className="link-btn" onClick={() => fileInput.current?.click()}>
            {t("eob.file")}
          </button>
        </div>
      )}
      {problemNote}
      {liveRegion}
    </StepFrame>
  );
}

/* ---------- the result: key numbers, then what the rules found ---------- */

function EobResult({ c, eob, go }: { c: CaseView; eob: ParsedEob; go: ScreenProps["go"] }) {
  const { t, lang } = useT();
  const due = billDue(c.bill);
  const owes = eobStillOwes(eob, c.bill);
  // A statement for another visit, or a claim still in process: don't compare its numbers.
  const numbersApply = eobNumbersApply(c.findings ?? []);
  const gap = eobGap(due, owes, c.findings ?? []);
  const file = statementFile(c);
  const amount = (x: number | null) => (x == null ? t("eob.notShown") : money(x, true, lang));
  const net = eob.network === "in" ? t("eob.netIn") : eob.network === "out" ? t("eob.netOut") : t("eob.notShown");

  // Each EOB finding links to its own screen.
  const screens = findingScreens(c);
  const found = (c.findings ?? []).filter((f) => isEobKind(f.kind));
  const screenOf = (f: Finding) => screens.findIndex((s) => s.ids.includes(f.id));

  return (
    <>
      <div className="eob-head">
        {file &&
          (file.image ? (
            <a href={file.url} target="_blank" rel="noreferrer" className="found-thumb eob-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={file.url} alt="" />
              <span>{t("eob.tapStatement")}</span>
            </a>
          ) : (
            <a href={file.url} target="_blank" rel="noreferrer" className="found-file-link">
              {t("eob.openFile")}
            </a>
          ))}
        <div className="eob-head-text">
          {eob.payer && <p className="found-hospital">{t("eob.from", { payer: eob.payer })}</p>}
          {eob.claimNumber && <p className="found-quiet">{t("eob.claim", { claim: eob.claimNumber })}</p>}
          {c.eobSource === "sample-source" && <p className="found-quiet">{t("eob.sampleNote")}</p>}
        </div>
      </div>

      <section aria-labelledby="eob-nums-h">
        <h2 id="eob-nums-h" className="eob-h2">
          {t("eob.compareH")}
        </h2>
        <dl className="eob-nums">
          <div className={gap > 0 ? "eob-num eob-num-flag" : "eob-num"}>
            <dt>{t("eob.hospitalAsks")}</dt>
            <dd>{amount(due)}</dd>
          </div>
          {numbersApply && (
            <div className="eob-num">
              <dt>{t("eob.youOwe")}</dt>
              <dd>{amount(owes)}</dd>
            </div>
          )}
          <div className="eob-num">
            <dt>{t("eob.planPaid")}</dt>
            <dd>{amount(eob.totalPlanPaid)}</dd>
          </div>
          <div className="eob-num">
            <dt>{t("eob.network")}</dt>
            <dd className="eob-num-word">{net}</dd>
          </div>
        </dl>
        {gap > 0 && <p className="eob-gap">{t("eob.gap", { amount: money(gap, true, lang) })}</p>}
      </section>

      <section aria-labelledby="eob-found-h">
        <h2 id="eob-found-h" className="eob-h2">
          {found.length ? t("eob.foundH", { n: found.length }) : t("eob.noneFound")}
        </h2>
        {found.length > 0 && (
          <ul className="eob-found">
            {found.map((f) => {
              const target = targetOf(f);
              const i = screenOf(f);
              const body = (
                <>
                  <span className="eob-found-title">{findingTitle(t, c, f)}</span>
                  <span className="eob-found-meta">
                    <span className={`eob-tag eob-tag-${target}`}>
                      {target === "insurer" ? t("eob.toInsurer") : target === "none" ? t("eob.checkFirst") : t("eob.toHospital")}
                    </span>
                    {f.amount > 0 && <span className="eob-found-amt">{t("eob.upTo", { amount: money(f.amount, true, lang) })}</span>}
                  </span>
                </>
              );
              return (
                <li key={f.id}>
                  {i >= 0 ? (
                    <button type="button" className="eob-found-item" onClick={() => go(`finding-${i}`)}>
                      {body}
                      <span className="eob-chev" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  ) : (
                    <div className="eob-found-item">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
