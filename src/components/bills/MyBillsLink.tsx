"use client";

import Link from "next/link";
import { useT } from "../i18n/I18nProvider";
import { useMyBills } from "./myBills";
import "./bills.css";

/** "My bills (2)" in the masthead. On phones it folds to a bill icon and the count. */
export function MyBillsLink() {
  const { t } = useT();
  const n = useMyBills().length;
  if (n === 0) return null;
  return (
    <Link href="/bills" className="bills-link" aria-label={t("bills.linkAria", { n })}>
      <svg className="bills-link-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M6 3.5h12v15.5l-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M9 8h6M9 11.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="bills-link-text" aria-hidden="true">
        {t("bills.link")}
      </span>
      <span className="bills-link-count" aria-hidden="true">
        {n}
      </span>
    </Link>
  );
}
