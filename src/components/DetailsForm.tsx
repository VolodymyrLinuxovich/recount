"use client";

import { useState } from "react";
import { useT } from "./i18n/I18nProvider";
import { joinList, type PlainKey } from "./i18n/strings";
import { checkDetails, type Details, EMPTY_DETAILS, readDetails, saveDetails } from "./letterFill";
import { clearProfile, readProfile, saveProfile } from "./profile";
import type { CaseView } from "./types";
import "./letters.css";

type Field = keyof Details;
export type DetailsSource = "bill" | "profile";

const NEED: Partial<Record<Field, PlainKey>> = {
  name: "letters.needName",
  street: "letters.needStreet",
  city: "letters.needCity",
  zip: "letters.needZip",
  phone: "letters.needPhone",
};

/** What still stops the patient from going on, as a sentence, or null when the details are complete. */
export function useDetailsMissing(details: Details): string | null {
  const { t, lang } = useT();
  const problems = checkDetails(details);
  // A typo in the optional email is shown by the field but doesn't stop anyone.
  const blocking = (Object.keys(problems) as Field[]).filter((k) => NEED[k]);
  if (!blocking.length) return null;
  const names = blocking.map((k) =>
    problems[k] === "bad" ? t(k === "phone" ? "letters.needPhoneBad" : "letters.needZipBad") : t(NEED[k]!),
  );
  return t("letters.needList", { list: joinList(lang, names) });
}

/** The patient's name, address and phone, typed once and put into the English letters. */
export function DetailsForm({
  details,
  onChange,
  bare = false,
  sources = [],
  remember,
  onRemember,
}: {
  details: Details;
  onChange: (d: Details) => void;
  /** On its own screen: the screen has the heading, so no box and no heading here. */
  bare?: boolean;
  /** Where the prefilled values came from, so the patient knows to check them. */
  sources?: DetailsSource[];
  /** "Use these details next time", when the screen offers it. */
  remember?: boolean;
  onRemember?: (on: boolean) => void;
}) {
  const { t } = useT();
  // Errors show once a field has been left, so nobody is scolded while still typing.
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const problems = checkDetails(details);

  const error = (k: Field): string | null => {
    const p = problems[k];
    if (!p || !touched[k]) return null;
    if (p === "missing") return t("letters.errMissing", { what: t(NEED[k]!) });
    if (k === "phone") return t("letters.errPhone");
    if (k === "zip") return t("letters.errZip");
    return t("letters.errEmail");
  };

  const field = (
    k: Field,
    label: PlainKey,
    need: "required" | "optional",
    attrs: React.InputHTMLAttributes<HTMLInputElement>,
    hint?: PlainKey,
    className = "",
  ) => {
    const err = error(k);
    const id = `details-${k}`;
    const described = [hint && `${id}-hint`, err && `${id}-err`].filter(Boolean).join(" ") || undefined;
    return (
      <div className={`details-field ${className}${err ? " has-err" : ""}`}>
        <label className="details-label" htmlFor={id}>
          {t(label)}
          <span className={need === "required" ? "details-need req" : "details-need"}>
            {t(need === "required" ? "letters.required" : "letters.optional")}
          </span>
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
          value={details[k]}
          onChange={(e) => onChange({ ...details, [k]: e.target.value })}
          onBlur={() => setTouched((x) => ({ ...x, [k]: true }))}
          lang="en"
          required={need === "required"}
          aria-invalid={err ? true : undefined}
          aria-describedby={described}
          {...attrs}
        />
      </div>
    );
  };

  return (
    <section className={bare ? "details details-bare" : "details"} aria-label={t("letters.detailsH")}>
      {!bare && <h3 className="details-h">{t("letters.detailsH")}</h3>}
      <p className="details-lede">{t("letters.detailsLede")}</p>
      {sources.includes("bill") && <p className="details-from">{t("letters.fromBill")}</p>}
      {sources.includes("profile") && <p className="details-from">{t("letters.fromProfile")}</p>}
      {field("name", "letters.dName", "required", { autoComplete: "name" })}
      {field("street", "letters.dStreet", "required", { autoComplete: "street-address" })}
      {field("city", "letters.dCity", "required", { autoComplete: "address-level2" }, "letters.hintCity")}
      {field("zip", "letters.dZip", "required", { autoComplete: "postal-code", inputMode: "numeric", maxLength: 10 }, "letters.hintZip", "details-zip")}
      {field("phone", "letters.dPhone", "required", { autoComplete: "tel", type: "tel", inputMode: "tel" }, "letters.hintPhone")}
      {field("email", "letters.dEmail", "optional", { autoComplete: "email", type: "email", inputMode: "email" })}
      {field("dob", "letters.dDob", "optional", { autoComplete: "bday" }, "letters.dDobEg")}
      {onRemember ? (
        <label className="details-remember">
          <input type="checkbox" checked={!!remember} onChange={(e) => onRemember(e.target.checked)} />
          <span>
            <span className="details-remember-h">{t("letters.remember")}</span>
            <span className="quiet details-remember-hint">{t("letters.rememberHint")}</span>
          </span>
        </label>
      ) : (
        <p className="quiet details-saved">{t("letters.dSaved")}</p>
      )}
    </section>
  );
}

