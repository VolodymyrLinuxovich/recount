"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import { type SavedBill, useMyBills } from "../bills/myBills";

export type ListedBill = SavedBill & { inAccount?: boolean };

/**
 * My bills: the bills saved on this phone, plus (signed in) the account's bills from the server.
 * One row per bill, newest first; account bills are marked.
 */
export function useAllBills(): { bills: ListedBill[]; signedIn: boolean } {
  const phone = useMyBills();
  const { isAuthenticated } = useConvexAuth();
  const mine = useQuery(api.cases.mine, isAuthenticated ? {} : "skip");
  const bills = useMemo(() => {
    if (!isAuthenticated || !mine?.length) return phone as ListedBill[];
    const byId = new Map<string, ListedBill>();
    const onPhone = new Map(phone.map((b) => [b.id, b]));
    for (const m of mine) {
      const p = onPhone.get(m.id);
      byId.set(m.id, { id: m.id, token: m.token ?? p?.token, addedAt: p?.addedAt ?? m.createdAt, inAccount: true });
    }
    for (const p of phone) if (!byId.has(p.id)) byId.set(p.id, p);
    return [...byId.values()].sort((a, b) => b.addedAt - a.addedAt);
  }, [phone, mine, isAuthenticated]);
  return { bills, signedIn: isAuthenticated };
}
