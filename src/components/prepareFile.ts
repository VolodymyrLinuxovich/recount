// Get a chosen file ready to send: PDFs and common images go as they are,
// big or unusual images (HEIC, GIF, huge phone photos) are redrawn as a JPEG.

const SEND_AS_IS = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 3.5 * 1024 * 1024; // the model accepts images up to 5 MB
const MAX_SIDE = 2400;

/** A problem the patient can fix. `key` names the message in i18n/en.json. */
export class FileProblem extends Error {
  constructor(public key: "file.pdfTooBig" | "file.notImage" | "file.cantOpen" | "file.tooLarge") {
    super(key);
  }
}

export async function prepareFile(file: File): Promise<{ blob: Blob; type: string }> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (file.size > 30 * 1024 * 1024) throw new FileProblem("file.pdfTooBig");
    return { blob: file, type: "application/pdf" };
  }
  const looksLikeImage = file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name);
  if (!looksLikeImage) throw new FileProblem("file.notImage");
  if (SEND_AS_IS.has(file.type) && file.size <= MAX_BYTES) return { blob: file, type: file.type };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new FileProblem("file.cantOpen");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const q of [0.88, 0.78, 0.65]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= MAX_BYTES) return { blob, type: "image/jpeg" };
  }
  throw new FileProblem("file.tooLarge");
}
