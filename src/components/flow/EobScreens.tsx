"use client";

// The insurance statement (Explanation of Benefits, EOB): add it, wait while it's read,
// or type its totals, then see the key numbers next to the bill's. The rules that compare them run on the server
// (convex/lib/eobChecks.ts, docs/EOB.md); this screen only shows what they found.
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useT } from "../i18n/I18nProvider";
import type { Key } from "../i18n/strings";
import { FileProblem, prepareFile } from "../prepareFile";
import { type CaseView, type Finding, type ParsedEob, money } from "../types";
import { billDue, eobGap, eobNumbersApply, eobStillOwes, isEobKind, parseTypedDollars, targetOf } from "./eobView";
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

type View = "ask" | "typing" | "sending" | "reading" | "error" | "result";

export function EobStep({ c, go, back }: ScreenProps) {
  const { t } = useT();
  const generateUploadUrl = useMutation(api.cases.generateUploadUrl);
  const addEob = useMutation(api.cases.addEob);
  const removeEob = useMutation(api.cases.removeEob);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState<null | "file" | "remove">(null);
  // The "type the amounts" form is open (from the ask, error or result view).
  const [typing, setTyping] = useState(false);
  const [problem, setProblem] = useState<Key | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const changeable = canChangeEob(c);
  const beforeAnswer = c.status === "needs_household" || c.eligibility?.tier === "NEEDS_INFO";
  // Skip, Continue and Keep going all lead on: to the questions first time through, else back to the answer.
  const onward = () => go(beforeAnswer ? "q1" : "answer");
  const onBack = beforeAnswer ? back : () => go("answer");

  const view: View =
    typing && changeable
      ? "typing"
      : busy === "file"
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
  const typed = c.eobSource === "typed";
  const otherWays = changeable && (
    <div className="step-links">
      <button type="button" className="link-btn" onClick={() => fileInput.current?.click()}>
        {t("eob.file")}
      </button>
      <button type="button" className="link-btn" onClick={() => setTyping(true)}>
        {t("eob.typeLink")}
      </button>
    </div>
  );

  if (view === "typing") {
    return <EobTypeForm c={c} onDone={() => setTyping(false)} onBack={() => setTyping(false)} />;
  }

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
        primary={changeable ? { label: t("eob.tryAgain"), onClick: photo.onClick } : skip}
        secondary={changeable ? skip : undefined}
        onBack={onBack}
      >
        {inputs}
        {notEob && c.eobFileUrl && isImage(c.eobFileType, c.eobFileUrl) && <BadDocument url={c.eobFileUrl} alt={t("eob.statementAlt")} label={t("flow.invalidDoc")} />}
        <p>{notEob ? t("eob.notEobBody") : /TOO_LARGE/.test(c.eobError ?? "") ? t("eob.tooLargeBody") : /APPROVED/.test(c.eobError ?? "") ? t("eob.approvedBody") : t("eob.failedBody")}</p>
        {otherWays}
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
            <div className="eob-remove" role="group" aria-label={typed ? t("eob.typeRemoveQ") : t("eob.removeQ")}>
              <p className="eob-remove-q">{typed ? t("eob.typeRemoveQ") : t("eob.removeQ")}</p>
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
              {typed && (
                <button type="button" className="link-btn" onClick={() => setTyping(true)}>
                  {t("eob.typeChange")}
                </button>
              )}
              <button type="button" className="link-btn" onClick={() => setConfirmRemove(true)}>
                {typed ? t("eob.typeRemove") : t("eob.remove")}
              </button>
            </div>
          ))}
        {problemNote}
        {liveRegion}
      </StepFrame>
    );
  }

  // Ask: do you have insurance, and its statement?
  const main = !changeable ? { label: t("eob.continue"), onClick: onward } : photo;
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
      {otherWays}
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
          {c.eobSource === "typed" && <p className="found-hospital">{t("eob.typedFrom")}</p>}
          {eob.payer &&
            (c.eobSource === "typed" ? (
              <p className="found-quiet">{t("eob.typedPayer", { payer: eob.payer })}</p>
            ) : (
              <p className="found-hospital">{t("eob.from", { payer: eob.payer })}</p>
            ))}
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

/* ---------- type the amounts instead of a photo ---------- */

type Net = "in" | "out" | "unknown";
const AMOUNT_PROBLEM: Record<"bad" | "tooBig", Key> = { bad: "eob.typeBad", tooBig: "eob.typeTooBig" };
const asText = (x: number | null | undefined) => (x == null ? "" : String(x));
/** The field already shows "$", so a typed or pasted one isn't repeated. */
const noDollar = (s: string) => s.replace(/^\s*\$\s*/, "");

