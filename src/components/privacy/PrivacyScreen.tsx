"use client";

import Link from "next/link";
import { useT } from "../i18n/I18nProvider";
import copy from "./privacy.json";
import "./privacy.css";

/** The privacy page. Mirrors convex/lib/privacy.ts (what Lupa tells people); keep both true. */
export function PrivacyScreen() {
  const { lang } = useT();
  const c = copy[lang] ?? copy.en;
  return (
    <article className="privacy">
      <h1 className="privacy-h">{c.title}</h1>
      <p className="privacy-lede">{c.lede}</p>
      {c.sections.map((s) => (
        <section key={s.h} className="privacy-sec">
          <h2>{s.h}</h2>
          <p>{s.p}</p>
        </section>
      ))}
      <p className="privacy-note">{c.updated}</p>
      <Link href="/" className="btn btn-primary">
        {c.back}
      </Link>
    </article>
  );
}
