"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { Component, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useT } from "../i18n/I18nProvider";
import { money, shortDate, type CaseView } from "../types";
import { forgetCase, privateLink } from "./myBills";
import "./bills.css";

type Row = CaseView & { createdAt?: number };

export function BillRow({ id, token, addedAt }: { id: string; token?: string; addedAt: number }) {
  if (!/^[0-9a-z]{25,40}$/.test(id)) return <GoneRow id={id} />;
  return (
    <RowBoundary fallback={(retry) => <FailedRow id={id} retry={retry} />}>
      <LiveRow id={id} token={token} addedAt={addedAt} />
    </RowBoundary>
  );
}

function LiveRow({ id, token, addedAt }: { id: string; token?: string; addedAt: number }) {
  const { t, lang } = useT();
  const c = useQuery(api.cases.get, { id: id as Id<"cases">, token }) as Row | null | undefined;

  if (c === undefined)
    return (
      <li className="bill-slip bill-slip-loading" aria-busy="true">
        <p className="bill-slip-quiet">{t("bills.rowLoading")}</p>
      </li>
    );
  // Without its secret the backend hides a bill; that isn't the same as the bill being gone.
  if (c === null) return token ? <GoneRow id={id} /> : <NoKeyRow id={id} />;

  const name = c.bill?.hospitalName || c.hospital?.name || t("bills.untitled");
  const when = c.bill?.serviceDate
    ? t("bills.visit", { date: shortDate(c.bill.serviceDate, lang) })
    : t("bills.added", {
        date: shortDate(new Date(c.createdAt ?? addedAt).toISOString(), lang),
      });
  const amount = typeof c.bill?.amountDue === "number" ? c.bill.amountDue : null;
  const tier = c.eligibility?.tier && c.eligibility.tier !== "NEEDS_INFO" ? t(`bills.tier.${c.eligibility.tier}`) : "";
  const n = c.findings?.length;
  const flags = n === undefined ? "" : t("bills.flags", { n });
  const tone = c.status === "approved" ? "ok" : c.status === "needs_household" ? "todo" : c.status === "error" ? "bad" : "plain";

  return (
    <li className="bill-slip">
      <p className="bill-slip-name">{name}</p>
      <p className="bill-slip-meta">{when}</p>
      {amount !== null && (
        <p className="bill-slip-amount">
          {t("bills.billSays")} <strong>{money(amount, true, lang)}</strong>
        </p>
      )}
      <p className="bill-slip-status-row">
        <span className={`bill-pill bill-tone-${tone}`}>{t(`bills.status.${c.status}`)}</span>
      </p>
      {(tier || flags) && (
        <p className="bill-slip-facts">
          {tier && <span className="bill-slip-tier">{tier}</span>}
          {flags && <span>{flags}</span>}
        </p>
      )}
      <Link href={`/case/${id}`} className="btn btn-primary bill-slip-open" aria-label={`${t("bills.open")}: ${name}`}>
        {t("bills.open")}
      </Link>
      <div className="bill-slip-tools">
        {token && <CopyLink id={id} token={token} />}
        <RemoveControl id={id} />
      </div>
    </li>
  );
}

function CopyLink({ id, token }: { id: string; token: string }) {
  const { t } = useT();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const link = privateLink(id, token);
  return (
    <>
      <button
        type="button"
        className="bill-slip-text-btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setState("copied");
            setTimeout(() => setState("idle"), 2000);
          } catch {
            setState("failed");
          }
        }}
      >
        {state === "copied" ? t("bills.linkCopied") : t("bills.copyLink")}
      </button>
      {state === "failed" && <p className="bill-slip-quiet bill-slip-link">{t("bills.copyFailed", { link })}</p>}
    </>
  );
}

function NoKeyRow({ id }: { id: string }) {
  const { t } = useT();
  return (
    <li className="bill-slip bill-slip-gone">
      <p className="bill-slip-name">{t("bills.noKey")}</p>
      <p className="bill-slip-quiet">{t("bills.noKeyHint")}</p>
      <button type="button" className="btn btn-quiet bill-slip-remove" onClick={() => forgetCase(id)}>
        {t("bills.remove")}
      </button>
    </li>
  );
}

function FailedRow({ id, retry }: { id: string; retry: () => void }) {
  const { t } = useT();
  return (
    <li className="bill-slip bill-slip-gone">
      <p className="bill-slip-name">{t("bills.rowFailed")}</p>
      <div className="bill-slip-confirm-btns">
        <button type="button" className="btn btn-primary" onClick={retry}>
          {t("bills.retry")}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => forgetCase(id)}>
          {t("bills.remove")}
        </button>
      </div>
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
      <button type="button" className="bill-slip-text-btn" onClick={() => setAsking(true)}>
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

/**
 * A query that throws (a saved id from another deployment, or a passing network or deploy hiccup) shows a retry,
 * not "No longer available": a bill that is still there must not look deleted.
 */
class RowBoundary extends Component<{ fallback: (retry: () => void) => ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children;
  }
}
