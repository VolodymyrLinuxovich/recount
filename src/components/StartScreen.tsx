"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { RecentBills } from "./bills/RecentBills";
import { rememberCase } from "./bills/myBills";
import { useT } from "./i18n/I18nProvider";
import { InstallHint } from "./install/InstallHint";
import { Landing } from "./landing/Landing";
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
      const { id, token } = await start({ fileId, fileType: type, sample: false, lang, ...hospitalHint() });
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
      const { id, token } = await start({ fileId, fileType, sample: true, lang, ...hospitalHint() });
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

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="image/*,application/pdf"
      capture="environment"
      className="visually-hidden"
      id="bill-file"
      // The visible "Take a photo" / "Upload" buttons open it; it's not a Tab stop of its own.
      tabIndex={-1}
      aria-hidden="true"
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

  // One file input for both views, so a photo picked from the intro still arrives after the intro closes.
  const onboardingEl = onboard ? (
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
  ) : null;

  return (
    <>
      {fileInput}
      {onboardingEl ?? (
        <div className="start">
          <Landing
            actions={{
              onPhoto: photoTap,
              onSample: sampleTap,
              busy,
              photoLabel: busy === "photo" ? t("start.uploading") : t("start.photo"),
              sampleLabel: busy === "sample" ? t("start.sampleBusy") : t("start.sample"),
            }}
            error={errorNote}
            recent={<RecentBills />}
            install={<InstallHint />}
          />
        </div>
      )}
    </>
  );
}

/** "/?hospital=<key>" (from a hospital's audit page) tells the reader which hospital to expect. */
function hospitalHint(): { hospitalHint?: string } {
  if (typeof window === "undefined") return {};
  const key = new URLSearchParams(window.location.search).get("hospital");
  return key && /^[a-z0-9_-]{2,120}$/.test(key) ? { hospitalHint: key } : {};
}
