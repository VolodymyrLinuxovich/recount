// A bill can be up to MAX_PAGES photos (a paper bill photographed page by page). Page 1 stays in
// cases.fileId / fileType, so old bills and single files read exactly as before; pages 2..N are in
// cases.morePages, in order. Everything that reads or deletes a bill's file goes through billPages.
import type { Lang } from "./lang";

export const MAX_PAGES = 6;
/** All pages together. The model gets them in one request (base64 adds a third on top). */
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export type PageProblem = "count" | "pdf" | "size";

/**
 * What's wrong with a set of pages, or null if it's fine: 1 to MAX_PAGES files, only images when
 * there is more than one (a PDF carries its own pages and goes alone), not too big in all.
 * totalBytes may be null when the sizes aren't known.
 */
export function pagesProblem(types: string[], totalBytes: number | null): PageProblem | null {
  if (types.length < 1 || types.length > MAX_PAGES) return "count";
  if (types.length > 1 && types.some((t) => !t.startsWith("image/"))) return "pdf";
  if (types.length > 1 && totalBytes !== null && totalBytes > MAX_TOTAL_BYTES) return "size";
  return null;
}

export function pagesMessage(p: PageProblem, lang: Lang): string {
  const es = lang === "es";
  if (p === "count") return es ? `Puede enviar de 1 a ${MAX_PAGES} páginas por factura.` : `You can send 1 to ${MAX_PAGES} pages for one bill.`;
  if (p === "pdf") return es ? "Un PDF se envía solo. Para varias páginas, envíe fotos." : "A PDF goes on its own. For several pages, send photos.";
  return es ? "Estas fotos son demasiado grandes juntas. Quite una página o tome fotos más cercanas." : "These photos are too big together. Remove a page or take closer photos.";
}

/** Every page of a bill in order: page 1 from fileId, then morePages. Empty when there's no file. */
export function billPages<Id>(c: { fileId?: Id; fileType?: string; morePages?: { fileId: Id; type: string }[] }): { fileId: Id; type: string | undefined }[] {
  if (!c.fileId) return [];
  return [{ fileId: c.fileId, type: c.fileType }, ...(c.morePages ?? [])];
}

/** The instruction that tells a reader these files are one bill. Empty for a single file. */
export function pagesNote(n: number): string {
  if (n <= 1) return "";
  return `\n- These ${n} images are pages 1 to ${n} of ONE bill, in order. Read every line item on every page and list them in page order. The printed total is usually on the last page. Report each field once for the whole bill.`;
}

/** Lines read page by page, joined in page order. */
export function joinPages<T>(perPage: T[][]): T[] {
  return perPage.flat();
}

/** Run fn over items with at most `limit` running at once; results keep the items' order. */
export async function inOrder<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
