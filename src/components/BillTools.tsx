"use client";

import { useConvex, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { forgetCase, privateLink } from "./bills/myBills";
import { useT } from "./i18n/I18nProvider";
import "./more.css";

/** Open the bill elsewhere, or delete it for good. */
export function BillTools({ id, token }: { id: string; token: string }) {
  const { t } = useT();
  const router = useRouter();
  const remove = useMutation(api.cases.remove);
  const convex = useConvex();
  const [fhir, setFhir] = useState<"idle" | "busy" | "failed">("idle");
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // The confirmation replaces the Delete button: focus follows it in, and comes back on "Keep it".
  const askRef = useRef<HTMLParagraphElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);
  useEffect(() => {
    if (asking) askRef.current?.focus();
    else if (wasAsking.current) triggerRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(privateLink(id, token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  /** The bill as an HL7 FHIR R4 bundle, saved as a .json file. */
  async function downloadFhir() {
    setFhir("busy");
    try {
      const bundle = await convex.query(api.fhir.exportCase, { id: id as Id<"cases">, token });
      if (!bundle) throw new Error("no bill");
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `recount-bill-${id.slice(-6)}.fhir.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFhir("idle");
    } catch {
      setFhir("failed");
    }
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
    <>
      <section className="bill-tools more-sec" aria-labelledby="share-h">
        <h2 id="share-h" className="more-h">
          {t("case.shareH")}
        </h2>
        <p className="more-body">{t("case.shareBody")}</p>
        <button className="btn btn-quiet more-btn" onClick={copy}>
          {copied ? t("case.copied") : t("case.copyLink")}
        </button>
      </section>

      <section className="bill-fhir more-sec" aria-labelledby="fhir-h">
        <h2 id="fhir-h" className="more-h">
          {t("fhir.h")}
        </h2>
        <p className="more-body">{t("fhir.body")}</p>
        <button className="btn btn-quiet more-btn" onClick={downloadFhir} disabled={fhir === "busy"}>
          {fhir === "busy" ? t("fhir.busy") : t("fhir.download")}
        </button>
        {fhir === "failed" && (
          <p className="error-note" role="alert">
            {t("fhir.failed")}
          </p>
        )}
      </section>

      <section className="bill-delete more-sec" aria-labelledby="del-h">
        <h2 id="del-h" className="more-h">
          {t("more.deleteH")}
        </h2>
        <p className="more-body">{t("more.deleteBody")}</p>
        <div>
          {!asking ? (
            <button ref={triggerRef} className="btn btn-danger more-btn" onClick={() => setAsking(true)}>
              {t("case.delete")}
            </button>
          ) : (
            <div
              role="alertdialog"
              aria-labelledby="del-q"
              className="bill-delete-ask"
              onKeyDown={(e) => e.key === "Escape" && !busy && setAsking(false)}
            >
              <p id="del-q" ref={askRef} tabIndex={-1}>{t("case.deleteAsk")}</p>
              <div className="more-btns">
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
    </>
  );
}
