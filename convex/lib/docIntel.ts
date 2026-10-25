// Optional second read of the bill with Azure AI Document Intelligence (prebuilt-layout).
// It reads the line-item table with OCR and table detection, not a language model, so it fails in
// different ways than the Claude read. Code compares the two, line by line, before anything is checked.
// On only when AZURE_DOCINTEL_ENDPOINT and AZURE_DOCINTEL_KEY are set; otherwise the second read
// stays a narrow Claude read of the charges column.
import { timeoutSignal } from "./timeout";

const API_VERSION = "2024-11-30";
export const DOCINTEL_MODEL = "prebuilt-layout";

const env = (k: string) => process.env[k]?.trim() || undefined;

export function docIntelOn(): boolean {
  return !!(env("AZURE_DOCINTEL_ENDPOINT") && env("AZURE_DOCINTEL_KEY"));
}

/** One cell as Document Intelligence returns it (only the fields we use). */
export type Cell = { rowIndex: number; columnIndex: number; content: string; kind?: string; columnSpan?: number };
export type Table = { rowCount: number; columnCount: number; cells: Cell[] };

export type TableLine = { code: string | null; charge: number };

const CHARGE_HEAD = /charge|amount|total|price/i;
const CODE_HEAD = /cpt|hcpcs|proc|code/i;
const DESC_HEAD = /desc|service|item/i;
const NOT_A_LINE = /total|payment|adjust|balance|amount due|subtotal|insurance paid/i;

/** "$1,234.50" -> 1234.5; "(25.00)" -> -25; anything else -> null. */
export function money(s: string): number | null {
  const t = s.trim().replace(/\s+/g, "");
  const m = /^(\()?(-)?\$?(\d{1,3}(?:,\d{3})+|\d+)?(\.\d+)?(\))?$/.exec(t);
  if (!m || (!m[3] && !m[4]) || !!m[1] !== !!m[5]) return null;
  const n = Number(`${(m[3] ?? "0").replace(/,/g, "")}${m[4] ?? ""}`);
  return m[1] || m[2] ? -n : n;
}

/**
 * Pull the line items out of the tables: find tables whose header names a charges column, then take
 * every row with a readable amount, in reading order, skipping totals and payments. A bill whose table
 * runs over several pages comes back as several tables with the same header, so they're joined.
 */
export function linesFromTables(tables: Table[]): TableLine[] {
  const out: TableLine[] = [];
  for (const t of tables) {
    const rows: string[][] = Array.from({ length: t.rowCount }, () => Array(t.columnCount).fill(""));
    for (const c of t.cells) rows[c.rowIndex][c.columnIndex] = c.content.trim();
    const headerAt = rows.findIndex((r) => r.some((x) => CHARGE_HEAD.test(x)) && r.some((x) => CODE_HEAD.test(x) || DESC_HEAD.test(x)));
    if (headerAt < 0) continue;
    const head = rows[headerAt];
    // The charges column is the last money-like header ("CHARGES" after "QTY" and "UNIT PRICE").
    const chargeCol = head.map((h, i) => (CHARGE_HEAD.test(h) ? i : -1)).filter((i) => i >= 0).pop()!;
    const codeCol = head.findIndex((h) => CODE_HEAD.test(h) && !/rev/i.test(h));
    for (const r of rows.slice(headerAt + 1)) {
      if (r.some((x) => NOT_A_LINE.test(x))) continue;
      const charge = money(r[chargeCol] ?? "");
      if (charge === null) continue;
      const code = codeCol >= 0 ? r[codeCol] || null : null;
      out.push({ code, charge });
    }
  }
  return out;
}

/** Send the bill to Document Intelligence and wait for the layout result. Throws on any failure. */
export async function analyzeLayout(base64: string, timeoutMs = 45_000): Promise<Table[]> {
  const base = env("AZURE_DOCINTEL_ENDPOINT")!.replace(/\/+$/, "");
  const key = env("AZURE_DOCINTEL_KEY")!;
  const headers = { "Ocp-Apim-Subscription-Key": key };
  const signal = timeoutSignal(timeoutMs);
  const start = await fetch(`${base}/documentintelligence/documentModels/${DOCINTEL_MODEL}:analyze?api-version=${API_VERSION}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ base64Source: base64 }),
    signal,
  });
  if (start.status !== 202) throw new Error(`Document Intelligence ${start.status}: ${(await start.text()).slice(0, 150)}`);
  const poll = start.headers.get("operation-location");
  if (!poll) throw new Error("Document Intelligence returned no operation location");
  for (;;) {
    await new Promise((r) => setTimeout(r, 800));
    const res = await fetch(poll, { headers, signal });
    if (!res.ok) throw new Error(`Document Intelligence ${res.status}`);
    const body = (await res.json()) as { status: string; analyzeResult?: { tables?: Table[] }; error?: { message?: string } };
    if (body.status === "succeeded") return body.analyzeResult?.tables ?? [];
    if (body.status === "failed") throw new Error(`Document Intelligence failed: ${body.error?.message ?? "unknown"}`);
  }
}
