"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { Component, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { money, shortDate, type CaseView, type Status } from "../types";
import { forgetCase } from "./myBills";
import "./bills.css";

const S = {
  loading: "Loading this bill…",
  untitled: "Hospital bill",
  visit: "Visit",
  added: "Added",
  billSays: "Bill says",
  open: "Open",
  status: {
    reading: "Reading",
    needs_household: "Needs your answers",
    drafting: "Writing your letters",
    ready: "Letters ready",
    approved: "Approved, ready to send",
    error: "Couldn't read",
  } satisfies Record<Status, string>,
  tier: {
    FREE: "Likely free care",
    DISCOUNT: "Likely discount",
    NOT_ELIGIBLE: "Likely doesn't qualify",
    NEEDS_INFO: "",
  } as Record<string, string>,
  noFlags: "No charges flagged",
  oneFlag: "1 charge flagged",
  manyFlags: (n: number) => `${n} charges flagged`,
  gone: "No longer available",
  goneHint: "This bill was removed or can't be opened.",
  remove: "Remove",
  removeFromPhone: "Remove from this phone",
  confirmText: "Remove this bill from the list on this phone? You can still open it again from its link.",
  confirmYes: "Yes, remove",
  confirmNo: "Keep it",
};

type Row = CaseView & { createdAt?: number };

export function BillRow({ id, addedAt }: { id: string; addedAt: number }) {
  if (!/^[0-9a-z]{25,40}$/.test(id)) return <GoneRow id={id} />;
  return (
    <RowBoundary fallback={<GoneRow id={id} />}>
      <LiveRow id={id} addedAt={addedAt} />
    </RowBoundary>
  );
}

function LiveRow({ id, addedAt }: { id: string; addedAt: number }) {
  const c = useQuery(api.cases.get, { id: id as Id<"cases"> }) as Row | null | undefined;

  if (c === undefined)
    return (
      <li className="bill-slip bill-slip-loading" aria-busy="true">
        <p className="bill-slip-quiet">{S.loading}</p>
      </li>
    );
  if (c === null) return <GoneRow id={id} />;

  const name = c.bill?.hospitalName || c.hospital?.name || S.untitled;
  const when = c.bill?.serviceDate
    ? `${S.visit} ${shortDate(c.bill.serviceDate)}`
    : `${S.added} ${shortDate(new Date(c.createdAt ?? addedAt).toISOString())}`;
  const amount = typeof c.bill?.amountDue === "number" ? c.bill.amountDue : null;
  const tier = c.eligibility?.tier ? S.tier[c.eligibility.tier] : "";
  const n = c.findings?.length;
  const flags = n === undefined ? "" : n === 0 ? S.noFlags : n === 1 ? S.oneFlag : S.manyFlags(n);
  const tone = c.status === "error" ? "bad" : c.status === "needs_household" ? "todo" : "plain";

  return (
    <li className="bill-slip">
      <Link href={`/case/${id}`} className="bill-slip-open">
        <span className="bill-slip-name">{name}</span>
        <span className="bill-slip-meta">
          {when}
          {amount !== null && (
            <>
              <span aria-hidden="true"> · </span>
              <span className="bill-slip-amount">
                {S.billSays} <strong>{money(amount)}</strong>
              </span>
            </>
          )}
        </span>
        <span className={`bill-slip-status bill-tone-${tone}`}>{S.status[c.status] ?? c.status}</span>
        {(tier || flags) && (
          <span className="bill-slip-facts">
            {tier && <span className="bill-slip-tier">{tier}</span>}
            {flags && <span>{flags}</span>}
          </span>
        )}
        <span className="bill-slip-go">{S.open} &rarr;</span>
      </Link>
      <RemoveControl id={id} />
    </li>
  );
}

function GoneRow({ id }: { id: string }) {
  return (
    <li className="bill-slip bill-slip-gone">
      <p className="bill-slip-name">{S.gone}</p>
      <p className="bill-slip-quiet">{S.goneHint}</p>
      <button type="button" className="btn btn-quiet bill-slip-remove" onClick={() => forgetCase(id)}>
        {S.remove}
      </button>
    </li>
  );
}

function RemoveControl({ id }: { id: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className="bill-slip-remove-link" onClick={() => setAsking(true)}>
        {S.removeFromPhone}
      </button>
    );
  return (
    <div className="bill-slip-confirm" role="group" aria-label={S.removeFromPhone}>
      <p>{S.confirmText}</p>
      <div className="bill-slip-confirm-btns">
        <button type="button" className="btn btn-primary" onClick={() => forgetCase(id)}>
          {S.confirmYes}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setAsking(false)} autoFocus>
          {S.confirmNo}
        </button>
      </div>
    </div>
  );
}

/** A saved id from another deployment or a bad value makes the query throw; show it as unavailable. */
class RowBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
