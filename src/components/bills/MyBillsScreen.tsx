"use client";

import Link from "next/link";
import { BillRow } from "./BillRow";
import { useHydrated, useMyBills } from "./myBills";
import "./bills.css";

const S = {
  title: "Your bills",
  checkAnother: "Check another bill",
  checkFirst: "Check a bill",
  empty: "You haven't checked a bill on this phone yet.",
  emptyHint: "When you check a bill, it will show up here so you can come back to it.",
  savedHere: "This list is saved only on this phone. On another phone or computer, open the bill's link instead.",
  loading: "Loading your bills…",
};

export function MyBillsScreen() {
  const bills = useMyBills();
  const hydrated = useHydrated();

  if (!hydrated) return <p className="quiet">{S.loading}</p>;

  if (bills.length === 0)
    return (
      <section className="bills-page">
        <h1 className="bills-title">{S.title}</h1>
        <p className="bills-empty">{S.empty}</p>
        <p className="bills-note">{S.emptyHint}</p>
        <Link href="/" className="btn btn-primary btn-big">
          {S.checkFirst}
        </Link>
      </section>
    );

  return (
    <section className="bills-page">
      <h1 className="bills-title">{S.title}</h1>
      <Link href="/" className="btn btn-primary btn-big">
        {S.checkAnother}
      </Link>
      <ul className="bill-slips">
        {bills.map((b) => (
          <BillRow key={b.id} id={b.id} addedAt={b.addedAt} />
        ))}
      </ul>
      <p className="bills-note">{S.savedHere}</p>
    </section>
  );
}
