import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { linesFromTables, money, type Table } from "../convex/lib/docIntel";

// The real Azure AI Document Intelligence (prebuilt-layout) tables for eval bill-001, a synthetic
// CPMC bill from eval/: the header table plus the 10-line charges table.
const bill001 = JSON.parse(readFileSync(new URL("./fixtures/docintel-bill-001.tables.json", import.meta.url), "utf8")) as Table[];

const table = (rows: string[][]): Table => ({
  rowCount: rows.length,
  columnCount: Math.max(...rows.map((r) => r.length)),
  cells: rows.flatMap((r, rowIndex) => r.map((content, columnIndex) => ({ rowIndex, columnIndex, content }))),
});

describe("money", () => {
  it("reads printed amounts", () => {
    expect(money("8,003.00")).toBe(8003);
    expect(money("$647.00")).toBe(647);
    expect(money("(25.00)")).toBe(-25);
    expect(money("")).toBeNull();
    expect(money("08/13/2026")).toBeNull();
    expect(money("n/a")).toBeNull();
    expect(money("12,34.00")).toBeNull();
    expect(money(".50")).toBe(0.5);
    expect(money("-1,200")).toBe(-1200);
  });
});

describe("linesFromTables", () => {
  it("reads every line of a real bill, in order, and skips the header table", () => {
    const lines = linesFromTables(bill001);
    expect(lines.map((l) => l.code)).toEqual(["99285", "74177", "80053", "85025", "81001", "36415", "J7030", "96374", "J2405", "96374"]);
    expect(lines.map((l) => l.charge)).toEqual([8003, 8287, 386, 217, 125, 28, 150, 647, 75, 647]);
  });

  it("skips totals and payments and joins a table split across pages", () => {
    const head = ["DATE", "REV", "CPT/HCPCS", "DESCRIPTION", "QTY", "CHARGES"];
    const page1 = table([head, ["08/13/2026", "0450", "99284", "ED LEVEL 4", "1", "5,214.00"]]);
    const page2 = table([head, ["08/13/2026", "0324", "71046", "XR CHEST 2 VIEWS", "1", "804.00"], ["", "", "", "TOTAL CHARGES", "", "6,018.00"], ["", "", "", "INSURANCE PAID", "", "0.00"]]);
    expect(linesFromTables([page1, page2])).toEqual([
      { code: "99284", charge: 5214 },
      { code: "71046", charge: 804 },
    ]);
  });

  it("uses the last money column when there's a unit price before the charges", () => {
    const t = table([["CODE", "DESCRIPTION", "UNIT PRICE", "QTY", "CHARGE"], ["J2405", "ONDANSETRON", "18.75", "4", "75.00"]]);
    expect(linesFromTables([t])).toEqual([{ code: "J2405", charge: 75 }]);
  });

  it("returns nothing when no table has a charges column", () => {
    expect(linesFromTables([table([["Statement Date", "09/11/2026"], ["Account Number", "123"]])])).toEqual([]);
  });
});
