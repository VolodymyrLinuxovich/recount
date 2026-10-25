"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CaseFlow } from "./flow/CaseFlow";
import { useDoneNotice } from "./flow/useDoneNotice";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { tokenFor, tokenFromLink, useRememberCase } from "./bills/myBills";
import { useT } from "./i18n/I18nProvider";
import type { T } from "./i18n/strings";
import type { CaseView } from "./types";

export function CaseScreen() {
  const { id } = useParams<{ id: string }>();
  // The bill's secret comes from the link (#t=…) or from My bills on this phone.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setToken(tokenFromLink() ?? tokenFor(id) ?? null);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [id]);
  const validId = /^[0-9a-z]{25,40}$/.test(id);
  const raw = useQuery(api.cases.get, token === undefined || !validId ? "skip" : { id: id as Id<"cases">, token: token ?? undefined }) as
    | CaseView
    | null
    | undefined;
  const c = raw ? { ...raw, token: token ?? undefined } : raw;
  useRememberCase(id, token ?? undefined, c);
  useDoneNotice(c);
  const { t, lang } = useT();

  if (!validId)
    return (
      <section className="stack">
        <h1 className="h-answer">{t("case.notFound")}</h1>
        <div className="row">
          <Link href="/bills" className="btn btn-primary">
            {t("bills.title")}
          </Link>
          <Link href="/" className="btn btn-quiet">
            {t("case.startAgain")}
          </Link>
        </div>
      </section>
    );
  if (token === null && c === null)
    return (
      <section className="stack">
        <h1 className="h-answer">{t("case.private")}</h1>
        <p>{t("case.privateBody")}</p>
        <div className="row">
          <Link href="/bills" className="btn btn-primary">
            {t("bills.title")}
          </Link>
          <Link href="/" className="btn btn-quiet">
            {t("case.startAgain")}
          </Link>
        </div>
      </section>
    );
  if (c === undefined || token === undefined) return <p className="quiet">{t("case.opening")}</p>;
  if (c === null)
    return (
      <section>
        <h1 className="h-answer">{t("case.notFound")}</h1>
        <p>
          <Link href="/">{t("case.startAgain")}</Link>
        </p>
      </section>
    );

  const caseLang = c.lang ?? "en";

  return (
    <>
      {caseLang !== lang && (
        <div className="lang-note" role="note">
          <p>{t("case.langNote", { caseLang })}</p>
          <Link href="/" className="btn btn-quiet">
            {t("case.checkAgain")}
          </Link>
        </div>
      )}
      <CaseFlow c={c} />
    </>
  );
}

/** Turn a backend error into one plain sentence for the patient. */
export function plainError(t: T, raw: string | undefined, isPdf: boolean) {
  const r = (raw ?? "").toLowerCase();
  if (/api key|credit|rate limit|overloaded|529|503|unavailable/.test(r)) return t("case.err.unavailable", { pdf: isPdf });
  if (/not a hospital|not a medical|no lines|empty/.test(r)) return t("case.err.notBill", { pdf: isPdf });
  return t("case.err.generic", { pdf: isPdf });
}
