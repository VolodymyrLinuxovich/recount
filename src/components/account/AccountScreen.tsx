"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { useT } from "../i18n/I18nProvider";
import { AuthCard } from "./AuthCard";
import { ClaimNote } from "./ClaimNote";
import { DeleteAccount } from "./DeleteAccount";
import { clearGooglePending, googlePending } from "./GoogleButton";
import { ProfileForm } from "./ProfileForm";
import { useAllBills } from "./useAllBills";
import { BillRow } from "../bills/BillRow";
import "../bills/bills.css";
import "./account.css";

/** Only a path on this site: "/case/abc?s=found". Never another origin. */
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

const hasCode = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("code");

export function AccountScreen() {
  const { t } = useT();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const next = safeNext(useSearchParams().get("next"));
  const router = useRouter();
  const wasOut = useRef(false);
  // Back from Google: the sign-in code is still being exchanged while the URL carries ?code=.
  const [fromGoogle] = useState(() => typeof window !== "undefined" && googlePending());

  // Signed in from this page with somewhere to go back to (the bill they were on): go there.
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      if ((wasOut.current || fromGoogle) && next) router.replace(next);
      if (fromGoogle) clearGooglePending();
      return;
    }
    wasOut.current = true;
    if (fromGoogle && !hasCode()) clearGooglePending();
  }, [isAuthenticated, isLoading, next, router, fromGoogle]);

  // Still signed out after coming back from Google, with no code left to exchange: cancelled or failed.
  const googleFailed = fromGoogle && !isLoading && !isAuthenticated && !hasCode();

  if (isLoading) return <p className="quiet">{fromGoogle ? t("acct.googleChecking") : t("acct.loading")}</p>;

  if (!isAuthenticated)
    return (
      <section className="acct-page">
        <h1 className="acct-title">{t("acct.outTitle")}</h1>
        <p className="acct-lede">{t("acct.why")}</p>
        <p className="acct-optional">{t("acct.optional")}</p>
        <AuthCard next={next} googleFailed={googleFailed} />
        <ul className="acct-limits">
          <li>{t("acct.limitVerify")}</li>
          <li>{t("acct.limitPrivacy")}</li>
        </ul>
        <Link href="/" className="acct-back">
          {t("acct.checkWithout")}
        </Link>
      </section>
    );

  return <SignedIn next={next} />;
}

/** An email that wraps at its "@" and dots, never in the middle of a word. */
function Email({ value }: { value: string }) {
  const parts = value.split(/(?=[@.])/);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <wbr />}
          {p}
        </span>
      ))}
    </>
  );
}

/** (415) 555-0199 for a 10-digit US number; anything else as typed. */
function phoneText(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
}

/** The birthday as people say it: "April 23, 1958" / "23 de abril de 1958". */
function longDate(iso: string | null | undefined, lang: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", { dateStyle: "long", timeZone: "UTC" }).format(d);
}

/** Signed in: who you are, your details (read, then edit), your bills, then sign out and delete. */
function SignedIn({ next }: { next: string | null }) {
  const { t, lang } = useT();
  const { signOut } = useAuthActions();
  const router = useRouter();
  const me = useQuery(api.profile.get);
  const { bills } = useAllBills();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [out, setOut] = useState(false);

  const name = me?.accountName || me?.name || null;
  const initial = (name || me?.accountEmail || "").trim().charAt(0).toUpperCase();
  const address = [me?.street, [me?.city, me?.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const rows: { k: string; label: string; value: React.ReactNode | null }[] = [
    { k: "name", label: t("acct.rowName"), value: me?.name ?? null },
    { k: "address", label: t("acct.rowAddress"), value: address || null },
    { k: "phone", label: t("acct.rowPhone"), value: phoneText(me?.phone) },
    { k: "email", label: t("acct.rowEmail"), value: me?.email ? <Email value={me.email} /> : null },
    { k: "dob", label: t("acct.rowDob"), value: longDate(me?.dob, lang) },
  ];
  const empty = rows.every((r) => !r.value);
  const shown = bills.slice(0, 3);

  return (
    <section className="acct-page acct-profile-page">
      <header className="acct-hero rc-card">
        <span className="acct-hero-pic" aria-hidden="true">
          {initial || "•"}
        </span>
        <div className="acct-hero-text">
          <h1 className="acct-hero-name">{name ?? t("acct.inTitle")}</h1>
          <p className="acct-hero-email">{me?.accountEmail ? <Email value={me.accountEmail} /> : "…"}</p>
          {me && <p className="acct-hero-via">{t(me.signInMethod === "google" ? "acct.viaGoogle" : "acct.viaEmail")}</p>}
        </div>
      </header>

      {next && (
        <Link href={next} className="rc-btn rc-btn--block">
          {t("acct.backToBill")}
        </Link>
      )}
      {me?.otherAccount && <p className="acct-note">{t(me.signInMethod === "google" ? "acct.otherPassword" : "acct.otherGoogle")}</p>}
      <ClaimNote />

      <section className="acct-card rc-card" aria-labelledby="acct-about-h">
        <h2 id="acct-about-h" className="acct-sec-h">
          {t("acct.aboutH")}
        </h2>
        <p className="acct-quiet">{t("acct.aboutLede")}</p>
        {editing ? (
          <ProfileForm
            onDone={() => {
              setEditing(false);
              setSaved(true);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            {!empty && (
              <dl className="acct-facts">
                {rows.map((r) => (
                  <div key={r.k} className="acct-fact">
                    <dt>{r.label}</dt>
                    <dd className={r.value ? undefined : "acct-fact-none"}>{r.value ?? t("acct.notAdded")}</dd>
                  </div>
                ))}
              </dl>
            )}
            {saved && (
              <p className="acct-quiet" role="status">
                {t("acct.savedNote")}
              </p>
            )}
            <button
              type="button"
              className="rc-btn rc-btn--secondary rc-btn--block"
              onClick={() => {
                setSaved(false);
                setEditing(true);
              }}
            >
              {empty ? t("acct.addDetails") : t("acct.editDetails")}
            </button>
          </>
        )}
      </section>

      <section className="acct-card rc-card" aria-labelledby="acct-bills-h">
        <h2 id="acct-bills-h" className="acct-sec-h">
          {t("acct.billsH")} {bills.length > 0 && <span className="acct-count">{bills.length}</span>}
        </h2>
        {bills.length === 0 ? (
          <>
            <p className="acct-quiet">{t("acct.noBills")}</p>
            <Link href="/" className="rc-btn rc-btn--block">
              {t("acct.checkBill")}
            </Link>
          </>
        ) : (
          <>
            <ul className="bill-slips acct-bills">
              {shown.map((b) => (
                <BillRow key={b.id} id={b.id} token={b.token} addedAt={b.addedAt} inAccount={b.inAccount} />
              ))}
            </ul>
            <Link href="/bills" className="rc-btn rc-btn--secondary rc-btn--block">
              {t("acct.seeAllBills")}
            </Link>
          </>
        )}
      </section>

      <button
        type="button"
        className="rc-btn rc-btn--block acct-signout-btn"
        disabled={out}
        onClick={async () => {
          setOut(true);
          try {
            await signOut();
            router.push("/");
          } finally {
            setOut(false);
          }
        }}
      >
        {t("acct.signOut")}
      </button>
      <DeleteAccount />
    </section>
  );
}
