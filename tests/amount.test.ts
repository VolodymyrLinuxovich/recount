import { describe, expect, it } from "vitest";
import { printedAmount } from "../convex/lib/amount";
import { balanceOnly } from "../convex/lib/bill";

describe("printedAmount", () => {
  it("reads ordinary printed amounts", () => {
    expect(printedAmount("3,694.00")).toBe(3694);
    expect(printedAmount("$647.00")).toBe(647);
    expect(printedAmount("$ 12,741.00")).toBe(12741);
    expect(printedAmount("(25.00)")).toBe(-25);
    expect(printedAmount("-1,200")).toBe(-1200);
    expect(printedAmount(".50")).toBe(0.5);
    expect(printedAmount("268")).toBe(268);
  });

  it("reads dollars and cents printed in separate boxes, as on a UB-04", () => {
    // Before, stripping the space read this as $1,196,300.
    expect(printedAmount("11963 00")).toBe(11963);
    expect(printedAmount("4,312 50")).toBe(4312.5);
  });

  it("keeps a full amount and drops a pen mark read next to it", () => {
    expect(printedAmount("135.00 45")).toBe(135);
    expect(printedAmount("232.00 -100")).toBe(232);
  });

  it("refuses anything that isn't one amount", () => {
    expect(printedAmount("")).toBeNull();
    expect(printedAmount(null)).toBeNull();
    expect(printedAmount("n/a")).toBeNull();
    expect(printedAmount("08/13/2026")).toBeNull();
    expect(printedAmount("12,34.00")).toBeNull();
    expect(printedAmount("135.0045")).toBeNull();
    expect(printedAmount("1 5,214.00")).toBeNull();
    expect(printedAmount("(25.00")).toBeNull();
  });
});

describe("balanceOnly", () => {
  const base = { lines: [], isItemized: false, amountDue: 3803.87, totalCharges: null };
  it("is a collection letter or summary that gives only a balance", () => {
    expect(balanceOnly(base)).toBe(true);
    expect(balanceOnly({ ...base, amountDue: null, totalCharges: 5000 })).toBe(true);
  });
  it("is not an itemized bill whose lines couldn't be read, or a page with no amounts", () => {
    expect(balanceOnly({ ...base, isItemized: true })).toBe(false);
    expect(balanceOnly({ ...base, amountDue: null })).toBe(false);
  });
});
