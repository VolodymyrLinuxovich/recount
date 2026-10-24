"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useT } from "../i18n/I18nProvider";
import { money, shortDate, type CaseView } from "../types";
import { forgetCase, privateLink } from "./myBills";
import "./bills.css";
import "../account/account.css";

type Row = CaseView & { createdAt?: number };

export function BillRow({ id, token, addedAt, inAccount }: { id: string; token?: string; addedAt: number; inAccount?: boolean }) {
  if (!/^[0-9a-z]{25,40}$/.test(id)) return <GoneRow id={id} />;
  return (
    <RowBoundary fallback={(retry) => <FailedRow id={id} retry={retry} />}>
      <LiveRow id={id} token={token} addedAt={addedAt} inAccount={inAccount} />
    </RowBoundary>
  );
}

function LiveRow({ id, token, addedAt, inAccount }: { id: string; token?: string; addedAt: number; inAccount?: boolean }) {
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
      {inAccount && <p className="bill-slip-acct">✓ {t("bills.inAccount")}</p>}
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
        {/* An account bill stays listed while signed in, so "hide from this list" would do nothing. */}
        {!inAccount && <RemoveControl id={id} />}
      </div>
      {token && <DeleteControl id={id} token={token} name={name} />}
    </li>
  );
}

/** The clipboard API, or the old select-and-copy where it's blocked (some in-app browsers, http). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
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
          if (await copyText(link)) {
            setState("copied");
            setTimeout(() => setState("idle"), 2000);
          } else setState("failed");
        }}
      >
        {state === "copied" ? `✓ ${t("bills.linkCopied")}` : t("bills.copyLink")}
      </button>
      <span className="visually-hidden" role="status">
        {state === "copied" ? t("bills.linkCopied") : ""}
      </span>
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

/** Delete the bill for good (its photo, answers and letters), unlike Hide, which only clears this list. */
function DeleteControl({ id, token, name }: { id: string; token: string; name: string }) {
  const { t } = useT();
  const remove = useMutation(api.cases.remove);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // The question replaces the button: focus follows it in, and comes back on "Keep it".
  const askRef = useRef<HTMLParagraphElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);
  useEffect(() => {
    if (asking) askRef.current?.focus();
    else if (wasAsking.current) triggerRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  async function del() {
    setBusy(true);
    setFailed(false);
    try {
      await remove({ id: id as Id<"cases">, token });
      forgetCase(id);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  const qid = `del-q-${id}`;
  return (
    <div className="bill-slip-delete">
      {!asking ? (
        <button
          ref={triggerRef}
          type="button"
          className="bill-slip-text-btn bill-slip-delete-btn"
          aria-label={`${t("case.delete")}: ${name}`}
          onClick={() => setAsking(true)}
        >
          {t("case.delete")}
        </button>
      ) : (
        <div
          role="alertdialog"
          aria-labelledby={qid}
          className="bill-slip-confirm bill-slip-confirm-del"
          onKeyDown={(e) => e.key === "Escape" && !busy && setAsking(false)}
        >
          <p id={qid} ref={askRef} tabIndex={-1}>
            {t("case.deleteAsk")}
          </p>
          <div className="bill-slip-confirm-btns">
            <button type="button" className="btn btn-primary btn-danger-fill" onClick={del} disabled={busy}>
              {busy ? t("case.deleting") : t("case.deleteYes")}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setAsking(false)} disabled={busy}>
              {t("case.deleteNo")}
            </button>
          </div>
        </div>
      )}
      {failed && (
        <p className="error-note" role="alert">
          {t("case.deleteFailed")}
        </p>
      )}
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
