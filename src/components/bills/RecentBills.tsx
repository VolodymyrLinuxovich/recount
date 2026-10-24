"use client";

import Link from "next/link";
import { BillRow } from "./BillRow";
import { useMyBills } from "./myBills";
import "./bills.css";

const S = {
  title: "Your recent bills",
  seeAll: (n: number) => (n > 3 ? `See all ${n} bills` : "See all your bills"),
};

export function RecentBills() {
  const bills = useMyBills();
  if (bills.length === 0) return null;
  return (
    <section className="recent-bills" aria-labelledby="recent-bills-title">
      <h2 id="recent-bills-title" className="recent-bills-title">
        {S.title}
      </h2>
      <ul className="bill-slips">
        {bills.slice(0, 3).map((b) => (
          <BillRow key={b.id} id={b.id} addedAt={b.addedAt} />
        ))}
      </ul>
      <Link href="/bills" className="btn btn-quiet bills-see-all">
        {S.seeAll(bills.length)}
      </Link>
    </section>
  );
}
