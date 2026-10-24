"use client";

import Link from "next/link";
import { BillRow } from "./BillRow";
import { useT } from "../i18n/I18nProvider";
import { useHydrated, useMyBills } from "./myBills";
import "./bills.css";


export function MyBillsScreen() {
  const { t } = useT();
  const bills = useMyBills();
  const hydrated = useHydrated();

  if (!hydrated) return <p className="quiet">{t("bills.loading")}</p>;

  if (bills.length === 0)
    return (
      <section className="bills-page">
        <h1 className="bills-title">{t("bills.title")}</h1>
        <p className="bills-empty">{t("bills.empty")}</p>
        <p className="bills-note">{t("bills.emptyHint")}</p>
        <Link href="/" className="btn btn-primary btn-big">
          {t("bills.checkFirst")}
        </Link>
      </section>
    );

  return (
    <section className="bills-page">
      <h1 className="bills-title">{t("bills.title")}</h1>
      <Link href="/" className="btn btn-primary btn-big">
        {t("bills.checkAnother")}
      </Link>
      <ul className="bill-slips">
        {bills.map((b) => (
          <BillRow key={b.id} id={b.id} token={b.token} addedAt={b.addedAt} />
        ))}
      </ul>
      <p className="bills-note">{t("bills.savedHere")}</p>
    </section>
  );
}
