"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { RecentBills } from "./bills/RecentBills";
import { rememberCase } from "./bills/myBills";
import { useT } from "./i18n/I18nProvider";
import { InstallHint } from "./install/InstallHint";
import { Onboarding, type OnboardPath } from "./onboarding/Onboarding";
import { hasOnboarded } from "./onboarding/seen";
import type { PlainKey } from "./i18n/strings";
import { FileProblem, prepareFile } from "./prepareFile";
import "./start.css";

export function StartScreen() {
  const router = useRouter();
  const { t, lang } = useT();
  const generateUploadUrl = useMutation(api.cases.generateUploadUrl);
  const start = useMutation(api.cases.start);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "photo" | "sample">(null);
  const [error, setError] = useState<PlainKey | null>(null);
  const [onboard, setOnboard] = useState<OnboardPath | null>(null);

  async function upload(file: Blob): Promise<Id<"_storage">> {
    const url = await generateUploadUrl();
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "image/jpeg" }, body: file });
    if (!res.ok) throw new Error("Upload failed");
    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
    return storageId;
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy("photo");
    setError(null);
    try {
      const { blob, type } = await prepareFile(file);
      const fileId = await upload(blob);
      const { id, token } = await start({ fileId, fileType: type, sample: false, lang });
      rememberCase(id, token);
      router.push(`/case/${id}#t=${token}`);
      // Next keeps this page alive in the background: reset it so coming back shows a fresh start.
      setBusy(null);
      setOnboard(null);
    } catch (e) {
      setError(e instanceof FileProblem ? e.key : /too many/i.test(String(e)) ? "start.busy" : "start.uploadFailed");
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function onSample() {
    setBusy("sample");
    setError(null);
    try {
      let fileId: Id<"_storage"> | undefined;
      let fileType: string | undefined;
      const res = await fetch("/sample-bill.png", { cache: "no-store" }).catch(() => null);
      if (res?.ok && res.headers.get("content-type")?.startsWith("image/")) {
        const blob = await res.blob();
        fileId = await upload(blob);
        fileType = blob.type || "image/png";
      }
      const { id, token } = await start({ fileId, fileType, sample: true, lang });
      rememberCase(id, token);
      router.push(`/case/${id}#t=${token}`);
      // Next keeps this page alive in the background: reset it so coming back shows a fresh start.
      setBusy(null);
      setOnboard(null);
    } catch (e) {
      setError(/too many/i.test(String(e)) ? "start.busy" : "start.sampleFailed");
      setBusy(null);
    }
  }

  const steps = [
    ["start.how1Title", "start.how1"],
    ["start.how2Title", "start.how2"],
    ["start.how3Title", "start.how3"],
  ] as const;
  const checks = [
    ["start.check1Title", "start.check1"],
    ["start.check2Title", "start.check2"],
    ["start.check3Title", "start.check3"],
  ] as const;

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="image/*,application/pdf"
      capture="environment"
      className="visually-hidden"
      id="bill-file"
      onChange={(e) => onFile(e.target.files?.[0])}
    />
  );
  const errorNote = error && (
    <p className="error-note start-error" role="alert">
      {t(error)}
    </p>
  );

  // First visit: a short "before you start" before the camera opens or the sample starts.
  function photoTap() {
    if (hasOnboarded("photo")) input.current?.click();
    else setOnboard("photo");
  }
  function sampleTap() {
    if (hasOnboarded("sample")) onSample();
    else setOnboard("sample");
  }

  if (onboard) {
    return (
      <>
        {fileInput}
        <Onboarding
          path={onboard}
          busy={busy !== null}
          error={errorNote}
          onPhoto={() => {
            // Still inside the tap, so the browser lets the file picker open.
            input.current?.click();
            setOnboard(null);
          }}
          onSample={onSample}
          onClose={() => setOnboard(null)}
        />
      </>
    );
  }

  return (
    <div className="start">
      {fileInput}
      <section className="start-hero" aria-labelledby="start-title">
        <h1 id="start-title" className="start-title">
          {t("start.promise")}
        </h1>
        <p className="start-pitch">{t("start.promise2")}</p>

        <div className="start-actions">
          <button className="btn btn-primary start-btn" onClick={photoTap} disabled={busy !== null}>
            {busy === "photo" ? t("start.uploading") : t("start.photo")}
          </button>
          <button className="btn start-btn start-btn-2" onClick={sampleTap} disabled={busy !== null}>
            {busy === "sample" ? t("start.sampleBusy") : t("start.sample")}
          </button>
        </div>
        {errorNote}
        <p className="start-trust">{t("start.trust")}</p>
      </section>

      <RecentBills />

      <section className="start-section" aria-labelledby="start-how">
        <h2 id="start-how" className="start-h2">
          {t("start.howTitle")}
        </h2>
        <ol className="start-steps">
          {steps.map(([title, body], i) => (
            <li key={title}>
              <span className="start-step-n" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3 className="start-h3">{t(title)}</h3>
                <p>{t(body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="start-section" aria-labelledby="start-check">
        <h2 id="start-check" className="start-h2">
          {t("start.checkTitle")}
        </h2>
        <ul className="start-checks">
          {checks.map(([title, body]) => (
            <li key={title}>
              <h3 className="start-h3">{t(title)}</h3>
              <p>{t(body)}</p>
            </li>
          ))}
        </ul>
        <p className="start-audit">
          <Link href="/audit" className="start-link">
            {t("start.auditLink")}
          </Link>
        </p>
      </section>

      <div className="start-install">
        <InstallHint />
      </div>
    </div>
  );
}
