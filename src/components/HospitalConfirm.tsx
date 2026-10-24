"use client";

import { useMutation, useQuery } from "convex/react";
import { useDeferredValue, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { displayName } from "./audit/data";
import { useT } from "./i18n/I18nProvider";
import type { CaseView, HospitalChoice } from "./types";

/** When we aren't sure which hospital sent the bill, the patient picks it. */
export function HospitalConfirm({ c }: { c: CaseView }) {
  const { t } = useT();
  const confirm = useMutation(api.cases.confirmHospital);
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q.trim());
  const results = useQuery(api.cases.searchHospitals, deferred.length >= 2 ? { q: deferred } : "skip") as HospitalChoice[] | undefined;
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function choose(key: string | null) {
    setBusy(key ?? "none");
    setFailed(false);
    try {
      await confirm({ id: c._id as Id<"cases">, token: c.token, key });
    } catch {
      setFailed(true);
      setBusy(null);
    }
  }

  const candidates = c.hospitalCandidates ?? [];
  const shown = deferred.length >= 2 ? (results ?? []) : candidates;

  return (
    <section className="hosp-pick" aria-labelledby="hosp-h">
      <p className="eyebrow">{t("hosp.eyebrow")}</p>
      <h1 id="hosp-h" className="h-section hosp-h">
        {t("hosp.h")}
      </h1>
      {c.bill?.hospitalName && <p className="hosp-printed">&ldquo;{c.bill.hospitalName}&rdquo;</p>}
      <p className="lede">{t("hosp.lede")}</p>

      <ul className="hosp-list">
        {shown.map((h) => (
          <li key={h.key}>
            <button className="hosp-choice" onClick={() => choose(h.key)} disabled={busy !== null}>
              <span className="hosp-name">{displayName(h.name)}</span>
              {h.city && <span className="hosp-city">{t("hosp.city", { city: displayName(h.city) })}</span>}
              {busy === h.key && <span className="hosp-city">{t("hosp.choosing")}</span>}
            </button>
          </li>
        ))}
        {deferred.length >= 2 && results && results.length === 0 && <li className="quiet">{t("hosp.noResults")}</li>}
      </ul>

      <label className="hosp-search-label" htmlFor="hosp-search">
        {t("hosp.searchLabel")}
      </label>
      <input
        id="hosp-search"
        className="hosp-search"
        type="search"
        autoComplete="off"
        placeholder={t("hosp.searchPlaceholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <button className="btn btn-quiet hosp-none" onClick={() => choose(null)} disabled={busy !== null}>
        {busy === "none" ? t("hosp.choosing") : t("hosp.notListed")}
      </button>
      <p className="quiet hosp-none-hint">{t("hosp.notListedHint")}</p>
      {failed && (
        <p className="error-note" role="alert">
          {t("hosp.failed")}
        </p>
      )}
    </section>
  );
}