/** "123 Main St, Los Angeles, CA 90012" (or on several lines) → street, city and state, ZIP. */
export function splitAddress(raw: string): Pick<Details, "street" | "city" | "zip"> {
  const flat = raw
    .split(/\n|,/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (flat.length < 2) return { street: raw.trim(), city: "", zip: "" };
  let zip = "";
  const last = flat[flat.length - 1];
  const z = /^(.*?)\s*(\d{5}(?:-\d{4})?)$/.exec(last);
  if (z) {
    zip = z[2];
    if (z[1]) flat[flat.length - 1] = z[1];
    else flat.pop();
  }
  if (flat.length < 2) return { street: flat.join(", "), city: "", zip };
  const tail = flat[flat.length - 1];
  // "…, Los Angeles, CA": the city and the state are separate pieces.
  if (/^[A-Za-z]{2}$/.test(tail) && flat.length >= 3) {
    return { street: flat.slice(0, -2).join(", "), city: `${flat[flat.length - 2]}, ${tail.toUpperCase()}`, zip };
  }
  if (/^[A-Za-z]{2}$/.test(tail)) return { street: flat[0], city: tail.toUpperCase(), zip };
  return { street: flat.slice(0, -1).join(", "), city: tail, zip };
}

function fromBill(c: CaseView): Partial<Details> {
  const out: Partial<Details> = {};
  const name = c.bill?.patientName?.trim() ?? "";
  if (name && !/[[\]]/.test(name)) out.name = name;
  const addr = c.bill?.patientAddress?.trim() ?? "";
  if (addr && !/[[\]]/.test(addr)) Object.assign(out, splitAddress(addr));
  return out;
}

const filled = (d: Partial<Details> | null) =>
  Object.fromEntries(Object.entries(d ?? {}).filter(([, v]) => typeof v === "string" && v.trim())) as Partial<Details>;

/**
 * The details for this bill, saved in this browser as they are typed.
 * Each field comes from what was typed for this bill, else the bill itself, else the saved profile.
 */
export function useDetails(c: CaseView) {
  const [start] = useState(() => {
    if (typeof window === "undefined") return { details: EMPTY_DETAILS, sources: [] as DetailsSource[] };
    const saved = filled(readDetails(c._id));
    const bill = filled(fromBill(c));
    const profile = filled(readProfile());
    const details = { ...EMPTY_DETAILS, ...profile, ...bill, ...saved };
    const sources: DetailsSource[] = [];
    const keys = Object.keys(EMPTY_DETAILS) as Field[];
    if (keys.some((k) => !saved[k] && bill[k])) sources.push("bill");
    if (keys.some((k) => !saved[k] && !bill[k] && profile[k])) sources.push("profile");
    return { details, sources };
  });
  const [details, setDetails] = useState<Details>(start.details);
  const change = (d: Details) => {
    setDetails(d);
    saveDetails(c._id, d);
  };
  /** Keep what's on screen for this bill, and for next time if the patient wants. */
  const keep = (remember: boolean) => {
    saveDetails(c._id, details);
    if (remember) saveProfile(details);
    else clearProfile();
  };
  return [details, change, { sources: start.sources, keep }] as const;
}
