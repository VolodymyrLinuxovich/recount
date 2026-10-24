"use client";

import { useEffect } from "react";
import { useT } from "../i18n/I18nProvider";
import { clearClaimed, useClaimedCount } from "./claim";

/** "We added N bills to your account", once, after sign-in. */
export function ClaimNote() {
  const { t } = useT();
  const n = useClaimedCount();
  // Said once: leaving the page clears it.
  useEffect(() => () => clearClaimed(), []);
  return (
    <p className="acct-claimed" role="status">
      {n > 0 ? `✓ ${t("acct.claimed", { n })}` : ""}
    </p>
  );
}
