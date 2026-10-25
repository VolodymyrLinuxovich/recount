// One way to turn a printed amount into dollars, for every read of a bill: Claude's chargePrinted,
// the Claude column read and Document Intelligence's table cells.

const INT = String.raw`(\d{1,3}(?:,\d{3})+|\d+)`;
// Dollars and cents in separate boxes, as on a UB-04 claim form: "11963 00".
const SPLIT_CENTS = new RegExp(String.raw`^${INT}\s+(\d{2})$`);
const PLAIN = new RegExp(String.raw`^${INT}?(\.\d{1,2})?$`);
// A full amount with cents, then something that isn't part of it (a pen mark next to the charge read as text).
const WITH_NOISE = new RegExp(String.raw`^${INT}(\.\d{2})\s+\S.*$`);

/**
 * "$1,234.50" -> 1234.5, "(25.00)" -> -25, "11963 00" -> 11963, "135.00 45" -> 135.
 * Anything else (a date, "n/a", "135.0045", "12,34.00") -> null. Never strips characters to force a number:
 * "11963 00" read as 1196300 is exactly the kind of mistake this exists to stop.
 */
export function printedAmount(raw: string | null | undefined): number | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^\$\s*/, "");
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1).trim().replace(/^\$\s*/, "");
  }
  let n: number | null = null;
  let m = SPLIT_CENTS.exec(s);
  if (m) n = Number(`${m[1].replace(/,/g, "")}.${m[2]}`);
  else if ((m = PLAIN.exec(s)) && (m[1] || m[2])) n = Number(`${(m[1] ?? "0").replace(/,/g, "")}${m[2] ?? ""}`);
  else if ((m = WITH_NOISE.exec(s))) n = Number(`${m[1].replace(/,/g, "")}${m[2]}`);
  if (n === null || !Number.isFinite(n)) return null;
  return neg ? -n : n;
}
