"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { forgetCase, privateLink } from "./bills/myBills";
import { useT } from "./i18n/I18nProvider";

/** Open the bill elsewhere, or delete it for good. */
export function BillTools({ id, token }: { id: string; token: string }) {
  const { t } = useT();
  const router = useRouter();
  const remove = useMutation(api.cases.remove);
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(privateLink(id, token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function del() {
    setBusy(true);
    setFailed(false);
    try {
      await remove({ id: id as Id<"cases">, token });
      forgetCase(id);
      router.push("/bills");
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <section className="bill-tools">
      <h2 className="h-small">{t("case.shareH")}</h2>
      <p className="quiet">{t("case.shareBody")}</p>
      <button className="btn btn-quiet" onClick={copy}>
        {copied ? t("case.copied") : t("case.copyLink")}
      </button>

      <div className="bill-delete">
        {!asking ? (
          <button className="btn btn-quiet btn-danger" onClick={() => setAsking(true)}>
            {t("case.delete")}
          </button>
        ) : (
          <div role="alertdialog" aria-labelledby="del-q" className="bill-delete-ask">
            <p id="del-q">{t("case.deleteAsk")}</p>
            <div className="row">
              <button className="btn btn-primary btn-danger-fill" onClick={del} disabled={busy}>
                {busy ? t("case.deleting") : t("case.deleteYes")}
              </button>
              <button className="btn btn-quiet" onClick={() => setAsking(false)} disabled={busy}>
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
    </section>
  );
}
