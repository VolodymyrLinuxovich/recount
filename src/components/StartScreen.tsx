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
import { BillPages, type BillPage } from "./BillPages";
import { MAX_PAGES, MAX_TOTAL_BYTES, addPages, isPdf, movePage, removePage } from "./pageList";
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
  // "Choose pages from your photos": the same picker without the camera, several at once.
  const library = useRef<HTMLInputElement>(null);
  // A paper bill photographed page by page, before it's sent. Null until the first photo.
  const [pages, setPages] = useState<BillPage[] | null>(null);
  const [adding, setAdding] = useState(false);
  // The same list for event handlers (every setPages below updates it too).
  const pagesRef = useRef<BillPage[] | null>(null);
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

  function freePages() {
    for (const p of pagesRef.current ?? []) URL.revokeObjectURL(p.url);
    pagesRef.current = null;
    setPages(null);
  }

  function reset() {
    running.current = false;
    freePreview();
    freePages();
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

  /** Files from either picker. One PDF goes straight through; photos become pages to review. */
  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (input.current) input.current.value = "";
    if (library.current) library.current.value = "";
    if (!files.length || running.current || adding) return;
    const current = pagesRef.current ?? [];
    if (!current.length && files.length === 1 && isPdf(files[0])) return onFile(files[0]);
    if (files.some(isPdf)) {
      setError("pages.pdfAlone");
      return;
    }
    setError(null);
    setAdding(true);
    const room = Math.max(0, MAX_PAGES - current.length);
    const ready: BillPage[] = [];
    let problem: PlainKey | null = files.length > room ? "pages.tooMany" : null;
    for (const f of files.slice(0, room)) {
      try {
        const { blob, type } = await prepareFile(f);
        ready.push({ id: crypto.randomUUID(), blob, type, url: URL.createObjectURL(blob) });
      } catch (e) {
        problem = e instanceof FileProblem ? e.key : "file.cantOpen";
      }
    }
    setAdding(false);
    const next = addPages(pagesRef.current ?? [], ready);
    for (const p of next.dropped) URL.revokeObjectURL(p.url);
    if (next.list.length) {
      pagesRef.current = next.list;
      setPages(next.list);
    }
    if (problem) setError(problem);
  }

  function changePages(f: (list: BillPage[]) => BillPage[]) {
    const list = f(pagesRef.current ?? []);
    pagesRef.current = list;
    setPages(list);
    setError(null);
  }

  function removeAt(i: number) {
    const gone = pagesRef.current?.[i];
    if (gone) URL.revokeObjectURL(gone.url);
    const left = removePage(pagesRef.current ?? [], i);
    if (left.length) changePages(() => left);
    else freePages();
  }

  /** "Check my bill": send every page, in order, as one bill. */
  async function onCheck() {
    const list = pagesRef.current;
    if (!list?.length || running.current) return;
    if (list.length > 1 && list.reduce((n, p) => n + p.blob.size, 0) > MAX_TOTAL_BYTES) {
      setError("pages.tooBig");
      return;
    }
    running.current = true;
    askNoticePermission();
    setBusy("photo");
    setError(null);
    setGetting({ preview: list[0].url, pdf: false, stage: 1 });
    try {
      const ids = await Promise.all(list.map((p) => upload(p.blob)));
      setGetting((g) => g && { ...g, stage: 2 });
      const morePages = list.slice(1).map((p, i) => ({ fileId: ids[i + 1], type: p.type }));
      const { id, token } = await withinTime(
        start({ fileId: ids[0], fileType: list[0].type, ...(morePages.length ? { morePages } : {}), sample: false, lang, ...hospitalHint() }),
      );
      rememberCase(id, token);
      setGetting((g) => g && { ...g, stage: 3 });
      goToCase(`/case/${id}#t=${token}`);
    } catch (e) {
      // Keep the pages so the patient can try again without taking the photos again.
      setError(/too many/i.test(String(e)) ? "start.busy" : "start.uploadFailed");
      running.current = false;
      setGetting(null);
      setBusy(null);
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
      multiple
      className="visually-hidden"
      id="bill-file"
      // The visible "Take a photo" / "Upload" buttons open it; it's not a Tab stop of its own.
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => onFiles(e.target.files)}
    />
  );
  const libraryInput = (
    <input
      ref={library}
      type="file"
      accept="image/*"
      multiple
      className="visually-hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => onFiles(e.target.files)}
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
      {libraryInput}
      {getting ? (
        <GettingBill {...getting} />
      ) : pages?.length ? (
        <BillPages
          pages={pages}
          adding={adding}
          error={errorNote}
          onAddCamera={() => input.current?.click()}
          onAddLibrary={() => library.current?.click()}
          onMove={(i, dir) => changePages((l) => movePage(l, i, dir))}
          onRemove={removeAt}
          onCheck={onCheck}
          onStartOver={() => {
            freePages();
            setError(null);
          }}
        />
      ) : onboardingEl ?? (
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
