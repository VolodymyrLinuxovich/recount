"use client";

import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { useT } from "../i18n/I18nProvider";
import "./account.css";

/** The account button at the right of the header, on every width: "Sign in" (a person icon on phones), or your initial. */
export function AccountButton() {
  const { t } = useT();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.profile.get, isAuthenticated ? {} : "skip");
  if (isAuthenticated) {
    const initial = (me?.accountEmail ?? "").trim().charAt(0).toUpperCase() || "•";
    return (
      <Link href="/account" className="acct-bar acct-bar-in" aria-label={t("acct.yours")} title={t("acct.yours")}>
        <span className="acct-avatar" aria-hidden="true">
          {initial}
        </span>
      </Link>
    );
  }
  return (
    <Link href="/account" className="acct-bar" aria-label={t("acct.signIn")} data-loading={isLoading || undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </svg>
      <span className="acct-bar-text" aria-hidden="true">
        {t("acct.signIn")}
      </span>
    </Link>
  );
}

/** The account row inside the phone menu sheet. */
export function AccountLink({ menu = false, onPick }: { menu?: boolean; onPick?: () => void }) {
  const { t } = useT();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.profile.get, isAuthenticated ? {} : "skip");
  if (isLoading) return null;
  if (!isAuthenticated)
    return (
      <Link href="/account" className="acct-nav-signin" onClick={onPick}>
        {t("acct.signIn")}
      </Link>
    );
  const initial = (me?.accountEmail ?? "").trim().charAt(0).toUpperCase() || "•";
  if (menu)
    return (
      <Link href="/account" className="acct-nav-menu" onClick={onPick}>
        <span className="acct-avatar" aria-hidden="true">
          {initial}
        </span>
        {t("acct.yours")}
      </Link>
    );
  return (
    <Link href="/account" className="acct-nav-avatar" aria-label={t("acct.yours")} title={t("acct.yours")}>
      <span className="acct-avatar" aria-hidden="true">
        {initial}
      </span>
    </Link>
  );
}
