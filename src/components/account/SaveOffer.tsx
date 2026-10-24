"use client";

import { useConvexAuth } from "convex/react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useT } from "../i18n/I18nProvider";
import { ClaimNote } from "./ClaimNote";
import { useClaimedCount } from "./claim";
import "./account.css";

const noop = () => () => {};
/** "#s=answer&t=…" → "#s=answer": the bill's secret never goes into a link that reaches the server. */
const stepOnly = (hash: string) => {
  const s = /(?:^#|&)s=([\w-]+)/.exec(hash);
  return s ? `#s=${s[1]}` : "";
};

/** After the answer: a small, skippable offer to keep this bill in an account. Never blocks the flow. */
export function SaveOffer({ sample }: { sample?: boolean }) {
  const { t } = useT();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const claimed = useClaimedCount();
  const here = useSyncExternalStore(
    noop,
    () => window.location.pathname + window.location.search + stepOnly(window.location.hash),
    () => null,
  );

  if (sample || isLoading) return null;
  if (isAuthenticated) return claimed > 0 ? <ClaimNote /> : null;
  if (!here) return null;
  return (
    <aside className="acct-offer rc-card" aria-labelledby="acct-offer-h">
      <p id="acct-offer-h" className="acct-offer-h">
        {t("acct.offerH")}
      </p>
      <p className="acct-offer-p">{t("acct.offerP")}</p>
      <Link href={`/account?next=${encodeURIComponent(here)}`} className="acct-offer-link">
        {t("acct.offerLink")}
      </Link>
    </aside>
  );
}
