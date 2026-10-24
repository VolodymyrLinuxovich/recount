"use client";

import Link from "next/link";
import { useT } from "../i18n/I18nProvider";
import { useMyBills } from "./myBills";
import "./bills.css";


export function MyBillsLink() {
  const { t } = useT();
  const n = useMyBills().length;
  if (n === 0) return null;
  return (
    <Link href="/bills" className="bills-link" aria-label={t("bills.linkAria", { n })}>
      {t("bills.link")}
      <span className="bills-link-count" aria-hidden="true">({n})</span>
    </Link>
  );
}
