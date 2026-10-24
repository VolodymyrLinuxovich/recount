import { describe, expect, it } from "vitest";
import data from "../convex/lib/statewidePrices.json";
import { HOSPITALS, hasStatewidePrices, pricedRefFromIndex } from "../convex/lib/statewide";
import { checkBill } from "../convex/lib/checks";

const priced = Object.keys((data as { hospitals: Record<string, unknown> }).hospitals);

describe("statewide prices from the Apify batch", () => {
  it("only covers hospitals in the HCAI index", () => {
    const keys = new Set(HOSPITALS.map((h) => h.key));
    for (const k of priced) expect(keys.has(k)).toBe(true);
  });

  it("keeps cash prices at or below the list price", () => {
    for (const k of priced) {
      const ref = pricedRefFromIndex(HOSPITALS.find((h) => h.key === k)!);
      for (const row of Object.values(ref.mrf!.prices)) {
        expect(row.grossCharge).toBeGreaterThan(0);
        if (row.discountedCash != null) expect(row.discountedCash).toBeLessThanOrEqual(row.grossCharge! * 1.01);
      }
    }
  });

  it("adds prices to the policy facts and leaves unpriced hospitals policy-only", () => {
    const withPrices = HOSPITALS.find((h) => hasStatewidePrices(h.key))!;
    const without = HOSPITALS.find((h) => !hasStatewidePrices(h.key))!;
    const a = pricedRefFromIndex(withPrices);
    expect(a.mrf?.url).toMatch(/^https?:\/\//);
    expect(a.policyOnly).toBe(false);
    expect(a.fap?.url).toBe(withPrices.fap.url);
    const b = pricedRefFromIndex(without);
    expect(b.mrf).toBeNull();
    expect(b.policyOnly).toBe(true);
  });

  it("flags a charge above the published list price", () => {
    const h = HOSPITALS.find((x) => hasStatewidePrices(x.key))!;
    const ref = pricedRefFromIndex(h);
    const [code, row] = Object.entries(ref.mrf!.prices)[0];
    const bill = {
      hospitalName: h.name, hospitalAddress: null, patientName: null, patientAddress: null, accountNumber: null,
      serviceDate: null, statementDate: null, insurance: null, totalCharges: row.grossCharge! * 2, adjustments: null,
      payments: null, amountDue: row.grossCharge! * 2, unreadable: [],
      lines: [{ date: null, code, description: "test", qty: 1, charge: row.grossCharge! * 2, chargePrinted: null }],
    };
    const findings = checkBill(bill as never, ref, "en");
    expect(findings.some((f) => f.amount > 0)).toBe(true);
  });
});
