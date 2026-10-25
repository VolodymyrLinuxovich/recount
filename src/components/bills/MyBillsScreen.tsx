"use client";

import Link from "next/link";
import { BillRow } from "./BillRow";
import { useT } from "../i18n/I18nProvider";
import { useHydrated } from "./myBills";
import { ClaimNote } from "../account/ClaimNote";
import { useAllBills } from "../account/useAllBills";
import "./bills.css";
import "../account/account.css";

/** Signed out, a quiet pointer to accounts. Optional: everything here works without one. */
function SignInHint() {
  const { t } = useT();
  return (
    <p className="bills-signin">
      <Link href="/account?next=%2Fbills">{t("bills.signInHint")}</Link>
    </p>
  );
}

export function MyBillsScreen() {
  const { t } = useT();
  const { bills, signedIn } = useAllBills();
  const hydrated = useHydrated();

  if (!hydrated) return <p className="quiet">{t("bills.loading")}</p>;

  if (bills.length === 0)
    return (
      <section className="bills-page bills-page-empty">
        <h1 className="bills-title">{t("bills.title")}</h1>
        <p className="bills-empty">{signedIn ? t("bills.emptyAccount") : t("bills.empty")}</p>
        <p className="bills-note">{t("bills.emptyHint")}</p>
        <Link href="/" className="btn btn-primary btn-big">
          {t("bills.checkFirst")}
        </Link>
        {!signedIn && <SignInHint />}
      </section>
    );

  return (
    <section className="bills-page">
      <h1 className="bills-title">{t("bills.title")}</h1>
      {signedIn && <ClaimNote />}
      <Link href="/" className="btn btn-primary btn-big">
        {t("bills.checkAnother")}
      </Link>
      <ul className="bill-slips">
        {bills.map((b) => (
          <BillRow key={b.id} id={b.id} token={b.token} addedAt={b.addedAt} inAccount={b.inAccount} />
        ))}
      </ul>
      <p className="bills-note">{signedIn ? t("bills.savedAccount") : t("bills.savedHere")}</p>
      {!signedIn && <SignInHint />}
    </section>
  );
}
