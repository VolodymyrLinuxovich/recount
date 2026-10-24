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
import type { PlainKey } from "./i18n/strings";
import { FileProblem, prepareFile } from "./prepareFile";

export function StartScreen() {
  const router = useRouter();
  const { t, lang } = useT();
  const generateUploadUrl = useMutation(api.cases.generateUploadUrl);
  const start = useMutation(api.cases.start);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "photo" | "sample">(null);
  const [error, setError] = useState<PlainKey | null>(null);

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
    } catch (e) {
      setError(/too many/i.test(String(e)) ? "start.busy" : "start.sampleFailed");
      setBusy(null);
    }
  }

  return (
    <section className="start">
      <p className="eyebrow">{t("start.eyebrow")}</p>
      <h1 className="promise">{t("start.promise")}</h1>
      <p className="lede">{t("start.lede")}</p>

      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="visually-hidden"
        id="bill-file"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <button className="btn btn-primary btn-big" onClick={() => input.current?.click()} disabled={busy !== null}>
        {busy === "photo" ? t("start.uploading") : t("start.photo")}
      </button>
      <p className="hint">{t("start.hint")}</p>
      <button className="btn btn-quiet" onClick={onSample} disabled={busy !== null}>
        {busy === "sample" ? t("start.sampleBusy") : t("start.sample")}
      </button>
      {error && (
        <p className="error-note" role="alert">
          {t(error)}
        </p>
      )}

      <InstallHint />

      <RecentBills />

      <ol className="how">
        <li>
          <span className="how-n">1</span>
          <span>{t("start.how1")}</span>
        </li>
        <li>
          <span className="how-n">2</span>
          <span>{t("start.how2")}</span>
        </li>
        <li>
          <span className="how-n">3</span>
          <span>{t("start.how3")}</span>
        </li>
      </ol>
    </section>
  );
}
