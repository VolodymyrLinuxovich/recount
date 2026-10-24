"use client";

import Link from "next/link";
import { useMyBills } from "./myBills";
import "./bills.css";

const S = {
  label: "My bills",
  aria: (n: number) => `My bills, ${n} saved on this phone`,
};

export function MyBillsLink() {
  const n = useMyBills().length;
  if (n === 0) return null;
  return (
    <Link href="/bills" className="bills-link" aria-label={S.aria(n)}>
      {S.label}
      <span className="bills-link-count">{n}</span>
    </Link>
  );
}
