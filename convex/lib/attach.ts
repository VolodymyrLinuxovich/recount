// What a patient may attach to a Lupa chat message: one photo or PDF (a bill, an insurance
// statement, a collection or denial letter). Checked on the server against the stored file's own
// metadata; the web and phone apps check the same limits first so people get the message sooner.

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PDF_TYPE = "application/pdf";
/** Photos: the model accepts images up to 5 MB, and the apps shrink phone photos well below that. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** Attached files are deleted this long after they're sent (sooner if the bill is deleted). */
export const FILE_KEEP_MS = 30 * 24 * 60 * 60_000;
/** An upload must be used within this long, so an old file id can't be attached later. */
export const FRESH_MS = 60 * 60_000;
export const MAX_FILE_NAME = 120;

export type AttachProblem = "type" | "size" | "missing";

/** The media type to use for a stored file, or null if we don't accept it. */
export function attachType(contentType: string | null | undefined, claimed?: string | null): string | null {
  const t = (contentType || claimed || "").toLowerCase().split(";")[0].trim();
  const norm = t === "image/jpg" ? "image/jpeg" : t;
  if (norm === PDF_TYPE || (IMAGE_TYPES as readonly string[]).includes(norm)) return norm;
  return null;
}

/** Why this file can't be attached, or null if it's fine. */
export function attachProblem(meta: { contentType?: string | null; size: number } | null, claimed?: string | null): AttachProblem | null {
  if (!meta) return "missing";
  const type = attachType(meta.contentType, claimed);
  if (!type) return "type";
  if (meta.size <= 0) return "missing";
  if (meta.size > (type === PDF_TYPE ? MAX_PDF_BYTES : MAX_IMAGE_BYTES)) return "size";
  return null;
}

export function attachMessage(p: AttachProblem, lang: "en" | "es"): string {
  const es = lang === "es";
  if (p === "type") return es ? "Solo puede adjuntar una foto (JPG, PNG o WebP) o un PDF." : "You can attach a photo (JPG, PNG or WebP) or a PDF.";
  if (p === "size") return es ? "El archivo es demasiado grande. Use una foto de menos de 5 MB o un PDF de menos de 10 MB." : "That file is too big. Please use a photo under 5 MB or a PDF under 10 MB.";
  return es ? "No encontramos el archivo. Adjúntelo otra vez." : "We couldn't find that file. Please attach it again.";
}

/** A short, safe name to show on the chip: no path, no control characters, no long numbers (an account number in a name). */
export function cleanFileName(name: string | undefined | null): string | undefined {
  if (!name) return undefined;
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\d[\d\s-]{4,}\d/g, (m) => (m.replace(/\D/g, "").length >= 6 ? "#" : m)).trim().slice(0, MAX_FILE_NAME);
  return clean || undefined;
}
