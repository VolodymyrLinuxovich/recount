import { describe, expect, it } from "vitest";
import type { ParsedBill } from "../convex/lib/bill";
import { checkBill } from "../convex/lib/checks";
import { assess, povertyLine, type FplTable } from "../convex/lib/eligibility";
import type { HospitalRef } from "../convex/lib/hospital";

const FPL: FplTable = { year: 2026, source: "test", base: 15000, perAdditional: 5000 };

const ref: HospitalRef = {
  key: "h",
  name: "Test Hospital",
  source: "snapshot",
  fetchedAt: "2026-10-24",
  mrf: {
    url: "https://example.org/mrf.json",
    lastUpdated: null,
    prices: {
      "99284": { description: "ED visit", grossCharge: 2000, discountedCash: 800, min: 300, max: 1500 },
      "85025": { description: "CBC", grossCharge: 100, discountedCash: 40, min: 10, max: 80 },
    },
  },
  fap: { url: "https://example.org/fap.pdf", freeCareMaxFplPct: 200, discountMaxFplPct: 400, quotes: [], phone: null, applicationUrl: null },
  warnings: [],
};

function bill(lines: ParsedBill["lines"], extra: Partial<ParsedBill> = {}): ParsedBill {
  return {
    hospitalName: "Test Hospital", hospitalWebsite: null, billingPhone: null, accountNumber: "1", patientName: null,
    statementDate: null, serviceDate: null, insurancePayer: null, insurancePaid: 0, adjustments: 0, patientPaid: 0,
    totalCharges: lines.reduce((a, l) => a + l.charge, 0), amountDue: null, isItemized: true, lines, unreadable: [], ...extra,
  };
}

const L = (code: string, charge: number, qty = 1) => ({ date: "2026-09-12", code, revCode: null, description: code, quantity: qty, charge });

describe("checkBill", () => {
  it("flags a duplicate line once", () => {
    const f = checkBill(bill([L("85025", 100), L("85025", 100)]), ref).filter((x) => x.kind === "DUPLICATE_LINE");
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([0, 1]);
  });

  it("flags a charge above the published gross charge, per unit", () => {
    const f = checkBill(bill([L("99284", 2400)]), ref).find((x) => x.kind === "ABOVE_LIST_PRICE");
    expect(f?.amount).toBe(400);
    // Two units at the list price is fine.
    expect(checkBill(bill([L("85025", 200, 2)]), ref).find((x) => x.kind === "ABOVE_LIST_PRICE")).toBeUndefined();
  });

  it("shows the cash price gap only for self-pay bills", () => {
    expect(checkBill(bill([L("99284", 2000)]), ref).find((x) => x.kind === "CASH_PRICE_GAP")?.amount).toBe(1200);
    expect(checkBill(bill([L("99284", 2000)], { insurancePayer: "Blue Shield" }), ref).find((x) => x.kind === "CASH_PRICE_GAP")).toBeUndefined();
  });

  it("ignores lines with no code or unknown codes", () => {
    const f = checkBill(bill([{ ...L("x", 50), code: null }, L("12345", 999)]), ref);
    expect(f.filter((x) => x.kind !== "TOTAL_MISMATCH")).toHaveLength(0);
  });

  it("catches totals that don't add up", () => {
    const b = bill([L("85025", 100)], { totalCharges: 250 });
    expect(checkBill(b, ref).find((x) => x.kind === "TOTAL_MISMATCH")?.amount).toBe(150);
  });
});

describe("assess", () => {
  it("computes the poverty line by household size", () => {
    expect(povertyLine(FPL, 1)).toBe(15000);
    expect(povertyLine(FPL, 4)).toBe(30000);
  });

  it("free care under the hospital's own cutoff", () => {
    const e = assess({ size: 4, annualIncome: 45000, insured: false }, FPL, ref, 5000);
    expect(e.fplPct).toBe(150);
    expect(e.tier).toBe("FREE");
    expect(e.owedEstimate).toBe(0);
  });

  it("discount between the free cutoff and 400%", () => {
    expect(assess({ size: 1, annualIncome: 45000, insured: false }, FPL, ref, 5000).tier).toBe("DISCOUNT");
  });

  it("uses the 400% state floor when the hospital policy says less", () => {
    const low = { ...ref, fap: { ...ref.fap!, discountMaxFplPct: 350 } };
    expect(assess({ size: 1, annualIncome: 59000, insured: false }, FPL, low, 5000).tier).toBe("DISCOUNT");
  });

  it("above 400% is not eligible under the state rule", () => {
    expect(assess({ size: 1, annualIncome: 61000, insured: false }, FPL, ref, 5000).tier).toBe("NOT_ELIGIBLE");
  });

  it("insured patients need high medical costs (over 10% of income)", () => {
    expect(assess({ size: 1, annualIncome: 30000, insured: true }, FPL, ref, 5000).tier).toBe("NEEDS_INFO");
    expect(assess({ size: 1, annualIncome: 30000, insured: true, outOfPocket12mo: 2000 }, FPL, ref, 5000).tier).toBe("NOT_ELIGIBLE");
    expect(assess({ size: 1, annualIncome: 30000, insured: true, outOfPocket12mo: 4000 }, FPL, ref, 5000).tier).toBe("FREE");
  });

  it("without a hospital policy, only the state discount floor applies", () => {
    const e = assess({ size: 4, annualIncome: 30000, insured: false }, FPL, null, 5000);
    expect(e.tier).toBe("DISCOUNT");
    expect(e.medicalLikely).toBe(true);
  });
});
