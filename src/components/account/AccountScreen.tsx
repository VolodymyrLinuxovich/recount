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
import { ProfileForm } from "./ProfileForm";
import "./account.css";

/** Only a path on this site: "/case/abc?s=found". Never another origin. */
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

export function AccountScreen() {
  const { t } = useT();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const next = safeNext(useSearchParams().get("next"));
  const router = useRouter();
  const wasOut = useRef(false);

  // Signed in from this page with somewhere to go back to (the bill they were on): go there.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) wasOut.current = true;
    else if (isAuthenticated && wasOut.current && next) router.replace(next);
  }, [isAuthenticated, isLoading, next, router]);

  if (isLoading) return <p className="quiet">{t("acct.loading")}</p>;

  if (!isAuthenticated)
    return (
      <section className="acct-page">
        <h1 className="acct-title">{t("acct.outTitle")}</h1>
        <p className="acct-lede">{t("acct.why")}</p>
        <p className="acct-optional">{t("acct.optional")}</p>
        <AuthCard />
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

function SignedIn({ next }: { next: string | null }) {
  const { t } = useT();
  const { signOut } = useAuthActions();
  const me = useQuery(api.profile.get);
  const [out, setOut] = useState(false);
  return (
    <section className="acct-page">
      <h1 className="acct-title">{t("acct.inTitle")}</h1>
      <p className="acct-lede">
        {t("acct.signedInAs")} <strong className="acct-email">{me?.accountEmail ?? "…"}</strong>
      </p>
      <ClaimNote />
      <div className="acct-row">
        <Link href={next ?? "/bills"} className="rc-btn acct-wide">
          {next ? t("acct.backToBill") : t("acct.seeBills")}
        </Link>
      </div>
      <section className="acct-card rc-card" aria-labelledby="acct-details-h">
        <h2 id="acct-details-h" className="acct-sec-h">
          {t("acct.detailsH")}
        </h2>
        <p className="acct-quiet">{t("acct.detailsLede")}</p>
        <ProfileForm />
      </section>
      <section className="acct-signout" aria-labelledby="acct-out-h">
        <h2 id="acct-out-h" className="acct-sec-h">
          {t("acct.signOutH")}
        </h2>
        <p className="acct-quiet">{t("acct.signOutLede")}</p>
        <button
          type="button"
          className="rc-btn rc-btn--secondary acct-wide"
          disabled={out}
          onClick={async () => {
            setOut(true);
            try {
              await signOut();
            } finally {
              setOut(false);
            }
          }}
        >
          {t("acct.signOut")}
        </button>
      </section>
      <DeleteAccount />
    </section>
  );
}
