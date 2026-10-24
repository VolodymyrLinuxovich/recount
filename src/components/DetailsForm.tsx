"use client";

import { useState } from "react";
import { useT } from "./i18n/I18nProvider";
import type { PlainKey } from "./i18n/strings";
import { type Details, EMPTY_DETAILS, readDetails, saveDetails } from "./letterFill";
import type { CaseView } from "./types";
import "./letters.css";

/** The patient's name, address and phone, typed once and put into the English letters. */
export function DetailsForm({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  const { t } = useT();
  const field = (k: keyof Details, label: PlainKey, attrs: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="details-field">
      <span className="details-label">{t(label)}</span>
      <input
        value={details[k]}
        onChange={(e) => onChange({ ...details, [k]: e.target.value })}
        lang="en"
        {...attrs}
      />
    </label>
  );
  return (
    <section className="details" aria-labelledby="details-h">
      <h3 id="details-h" className="details-h">
        {t("letters.detailsH")}
      </h3>
      <p className="details-lede">{t("letters.detailsLede")}</p>
      {field("name", "letters.dName", { autoComplete: "name" })}
      {field("street", "letters.dStreet", { autoComplete: "street-address" })}
      {field("city", "letters.dCity", { autoComplete: "off", placeholder: "Los Angeles, CA 90012" })}
      {field("phone", "letters.dPhone", { autoComplete: "tel", type: "tel", inputMode: "tel" })}
      {field("email", "letters.dEmail", { autoComplete: "email", type: "email", inputMode: "email" })}
      {field("dob", "letters.dDob", { autoComplete: "bday", placeholder: t("letters.dDobEg") })}
      <p className="quiet details-saved">{t("letters.dSaved")}</p>
    </section>
  );
}

/** The details for this bill, saved in this browser as they are typed. */
export function useDetails(c: CaseView) {
  const [details, setDetails] = useState<Details>(() => {
    const saved = typeof window === "undefined" ? null : readDetails(c._id);
    const fromBill = c.bill?.patientName?.trim() ?? "";
    return { ...EMPTY_DETAILS, name: /[[\]]/.test(fromBill) ? "" : fromBill, ...saved };
  });
  const change = (d: Details) => {
    setDetails(d);
    saveDetails(c._id, d);
  };
  return [details, change] as const;
}

