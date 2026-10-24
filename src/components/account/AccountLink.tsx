"use client";

import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { useT } from "../i18n/I18nProvider";
import "./account.css";

/** The account button in the header's right corner, like a profile picture: a round silhouette signed out, your initial signed in. */
export function AccountButton() {
  const { t } = useT();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.profile.get, isAuthenticated ? {} : "skip");
  const label = isAuthenticated ? t("acct.yours") : t("acct.signIn");
  const initial = (me?.accountEmail ?? "").trim().charAt(0).toUpperCase();
  return (
    <Link href="/account" className="acct-pic" aria-label={label} title={label} data-loading={isLoading || undefined}>
      {isAuthenticated && initial ? (
        <span className="acct-pic-in" aria-hidden="true">
          {initial}
        </span>
      ) : (
        <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
          <circle cx="20" cy="15" r="7.5" />
          <path d="M5 40c1-9 6.5-14 15-14s14 5 15 14z" />
        </svg>
      )}
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
