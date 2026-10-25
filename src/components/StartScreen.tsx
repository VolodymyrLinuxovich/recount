"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { rememberCase } from "./bills/myBills";
import { useT } from "./i18n/I18nProvider";
import { InstallHint } from "./install/InstallHint";
import { Landing } from "./landing/Landing";
import { Onboarding, type OnboardPath } from "./onboarding/Onboarding";
import { hasOnboarded } from "./onboarding/seen";
import type { PlainKey } from "./i18n/strings";
import { FileProblem, prepareFile } from "./prepareFile";
import { askNoticePermission } from "./flow/useDoneNotice";
import "./start.css";

const STEP_TIMEOUT_MS = 25_000;
const NAV_FALLBACK_MS = 6_000;

// Each network step of getting a bill gets a time limit, so a stalled request ends in the
// "upload failed" note instead of leaving the "getting your bill" screen up forever.
function withinTime<T>(p: Promise<T>, ms = STEP_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export function StartScreen() {
  const router = useRouter();
  const { t, lang } = useT();
  const generateUploadUrl = useMutation(api.cases.generateUploadUrl);
  const start = useMutation(api.cases.start);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "photo" | "sample">(null);
  const [error, setError] = useState<PlainKey | null>(null);
  const [onboard, setOnboard] = useState<OnboardPath | null>(null);
  // While a bill is on its way: the picture to show, how far along it is.
  const [getting, setGetting] = useState<Getting | null>(null);
  // A second tap (or a double tap) must not start a second bill: React state lands a render too late.
  const running = useRef(false);
  const previewUrl = useRef<string | null>(null);

  function freePreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
  }

  function reset() {
    running.current = false;
    freePreview();
    setGetting(null);
    setBusy(null);
    setOnboard(null);
  }

  // Next keeps this page alive in the background after we leave for the bill; its effects clean up then.
  // Resetting there means coming back shows a fresh start, while the "getting" screen stays up until we've left.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only touches refs and state setters
  useEffect(() => () => reset(), []);

  async function upload(file: Blob): Promise<Id<"_storage">> {
    const url = await withinTime(generateUploadUrl());
    const res = await withinTime(
      fetch(url, { method: "POST", headers: { "Content-Type": file.type || "image/jpeg" }, body: file }),
    );
    if (!res.ok) throw new Error("Upload failed");
    const { storageId } = (await withinTime(res.json())) as { storageId: Id<"_storage"> };
    return storageId;
  }

  // A client-side push can stall (a deploy swapping chunks, a flaky network). If we're still
  // here after a few seconds, load the bill page the plain way.
  function goToCase(url: string) {
    router.push(url);
    setTimeout(() => {
      if (!window.location.pathname.startsWith("/case/")) window.location.assign(url);
    }, NAV_FALLBACK_MS);
  }

  async function onFile(file: File | undefined) {
    if (!file || running.current) return;
    running.current = true;
    askNoticePermission();
    setBusy("photo");
    setError(null);
    freePreview();
    const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!pdf && file.type.startsWith("image/")) previewUrl.current = URL.createObjectURL(file);
    setGetting({ preview: previewUrl.current, pdf, stage: 0 });
    try {
      const { blob, type } = await prepareFile(file);
      setGetting((g) => g && { ...g, stage: 1 });
      const fileId = await upload(blob);
      setGetting((g) => g && { ...g, stage: 2 });
      const { id, token } = await withinTime(start({ fileId, fileType: type, sample: false, lang, ...hospitalHint() }));
      rememberCase(id, token);
      setGetting((g) => g && { ...g, stage: 3 });
      goToCase(`/case/${id}#t=${token}`);
    } catch (e) {
      setError(e instanceof FileProblem ? e.key : /too many/i.test(String(e)) ? "start.busy" : "start.uploadFailed");
      reset();
      if (input.current) input.current.value = "";
    }
  }

  async function onSample() {
    if (running.current) return;
    running.current = true;
    askNoticePermission();
    setBusy("sample");
    setError(null);
    freePreview();
    setGetting({ preview: "/sample-bill.png", pdf: false, stage: 1 });
    try {
      let fileId: Id<"_storage"> | undefined;
      let fileType: string | undefined;
      const res = await withinTime(fetch("/sample-bill.png", { cache: "no-store" })).catch(() => null);
      if (res?.ok && res.headers.get("content-type")?.startsWith("image/")) {
        const blob = await withinTime(res.blob());
        fileId = await upload(blob);
        fileType = blob.type || "image/png";
      }
      setGetting((g) => g && { ...g, stage: 2 });
      const { id, token } = await withinTime(start({ fileId, fileType, sample: true, lang, ...hospitalHint() }));
      rememberCase(id, token);
      setGetting((g) => g && { ...g, stage: 3 });
      goToCase(`/case/${id}#t=${token}`);
    } catch (e) {
      setError(/too many/i.test(String(e)) ? "start.busy" : "start.sampleFailed");
      reset();
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
    if (running.current) return;
    if (hasOnboarded("photo")) input.current?.click();
    else setOnboard("photo");
  }
  function sampleTap() {
    if (running.current) return;
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
      {getting ? <GettingBill {...getting} /> : onboardingEl ?? (
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
            install={<InstallHint />}
          />
        </div>
      )}
    </>
  );
}

interface Getting {
  /** An object URL for a photo, the sample's own image, or null for a PDF. */
  preview: string | null;
  pdf: boolean;
  /** 0 preparing, 1 sending, 2 opening the bill, 3 done. */
  stage: 0 | 1 | 2 | 3;
}

const STAGE_PCT = [12, 45, 80, 100];

/** "We're getting your bill": the whole screen, from the moment a photo is picked until the bill opens. */
function GettingBill({ preview, pdf, stage }: Getting) {
  const { t } = useT();
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    title.current?.focus({ preventScroll: true });
  }, []);
  const pct = STAGE_PCT[stage];
  return (
    <section className="getting" aria-busy="true">
      <div className="getting-pic">
        {preview ? (
          // An object URL of the patient's own photo: next/image can't optimize it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={t("start.gettingAlt")} className="getting-img" />
        ) : (
          <svg className="getting-doc" viewBox="0 0 32 32" role="img" aria-label={t(pdf ? "start.gettingPdf" : "start.gettingAlt")}>
            <path d="M8 4h12l5 5v19H8z" />
            <path d="M20 4v5h5M12 14h9M12 18h9M12 22h6" />
          </svg>
        )}
      </div>
      <h1 className="getting-h" ref={title} tabIndex={-1}>
        {t("start.gettingH")}
      </h1>
      <div
        className="getting-bar"
        role="progressbar"
        aria-label={t("start.gettingProgress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span className="getting-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="getting-p" role="status">
        {t("start.gettingBody")}
      </p>
    </section>
  );
}

/** "/?hospital=<key>" (from a hospital's audit page) tells the reader which hospital to expect. */
function hospitalHint(): { hospitalHint?: string } {
  if (typeof window === "undefined") return {};
  const key = new URLSearchParams(window.location.search).get("hospital");
  return key && /^[a-z0-9_-]{2,120}$/.test(key) ? { hospitalHint: key } : {};
}
