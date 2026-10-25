"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { rememberCase } from "../bills/myBills";
import { useT } from "../i18n/I18nProvider";
import type { PlainKey } from "../i18n/strings";
import { FileProblem, prepareFile } from "../prepareFile";

/**
 * "Try again" on a bill we couldn't read: open the camera or file picker right here,
 * send the new file as a new bill and open it, without going back to the home page.
 */
export function useReupload() {
  const router = useRouter();
  const { lang } = useT();
  const generateUploadUrl = useMutation(api.cases.generateUploadUrl);
  const start = useMutation(api.cases.start);
  const input = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlainKey | null>(null);

  async function onFile(file: File | undefined) {
    if (!file || running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const { blob, type } = await prepareFile(file);
      const url = await generateUploadUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": type || "image/jpeg" }, body: blob });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const { id, token } = await start({ fileId: storageId, fileType: type, sample: false, lang });
      rememberCase(id, token);
      router.push(`/case/${id}#t=${token}`);
    } catch (e) {
      setError(e instanceof FileProblem ? e.key : /too many/i.test(String(e)) ? "start.busy" : "start.uploadFailed");
      setBusy(false);
    } finally {
      running.current = false;
      if (input.current) input.current.value = "";
    }
  }

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="image/*,application/pdf"
      capture="environment"
      className="visually-hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => onFile(e.target.files?.[0])}
    />
  );

  // Called straight from the tap, so the browser lets the picker open.
  const pick = () => {
    if (!running.current) input.current?.click();
  };

  return { fileInput, pick, busy, error };
}
