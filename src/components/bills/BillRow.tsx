"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { Component, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useT } from "../i18n/I18nProvider";
import { money, shortDate, type CaseView } from "../types";
import { forgetCase } from "./myBills";
import "./bills.css";


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
  const { t, lang } = useT();
  const c = useQuery(api.cases.get, { id: id as Id<"cases"> }) as Row | null | undefined;

  if (c === undefined)
    return (
      <li className="bill-slip bill-slip-loading" aria-busy="true">
        <p className="bill-slip-quiet">{t("bills.rowLoading")}</p>
      </li>
    );
  if (c === null) return <GoneRow id={id} />;

  const name = c.bill?.hospitalName || c.hospital?.name || t("bills.untitled");
  const when = c.bill?.serviceDate
    ? t("bills.visit", { date: shortDate(c.bill.serviceDate, lang) })
    : t("bills.added", { date: shortDate(new Date(c.createdAt ?? addedAt).toISOString(), lang) });
  const amount = typeof c.bill?.amountDue === "number" ? c.bill.amountDue : null;
  const tier = c.eligibility?.tier && c.eligibility.tier !== "NEEDS_INFO" ? t(`bills.tier.${c.eligibility.tier}`) : "";
  const n = c.findings?.length;
  const flags = n === undefined ? "" : t("bills.flags", { n });
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
                {t("bills.billSays")} <strong>{money(amount, true, lang)}</strong>
              </span>
            </>
          )}
        </span>
        <span className={`bill-slip-status bill-tone-${tone}`}>{t(`bills.status.${c.status}`)}</span>
        {(tier || flags) && (
          <span className="bill-slip-facts">
            {tier && <span className="bill-slip-tier">{tier}</span>}
            {flags && <span>{flags}</span>}
          </span>
        )}
        <span className="bill-slip-go">{t("bills.open")} &rarr;</span>
      </Link>
      <RemoveControl id={id} />
    </li>
  );
}

function GoneRow({ id }: { id: string }) {
  const { t } = useT();
  return (
    <li className="bill-slip bill-slip-gone">
      <p className="bill-slip-name">{t("bills.gone")}</p>
      <p className="bill-slip-quiet">{t("bills.goneHint")}</p>
      <button type="button" className="btn btn-quiet bill-slip-remove" onClick={() => forgetCase(id)}>
        {t("bills.remove")}
      </button>
    </li>
  );
}

function RemoveControl({ id }: { id: string }) {
  const { t } = useT();
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className="bill-slip-remove-link" onClick={() => setAsking(true)}>
        {t("bills.removeFromPhone")}
      </button>
    );
  return (
    <div className="bill-slip-confirm" role="group" aria-label={t("bills.removeFromPhone")}>
      <p>{t("bills.confirmText")}</p>
      <div className="bill-slip-confirm-btns">
        <button type="button" className="btn btn-primary" onClick={() => forgetCase(id)}>
          {t("bills.confirmYes")}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setAsking(false)} autoFocus>
          {t("bills.confirmNo")}
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