/** One screen: what the statement says you owe (required), what the plan paid, network, insurer. */
function EobTypeForm({ c, onDone, onBack }: { c: CaseView; onDone: () => void; onBack: () => void }) {
  const { t, lang } = useT();
  const setEobManual = useMutation(api.cases.setEobManual);
  // Changing typed amounts starts from what was typed before.
  const before = c.eobSource === "typed" ? c.eob : null;
  const [owes, setOwes] = useState(asText(before?.totalPatientOwes));
  const [paid, setPaid] = useState(asText(before?.totalPlanPaid));
  const [net, setNet] = useState<Net | null>(before ? before.network : null);
  const [payer, setPayer] = useState(before?.payer ?? "");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<Key | null>(null);
  const owesRef = useRef<HTMLInputElement>(null);
  const paidRef = useRef<HTMLInputElement>(null);

  const o = parseTypedDollars(owes);
  const p = parseTypedDollars(paid);
  const owesError: Key | null = o.problem ? AMOUNT_PROBLEM[o.problem] : o.value == null && tried ? "eob.typeOwesMissing" : null;
  const paidError: Key | null = p.problem ? AMOUNT_PROBLEM[p.problem] : null;
  // Only say what's wrong once they've typed something or tried to send it.
  const showOwes = owesError && (tried || owes.trim() !== "");
  const showPaid = paidError && (tried || paid.trim() !== "");

  async function submit() {
    setTried(true);
    if (o.value == null || owesError || paidError) {
      (o.value == null || owesError ? owesRef : paidRef).current?.focus();
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      await setEobManual({
        id: c._id as Id<"cases">,
        token: c.token,
        patientOwes: o.value,
        planPaid: p.value,
        network: net ?? "unknown",
        payer: payer.trim() || null,
      });
      onDone();
    } catch (e) {
      setFailed(/approved/i.test(String(e)) ? "eob.locked" : /too many/i.test(String(e)) ? "start.busy" : "eob.typeFailed");
      setBusy(false);
    }
  }

  const nets: [Net, Key][] = [
    ["in", "eob.typeNetYes"],
    ["out", "eob.typeNetNo"],
    ["unknown", "eob.typeNetUnsure"],
  ];

  return (
    <StepFrame
      phase={2}
      eyebrow={t("eob.eyebrow")}
      title={t("eob.typeH")}
      primary={{ label: busy ? t("eob.typeSaving") : t("eob.typeSubmit"), onClick: submit, busy }}
      onBack={onBack}
    >
      <form
        className="eob-type"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="quiet">{t("eob.typeHelp")}</p>

        <div className="q-sub">
          <label className="q-label-sm eob-type-label" htmlFor="eob-owes">
            {t("eob.typeOwes")}
          </label>
          <div className="money-input money-input-big">
            <span aria-hidden>$</span>
            <input
              ref={owesRef}
              id="eob-owes"
              inputMode="decimal"
              autoComplete="off"
              required
              aria-required="true"
              aria-invalid={showOwes ? true : undefined}
              aria-describedby={showOwes ? "eob-owes-err" : undefined}
              placeholder={t("eob.typeOwesEg")}
              value={owes}
              onChange={(e) => setOwes(noDollar(e.target.value))}
            />
          </div>
          {showOwes ? (
            <p id="eob-owes-err" className="q-check q-check-bad" role="alert">
              {t(owesError!)}
            </p>
          ) : (
            o.value != null && <p className="q-check">{money(o.value, true, lang)}</p>
          )}
        </div>

        <div className="q-sub">
          <label className="q-label-sm eob-type-label" htmlFor="eob-paid">
            {t("eob.typePaid")}
          </label>
          <div className="money-input money-input-big">
            <span aria-hidden>$</span>
            <input
              ref={paidRef}
              id="eob-paid"
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={showPaid ? true : undefined}
              aria-describedby={showPaid ? "eob-paid-err" : undefined}
              placeholder={t("eob.typePaidEg")}
              value={paid}
              onChange={(e) => setPaid(noDollar(e.target.value))}
            />
          </div>
          {showPaid ? (
            <p id="eob-paid-err" className="q-check q-check-bad" role="alert">
              {t(paidError!)}
            </p>
          ) : (
            p.value != null && <p className="q-check">{money(p.value, true, lang)}</p>
          )}
        </div>

        <fieldset className="q-sub eob-type-net">
          <legend className="q-label-sm eob-type-label">{t("eob.typeNet")}</legend>
          <div className="choice choice-big eob-type-choice">
            {nets.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={net === k} onClick={() => setNet(net === k ? null : k)}>
                {t(label)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="q-sub">
          <label className="q-label-sm eob-type-label" htmlFor="eob-payer">
            {t("eob.typePayer")}
          </label>
          <input
            id="eob-payer"
            className="eob-type-text"
            type="text"
            autoComplete="organization"
            maxLength={80}
            placeholder={t("eob.typePayerEg")}
            value={payer}
            onChange={(e) => setPayer(e.target.value)}
          />
        </div>
        {/* Enter in a field sends the form; the bar button does the same. */}
        <button type="submit" className="visually-hidden" tabIndex={-1} aria-hidden="true" />
      </form>
      {failed && (
        <p className="error-note" role="alert">
          {t(failed)}
        </p>
      )}
    </StepFrame>
  );
}
