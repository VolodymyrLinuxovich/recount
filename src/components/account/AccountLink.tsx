"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { useT } from "../i18n/I18nProvider";
import "./account.css";

/** The account button in the header's right corner, like a profile picture. Signed out it opens sign-in;
 *  signed in it opens a small menu: View profile, and Sign out. */
export function AccountButton() {
  const { t } = useT();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.profile.get, isAuthenticated ? {} : "skip");
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    wrap.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!isAuthenticated)
    return (
      <Link href="/account" className="acct-pic" aria-label={t("acct.signIn")} title={t("acct.signIn")} data-loading={isLoading || undefined}>
        <Silhouette />
      </Link>
    );

  const initial = (me?.accountName || me?.name || me?.accountEmail || "").trim().charAt(0).toUpperCase();
  const who = me?.accountName || me?.name || null;
  return (
    <span className="acct-menu-wrap" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="acct-pic"
        aria-label={t("acct.yours")}
        title={t("acct.yours")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        {initial ? (
          <span className="acct-pic-in" aria-hidden="true">
            {initial}
          </span>
        ) : (
          <Silhouette />
        )}
      </button>
      {open && (
        <div id={menuId} className="acct-menu" role="menu" aria-label={t("acct.yours")}>
          <div className="acct-menu-who">
            {who && <p className="acct-menu-name">{who}</p>}
            <p className="acct-menu-email">{me?.accountEmail ?? ""}</p>
          </div>
          <Link href="/account" role="menuitem" className="acct-menu-item" onClick={() => setOpen(false)}>
            {t("acct.viewProfile")}
          </Link>
          <button
            type="button"
            role="menuitem"
            className="acct-menu-item acct-menu-out"
            onClick={async () => {
              setOpen(false);
              await signOut();
              router.push("/");
            }}
          >
            {t("acct.signOut")}
          </button>
        </div>
      )}
    </span>
  );
}

function Silhouette() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="15" r="7.5" />
      <path d="M5 40c1-9 6.5-14 15-14s14 5 15 14z" />
    </svg>
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
