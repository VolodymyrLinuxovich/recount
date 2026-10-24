"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { forgetCase } from "../bills/myBills";
import { useT } from "../i18n/I18nProvider";

/** The danger zone: delete the account, and optionally every bill in it. Asks first. */
export function DeleteAccount() {
  const { t } = useT();
  const remove = useMutation(api.account.remove);
  const mine = useQuery(api.cases.mine);
  const { signOut } = useAuthActions();
  const [asking, setAsking] = useState(false);
  const [bills, setBills] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const ask = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (asking) ask.current?.focus();
  }, [asking]);

  async function del() {
    setBusy(true);
    setFailed(false);
    const ids = (mine ?? []).map((m) => m.id);
    try {
      await remove({ deleteBills: bills });
    } catch {
      setFailed(true);
      setBusy(false);
      return;
    }
    // The bills are gone from the server, so drop them from this phone's list too.
    if (bills) ids.forEach((id) => forgetCase(id));
    try {
      await signOut();
    } catch {
      // The session was already deleted with the account.
    }
  }

  return (
    <section className="acct-danger" aria-labelledby="acct-danger-h">
      <h2 id="acct-danger-h" className="acct-sec-h">
        {t("acct.deleteH")}
      </h2>
      {!asking ? (
        <>
          <p className="acct-quiet">{t("acct.deleteLede")}</p>
          <button type="button" className="btn btn-quiet btn-danger acct-wide" onClick={() => setAsking(true)}>
            {t("acct.delete")}
          </button>
        </>
      ) : (
        <div role="group" aria-labelledby="acct-del-q" className="acct-confirm" onKeyDown={(e) => e.key === "Escape" && !busy && setAsking(false)}>
          <h3 id="acct-del-q" ref={ask} tabIndex={-1} className="acct-confirm-h">
            {t("acct.deleteAsk")}
          </h3>
          <p>{t("acct.deleteWhat")}</p>
          <label className="details-remember acct-check">
            <input type="checkbox" checked={bills} onChange={(e) => setBills(e.target.checked)} />
            <span>
              <span className="details-remember-h">{t("acct.deleteBills")}</span>
              <span className="quiet details-remember-hint">{bills ? t("acct.deleteBillsOn") : t("acct.deleteBillsOff")}</span>
            </span>
          </label>
          <div className="acct-confirm-btns">
            <button type="button" className="btn btn-primary btn-danger-fill" onClick={del} disabled={busy}>
              {busy ? t("acct.deleting") : t("acct.deleteYes")}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setAsking(false)} disabled={busy}>
              {t("acct.deleteNo")}
            </button>
          </div>
        </div>
      )}
      {failed && (
        <p className="error-note" role="alert">
          {t("acct.deleteFailed")}
        </p>
      )}
    </section>
  );
}
