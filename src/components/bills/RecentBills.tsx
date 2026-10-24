"use client";

import Link from "next/link";
import { BillRow } from "./BillRow";
import { useT } from "../i18n/I18nProvider";
import { useMyBills } from "./myBills";
import "./bills.css";


export function RecentBills() {
  const { t } = useT();
  const bills = useMyBills();
  if (bills.length === 0) return null;
  return (
    <section className="recent-bills" aria-labelledby="recent-bills-title">
      <h2 id="recent-bills-title" className="recent-bills-title">
        {t("bills.recentTitle")}
      </h2>
      <ul className="bill-slips">
        {bills.slice(0, 3).map((b) => (
          <BillRow key={b.id} id={b.id} token={b.token} addedAt={b.addedAt} />
        ))}
      </ul>
      <Link href="/bills" className="btn btn-quiet bills-see-all">
        {t("bills.seeAll", { n: bills.length })}
      </Link>
    </section>
  );
}
