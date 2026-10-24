// Deterministic line-by-line checks of a bill against the hospital's own published prices.
// No model is involved here: every finding points at a bill line and a published number.

import type { ParsedBill } from "./bill";
import { normalizeCode, type HospitalRef } from "./hospital";
import { type Lang, money, pick } from "./lang";

export type FindingKind =
  | "DUPLICATE_LINE"
  | "ABOVE_LIST_PRICE"
  | "CASH_PRICE_GAP"
  | "TOTAL_MISMATCH"
  | "NOT_ITEMIZED";

export interface Evidence {
  label: string;
  value: string;
  source?: string;
}

export interface Finding {
  id: string;
  kind: FindingKind;
  lines: number[]; // indexes into bill.lines
  amount: number; // dollars this finding could take off the bill (0 if unknown)
  title: string;
  detail: string;
  evidence: Evidence[];
  confidence: "high" | "check";
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function checkBill(bill: ParsedBill, ref: HospitalRef | null, lang: Lang = "en"): Finding[] {
  const t = pick(lang);
  const out: Finding[] = [];

  if (!bill.isItemized || bill.lines.length === 0) {
    out.push({
      id: "not-itemized",
      kind: "NOT_ITEMIZED",
      lines: [],
      amount: 0,
      title: t("This is a summary bill", "Esta es una factura resumida"),
      detail: t(
        "Ask for an itemized bill with a code for every service. You can't check charges you can't see.",
        "Pida una factura detallada con un código para cada servicio. No se pueden revisar cargos que no se ven.",
      ),
      evidence: [],
      confidence: "high",
    });
  }

  // Same code, same date, same amount, listed more than once.
  const seen = new Map<string, number>();
  bill.lines.forEach((l, i) => {
    const code = normalizeCode(l.code);
    if (!code) return;
    const key = `${code}|${l.date ?? ""}|${l.charge.toFixed(2)}`;
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, i);
      return;
    }
    out.push({
      id: `dup-${i}`,
      kind: "DUPLICATE_LINE",
      lines: [first, i],
      amount: l.charge,
      title: t(`${l.description} is billed twice`, `${l.description} aparece cobrado dos veces`),
      detail: t(
        `Lines ${first + 1} and ${i + 1} have the same code, date and amount. Sometimes that's real (two doses), often it's a double entry. Ask the hospital to confirm or remove it.`,
        `Las líneas ${first + 1} y ${i + 1} tienen el mismo código, fecha y monto. A veces es correcto (dos dosis), pero muchas veces es un cobro repetido. Pida al hospital que lo confirme o lo quite.`,
      ),
      evidence: [
        { label: t("Code", "Código"), value: code },
        { label: t("Date", "Fecha"), value: l.date ?? t("not printed", "no aparece") },
        { label: t("Amount", "Monto"), value: money(l.charge) },
      ],
      confidence: "check",
    });
  });

  // Compare each line to the hospital's own price file.
  if (ref?.mrf) {
    const src = ref.mrf.url;
    bill.lines.forEach((l, i) => {
      const code = normalizeCode(l.code);
      if (!code) return;
      const row = ref.mrf!.prices[code];
      if (!row) return;
      const qty = l.quantity > 0 ? l.quantity : 1;
      const perUnit = l.charge / qty;
      if (row.grossCharge != null && perUnit > row.grossCharge + 0.5) {
        const over = r2((perUnit - row.grossCharge) * qty);
        out.push({
          id: `list-${i}`,
          kind: "ABOVE_LIST_PRICE",
          lines: [i],
          amount: over,
          title: t(
            `${l.description} is billed above the hospital's own list price`,
            `${l.description} cuesta más que el precio publicado por el propio hospital`,
          ),
          detail: t(
            `Billed ${money(perUnit)} per unit, but the hospital's published standard charge is ${money(row.grossCharge)}.`,
            `Le cobraron ${money(perUnit)} por unidad, pero el precio estándar que publica el hospital es ${money(row.grossCharge)}.`,
          ),
          evidence: [
            { label: t("Billed per unit", "Cobrado por unidad"), value: money(perUnit) },
            { label: t("Published gross charge", "Precio publicado"), value: money(row.grossCharge), source: src },
          ],
          confidence: "high",
        });
      }
      const selfPay = !bill.insurancePayer;
      if (selfPay && row.discountedCash != null && perUnit > row.discountedCash + 0.5) {
        const gap = r2((perUnit - Math.max(row.discountedCash, 0)) * qty);
        out.push({
          id: `cash-${i}`,
          kind: "CASH_PRICE_GAP",
          lines: [i],
          amount: gap,
          title: t(
            `${l.description}: the cash price is ${money(row.discountedCash * qty)}`,
            `${l.description}: el precio en efectivo es ${money(row.discountedCash * qty)}`,
          ),
          detail: t(
            `You were billed ${money(l.charge)}. The hospital publishes a discounted cash price of ${money(row.discountedCash)} per unit for this service. As a self-pay patient you can ask for it.`,
            `Le cobraron ${money(l.charge)}. El hospital publica un precio en efectivo con descuento de ${money(row.discountedCash)} por unidad para este servicio. Como paciente sin seguro, puede pedirlo.`,
          ),
          evidence: [
            { label: t("Billed", "Cobrado"), value: money(l.charge) },
            { label: t("Published cash price", "Precio en efectivo publicado"), value: money(row.discountedCash), source: src },
          ],
          confidence: "high",
        });
      }
    });
  }

  // Do the lines add up to the printed total?
  if (bill.totalCharges != null && bill.lines.length > 0) {
    const sum = r2(bill.lines.reduce((a, l) => a + l.charge, 0));
    if (Math.abs(sum - bill.totalCharges) > 1) {
      // If parts of the photo were hard to read, the gap is more likely our misreading than the hospital's math.
      const unsure = bill.unreadable.length > 0;
      out.push({
        id: "total",
        kind: "TOTAL_MISMATCH",
        lines: [],
        amount: unsure ? 0 : Math.max(0, r2(bill.totalCharges - sum)),
        title: unsure
          ? t("The lines we read don't add up to the total", "Las líneas que leímos no suman el total")
          : t("The lines don't add up to the total", "Las líneas no suman el total"),
        detail: unsure
          ? t(
              `The charges we read add up to ${money(sum)}, but the bill says ${money(bill.totalCharges)}. Part of the photo was hard to read, so we may have misread a number. Please check each amount against your bill.`,
              `Los cargos que leímos suman ${money(sum)}, pero la factura dice ${money(bill.totalCharges)}. Parte de la foto era difícil de leer, así que quizás leímos mal un número. Por favor compare cada monto con su factura.`,
            )
          : t(
              `The listed charges add up to ${money(sum)}, but the bill says total charges are ${money(bill.totalCharges)}.`,
              `Los cargos de la lista suman ${money(sum)}, pero la factura dice que el total es ${money(bill.totalCharges)}.`,
            ),
        evidence: [
          { label: t("Sum of lines", "Suma de las líneas"), value: money(sum) },
          { label: t("Printed total", "Total impreso"), value: money(bill.totalCharges) },
        ],
        confidence: "check",
      });
    }
  }

  return out;
}

/**
 * Most a patient could save from line findings. A line can have several findings
 * (above list price AND above cash price); count each line once, at its largest amount.
 */
export function potentialSavings(findings: Finding[]): number {
  const perLine = new Map<number, number>();
  let other = 0;
  for (const f of findings) {
    if (f.lines.length === 0) {
      other += f.amount;
      continue;
    }
    // A duplicate's amount belongs to its repeated line (the last index).
    const line = f.lines[f.lines.length - 1];
    perLine.set(line, Math.max(perLine.get(line) ?? 0, f.amount));
  }
  return r2(other + [...perLine.values()].reduce((a, b) => a + b, 0));
}
