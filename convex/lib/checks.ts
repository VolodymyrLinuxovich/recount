// Deterministic line-by-line checks of a bill against the hospital's own published prices.
// No model is involved here: every finding points at a bill line and a published number.

import type { ParsedBill } from "./bill";
import { normalizeCode, type HospitalRef } from "./hospital";

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

const money = (x: number) => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (x: number) => Math.round(x * 100) / 100;

export function checkBill(bill: ParsedBill, ref: HospitalRef | null): Finding[] {
  const out: Finding[] = [];

  if (!bill.isItemized || bill.lines.length === 0) {
    out.push({
      id: "not-itemized",
      kind: "NOT_ITEMIZED",
      lines: [],
      amount: 0,
      title: "This is a summary bill",
      detail: "Ask for an itemized bill with a code for every service. You can't check charges you can't see.",
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
      title: `${l.description} is billed twice`,
      detail: `Lines ${first + 1} and ${i + 1} have the same code, date and amount. Sometimes that's real (two doses), often it's a double entry. Ask the hospital to confirm or remove it.`,
      evidence: [
        { label: "Code", value: code },
        { label: "Date", value: l.date ?? "not printed" },
        { label: "Amount", value: money(l.charge) },
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
          title: `${l.description} is billed above the hospital's own list price`,
          detail: `Billed ${money(perUnit)} per unit, but the hospital's published standard charge is ${money(row.grossCharge)}.`,
          evidence: [
            { label: "Billed per unit", value: money(perUnit) },
            { label: "Published gross charge", value: money(row.grossCharge), source: src },
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
          title: `${l.description}: the cash price is ${money(row.discountedCash * qty)}`,
          detail: `You were billed ${money(l.charge)}. The hospital publishes a discounted cash price of ${money(row.discountedCash)} per unit for this service. As a self-pay patient you can ask for it.`,
          evidence: [
            { label: "Billed", value: money(l.charge) },
            { label: "Published cash price", value: money(row.discountedCash), source: src },
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
      out.push({
        id: "total",
        kind: "TOTAL_MISMATCH",
        lines: [],
        amount: Math.max(0, r2(bill.totalCharges - sum)),
        title: "The lines don't add up to the total",
        detail: `The listed charges add up to ${money(sum)}, but the bill says total charges are ${money(bill.totalCharges)}.`,
        evidence: [
          { label: "Sum of lines", value: money(sum) },
          { label: "Printed total", value: money(bill.totalCharges) },
        ],
        confidence: "check",
      });
    }
  }

  return out;
}
