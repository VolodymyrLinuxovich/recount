"use client";

import { useConvexAuth } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useAccountProfile } from "./account/useAccountProfile";
import { useT } from "./i18n/I18nProvider";
import { joinList, type PlainKey } from "./i18n/strings";
import { checkDetails, type Details, EMPTY_DETAILS, normalDob, readDetails, saveDetails } from "./letterFill";
import { clearProfile, readProfile, saveProfile } from "./profile";
import type { CaseView } from "./types";
import "./letters.css";

type Field = keyof Details;
export type DetailsSource = "bill" | "profile";
/** Whose bill this is: the patient's own, or someone they're helping. */
export type Who = "self" | "other";

const whoKey = (id: string) => `recount.who.${id}`;

export function readWho(id: string): Who | null {
  try {
    const v = window.localStorage.getItem(whoKey(id));
    return v === "self" || v === "other" ? v : null;
  } catch {
    return null;
  }
}

export function saveWho(id: string, w: Who) {
  try {
    window.localStorage.setItem(whoKey(id), w);
  } catch {
    // Storage is blocked; the choice holds for this visit.
  }
}

const NEED: Partial<Record<Field, PlainKey>> = {
  name: "letters.needName",
  street: "letters.needStreet",
  city: "letters.needCity",
  zip: "letters.needZip",
  phone: "letters.needPhone",
};

const BAD: Record<"phone" | "zip" | "dob", PlainKey> = {
  phone: "letters.needPhoneBad",
  zip: "letters.needZipBad",
  dob: "letters.needDobBad",
};

/** What still stops the patient from going on, as a sentence, or null when the details are complete. */
export function useDetailsMissing(details: Details): string | null {
  const { t, lang } = useT();
  const problems = checkDetails(details);
  // A typo in the optional email is shown by the field but doesn't stop anyone. A date of birth that
  // isn't a date does: it would go into the letter as typed.
  const blocking = (Object.keys(problems) as Field[]).filter((k) => NEED[k] || k === "dob");
  if (!blocking.length) return null;
  const names = blocking.map((k) =>
    problems[k] === "bad" ? t(BAD[k as "phone" | "zip" | "dob"]) : t(NEED[k]!),
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
  tried = 0,
  forOther = false,
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
  /** Counts taps on Next while something is missing: show every error and go to the first. */
  tried?: number;
  /** The bill is someone else's: the copy talks about "the patient", not "you". */
  forOther?: boolean;
}) {
  const { t } = useT();
  const signedIn = useConvexAuth().isAuthenticated;
  // A field's error shows once the patient typed in it and left it, or after they tapped Next.
  // Tabbing through an empty field, or a prefilled value, shows nothing.
  const [edited, setEdited] = useState<Partial<Record<Field, boolean>>>({});
  const [left, setLeft] = useState<Partial<Record<Field, boolean>>>({});
  const problems = checkDetails(details);
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!tried) return;
    const first = box.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]');
    first?.focus();
    first?.scrollIntoView({ block: "center" });
  }, [tried]);

  const error = (k: Field): string | null => {
    const p = problems[k];
    if (!p || !(tried || (edited[k] && left[k]))) return null;
    if (p === "missing") return t("letters.errMissing", { what: t(NEED[k]!) });
    if (k === "phone") return t("letters.errPhone");
    if (k === "zip") return t("letters.errZip");
    if (k === "dob") return t("letters.errDob");
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
          onChange={(e) => {
            setEdited((x) => ({ ...x, [k]: true }));
            onChange({ ...details, [k]: e.target.value });
          }}
          onBlur={() => {
            setLeft((x) => ({ ...x, [k]: true }));
            // Write the date the way the letter needs it: 23/04/1958 becomes 04/23/1958.
            if (k === "dob" && details.dob.trim()) {
              const n = normalDob(details.dob);
              if (n && n !== details.dob) onChange({ ...details, dob: n });
            }
          }}
          lang="en"
          required={need === "required"}
          aria-invalid={err ? true : undefined}
          aria-describedby={described}
          {...attrs}
          // Someone else's bill: the browser's autofill would put in the helper's own address.
          autoComplete={forOther ? "off" : attrs.autoComplete}
        />
      </div>
    );
  };

  return (
    <section ref={box} className={bare ? "details details-bare" : "details"} aria-label={t("letters.detailsH")}>
      {!bare && <h3 className="details-h">{t("letters.detailsH")}</h3>}
      <p className="details-lede">{t(forOther ? "letters.detailsLedeOther" : "letters.detailsLede")}</p>
      {sources.includes("bill") && <p className="details-from">{t(forOther ? "letters.fromBillOther" : "letters.fromBill")}</p>}
      {sources.includes("profile") && <p className="details-from">{t("letters.fromProfile")}</p>}
      {field("name", forOther ? "letters.dNameOther" : "letters.dName", "required", { autoComplete: "name" })}
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
            <span className="details-remember-h">{t(signedIn ? "letters.rememberAccount" : "letters.remember")}</span>
            <span className="quiet details-remember-hint">{t(signedIn ? "letters.rememberAccountHint" : "letters.rememberHint")}</span>
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
  if (name && !/[[\]]/.test(name)) out.name = nameCase(name);
  const addr = c.bill?.patientAddress?.trim() ?? "";
  if (addr && !/[[\]]/.test(addr)) Object.assign(out, splitAddress(addr));
  return out;
}

