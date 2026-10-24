"use client";

import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { useT } from "../i18n/I18nProvider";
import type { PlainKey } from "../i18n/strings";
import { checkDetails, type Details, normalDob } from "../letterFill";
import { saveError } from "./errors";
import { DOB_MIN, dobMax, dobPickerValue, fromServer, isoToDob, toServer } from "./profileFields";
import "../letters.css";

type Field = keyof Details;

const FIELDS: { k: Field; label: PlainKey; hint?: PlainKey; attrs: React.InputHTMLAttributes<HTMLInputElement>; cls?: string }[] = [
  { k: "name", label: "letters.dName", attrs: { autoComplete: "name" } },
  { k: "street", label: "letters.dStreet", attrs: { autoComplete: "street-address" } },
  { k: "city", label: "letters.dCity", hint: "letters.hintCity", attrs: { autoComplete: "address-level2" } },
  { k: "zip", label: "letters.dZip", hint: "letters.hintZip", attrs: { autoComplete: "postal-code", inputMode: "numeric", maxLength: 10 }, cls: "details-zip" },
  { k: "phone", label: "letters.dPhone", hint: "letters.hintPhone", attrs: { autoComplete: "tel", type: "tel", inputMode: "tel" } },
  { k: "email", label: "letters.dEmail", attrs: { autoComplete: "email", type: "email", inputMode: "email" } },
  { k: "dob", label: "letters.dDob", hint: "letters.dDobPick", attrs: { autoComplete: "bday", type: "date", min: DOB_MIN, max: dobMax() } },
];

const BAD: Partial<Record<Field, PlainKey>> = {
  phone: "letters.errPhone",
  zip: "letters.errZip",
  dob: "letters.errDob",
  email: "letters.errEmail",
};

/** "Your details for letters": the same fields as the letter form, all optional here. */
export function ProfileForm() {
  const { t } = useT();
  const profile = useQuery(api.profile.get);
  const save = useMutation(api.profile.set);
  // What's on screen: the saved profile until the person edits it.
  const [edits, setD] = useState<Details | null>(null);
  const [left, setLeft] = useState<Partial<Record<Field, boolean>>>({});
  const [tried, setTried] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLFormElement>(null);

  if (profile === undefined) return <p className="quiet">{t("acct.loading")}</p>;

  // Nothing saved yet: start from the account itself (the name and email Google gave us, or the sign-in email).
  const saved = fromServer(profile);
  const d = edits ?? { ...saved, name: saved.name || (profile?.accountName ?? ""), email: saved.email || (profile?.accountEmail ?? "") };
  // Only typos matter here: nothing is required on the account.
  const problems = checkDetails(d);
  const bad = (k: Field) => problems[k] === "bad" && (tried || left[k]) ? t(BAD[k]!) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    const anyBad = FIELDS.some(({ k }) => problems[k] === "bad");
    if (anyBad) {
      setTimeout(() => box.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setState("saving");
    try {
      await save(toServer(d));
      setState("saved");
    } catch (err) {
      setError(saveError(t, err));
      setState("idle");
    }
  }

  return (
    <form ref={box} className="acct-profile" onSubmit={submit} noValidate>
      {FIELDS.map(({ k, label, hint, attrs, cls }) => {
        const id = `acct-${k}`;
        const err = bad(k);
        const described = [hint && `${id}-hint`, err && `${id}-err`].filter(Boolean).join(" ") || undefined;
        return (
          <div key={k} className={`details-field ${cls ?? ""}${err ? " has-err" : ""}`}>
            <label className="details-label" htmlFor={id}>
              {t(label)}
              <span className="details-need">{t("letters.optional")}</span>
            </label>
            {hint && (
              <p className="details-hint" id={`${id}-hint`}>
                {t(hint)}
              </p>
            )}
            {err && (
              <p className="details-err" id={`${id}-err`}>
                <span className="visually-hidden">{t("letters.errLabel")} </span>
                {err}
              </p>
            )}
            <input
              id={id}
              lang="en"
              value={k === "dob" ? dobPickerValue(d.dob) : d[k]}
              onChange={(e) => {
                setD({ ...d, [k]: k === "dob" ? isoToDob(e.target.value) : e.target.value });
                setState("idle");
              }}
              onBlur={() => {
                setLeft((x) => ({ ...x, [k]: true }));
                if (k === "dob" && d.dob.trim()) {
                  const n = normalDob(d.dob);
                  if (n && n !== d.dob) setD({ ...d, dob: n });
                }
              }}
              aria-invalid={err ? true : undefined}
              aria-describedby={described}
              {...attrs}
            />
          </div>
        );
      })}
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="rc-btn rc-btn--block acct-submit" disabled={state === "saving"}>
        {state === "saving" ? t("acct.saving") : t("acct.saveDetails")}
      </button>
      <p className="acct-quiet" role="status">
        {state === "saved" ? `✓ ${t("acct.saved")}` : t("acct.detailsNote")}
      </p>
    </form>
  );
}
