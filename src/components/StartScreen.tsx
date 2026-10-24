"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function StartScreen() {
  const router = useRouter();
  const generateUploadUrl = useMutation(api.cases.generateUploadUrl);
  const create = useMutation(api.cases.create);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "photo" | "sample">(null);
  const [error, setError] = useState<string | null>(null);

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
      const fileId = await upload(file);
      const id = await create({ fileId, fileType: file.type || "image/jpeg", sample: false });
      router.push(`/case/${id}`);
    } catch {
      setError("We couldn't upload that file. Check your connection and try again.");
      setBusy(null);
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
      const id = await create({ fileId, fileType, sample: true });
      router.push(`/case/${id}`);
    } catch {
      setError("Something went wrong starting the sample. Try again.");
      setBusy(null);
    }
  }

  return (
    <section className="start">
      <p className="eyebrow">For ER bills in San Francisco</p>
      <h1 className="promise">
        Got a hospital bill you can&rsquo;t pay? Let&rsquo;s check it line by line, and see if you owe anything at all.
      </h1>
      <p className="lede">
        We compare your bill with the hospital&rsquo;s own published prices and California&rsquo;s charity care rules.
        Then we draft the letters. You read them and decide. Nothing is sent for you.
      </p>

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
        {busy === "photo" ? "Uploading your bill…" : "Take a photo of your bill"}
      </button>
      <p className="hint">Or choose a photo or PDF you already have. Get the page that lists each charge, if you can.</p>
      <button className="btn btn-quiet" onClick={onSample} disabled={busy !== null}>
        {busy === "sample" ? "Opening the sample…" : "Try a sample bill"}
      </button>
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}

      <ol className="how">
        <li>
          <span className="how-n">1</span>
          <span>We read every line and mark the ones that don&rsquo;t match the hospital&rsquo;s own numbers.</span>
        </li>
        <li>
          <span className="how-n">2</span>
          <span>You answer three questions about your household.</span>
        </li>
        <li>
          <span className="how-n">3</span>
          <span>You get a plain answer, the rule behind it, and letters ready to send.</span>
        </li>
      </ol>
    </section>
  );
}