// Lowercase in a name, unless it starts the name: "Maria de la Cruz", "Ludwig van Beethoven".
const PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "da", "das", "do", "dos", "di", "van", "von", "der", "den", "du", "le"]);
const ROMAN = /^(?:i{1,3}|iv|v|vi{0,3}|ix|x)$/;

/**
 * "MARIA HERNANDEZ" (bills print names in capitals) → "Maria Hernandez". Keeps "McDonald", "O'Brien",
 * "Garcia-Lopez" and "III" sensible. A name that already has lowercase letters is left as typed.
 */
export function nameCase(raw: string): string {
  if (!/\p{Lu}/u.test(raw) || /\p{Ll}/u.test(raw)) return raw;
  let i = 0;
  return raw.replace(/[\p{L}\p{M}'’]+/gu, (word) => {
    const first = i++ === 0;
    const w = word.toLowerCase();
    if (ROMAN.test(w) && !first) return w.toUpperCase();
    if (!first && PARTICLES.has(w)) return w;
    const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
    // O'Brien, D'Angelo: a capital after the apostrophe too.
    const apos = /^(\p{L})(['’])(\p{L}.*)$/u.exec(w);
    if (apos) return apos[1].toUpperCase() + apos[2] + cap(apos[3]);
    if (/^mc\p{L}{2,}$/u.test(w)) return "Mc" + cap(w.slice(2));
    return cap(w);
  });
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
    // Someone else's bill: the saved profile is the helper's own details, so it stays out.
    const profile = readWho(c._id) === "other" ? {} : filled(readProfile());
    const details = { ...EMPTY_DETAILS, ...profile, ...bill, ...saved };
    const sources: DetailsSource[] = [];
    const keys = Object.keys(EMPTY_DETAILS) as Field[];
    if (keys.some((k) => !saved[k] && bill[k])) sources.push("bill");
    if (keys.some((k) => !saved[k] && !bill[k] && profile[k])) sources.push("profile");
    return { details, sources };
  });
  const [details, setDetails] = useState<Details>(start.details);
  // Signed in: the account's details arrive after the first render. They fill only what wasn't typed for
  // this bill and isn't on the bill (they take the place of this device's saved profile).
  const account = useAccountProfile();
  const [fromAccount, setFromAccount] = useState<boolean | null>(null);
  if (fromAccount === null && account.profile) {
    // Once, when they first arrive (state set during render, so there's no flash of the old values).
    const p = account.profile;
    const saved = filled(readDetails(c._id));
    const bill = filled(fromBill(c));
    const keys = readWho(c._id) === "other" ? [] : (Object.keys(EMPTY_DETAILS) as Field[]).filter((k) => p[k] && !saved[k] && !bill[k]);
    setFromAccount(keys.length > 0);
    if (keys.length) setDetails((cur) => ({ ...cur, ...Object.fromEntries(keys.map((k) => [k, p[k]])) }));
  }
  const sources: DetailsSource[] = fromAccount && !start.sources.includes("profile") ? [...start.sources, "profile"] : start.sources;
  const change = (d: Details) => {
    setDetails(d);
    saveDetails(c._id, d);
  };
  /** Keep what's on screen for this bill, and for next time if the patient wants. */
  const keep = (remember: boolean) => {
    saveDetails(c._id, details);
    // The sample's made-up patient never becomes anyone's profile, and doesn't wipe a real one.
    if (c.sample) return;
    // Signed in, "next time" means the account (any device). Unticking leaves the account's details alone.
    if (account.signedIn) {
      if (remember) account.save(details);
      return;
    }
    if (remember) saveProfile(details);
    // Unticking for someone else's bill means "don't keep theirs", not "forget mine".
    else if (readWho(c._id) !== "other") clearProfile();
  };
  return [details, change, { sources, keep }] as const;
}
