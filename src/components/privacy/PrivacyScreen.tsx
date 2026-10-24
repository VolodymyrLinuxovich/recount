"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useT } from "../i18n/I18nProvider";
import copy from "./privacy.json";
import "./privacy.css";

/** The privacy page. Mirrors convex/lib/privacy.ts (what Lupa tells people); keep both true.
 *  The Microsoft lines appear only when the server says that Azure service is switched on. */
export function PrivacyScreen() {
  const { lang } = useT();
  const c = copy[lang] ?? copy.en;
  const map = useQuery(api.pipeline.map);
  const p = map?.processors;
  const azureBackup = !!map && (["letters", "chat"] as const).some((t) => map.models[t]?.fallback?.provider === "azure");
  const extra = [
    azureBackup && c.azure.fallback,
    (azureBackup || p?.search) && c.azure.retention,
    p?.search && c.azure.search,
    p?.contentSafety && c.azure.safety,
  ].filter(Boolean);
  const processIdx = 1; // "Who helps process it"
  return (
    <article className="privacy">
      <h1 className="privacy-h">{c.title}</h1>
      <p className="privacy-lede">{c.lede}</p>
      {c.sections.map((s, i) => (
        <section key={s.h} className="privacy-sec">
          <h2>{s.h}</h2>
          <p>
            {s.p}
            {i === processIdx && extra.length > 0 && ` ${extra.join(" ")}`}
          </p>
        </section>
      ))}
      <p className="privacy-note">{c.updated}</p>
      <Link href="/" className="btn btn-primary">
        {c.back}
      </Link>
    </article>
  );
}
