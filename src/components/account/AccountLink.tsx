"use client";

import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { useT } from "../i18n/I18nProvider";
import "./account.css";

/** The masthead's account entry. Wide row: "Sign in" or an initial in a circle. Phone menu: a full row. */
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
