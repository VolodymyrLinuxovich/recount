import { describe, expect, it } from "vitest";
import type { ParsedBill } from "../convex/lib/bill";
import { checkBill } from "../convex/lib/checks";
import { linesFromPages, linesFromTables, type Table } from "../convex/lib/docIntel";
import { MAX_PAGES, MAX_TOTAL_BYTES, billPages, inOrder, joinPages, pagesMessage, pagesNote, pagesProblem } from "../convex/lib/pages";
import { addPages, isPdf, movePage, removePage } from "../src/components/pageList";

const table = (rows: string[][]): Table => ({
  rowCount: rows.length,
  columnCount: Math.max(...rows.map((r) => r.length)),
  cells: rows.flatMap((r, rowIndex) => r.map((content, columnIndex) => ({ rowIndex, columnIndex, content }))),
});

describe("pagesProblem", () => {
  it("takes one file of any kind, or up to six photos", () => {
    expect(pagesProblem(["application/pdf"], null)).toBeNull();
    expect(pagesProblem(["image/jpeg"], 1000)).toBeNull();
    expect(pagesProblem(Array(MAX_PAGES).fill("image/jpeg"), 6_000_000)).toBeNull();
  });

  it("refuses no pages, too many, a PDF among several, and too many bytes in all", () => {
    expect(pagesProblem([], null)).toBe("count");
    expect(pagesProblem(Array(MAX_PAGES + 1).fill("image/jpeg"), null)).toBe("count");
    expect(pagesProblem(["image/jpeg", "application/pdf"], null)).toBe("pdf");
    expect(pagesProblem(["image/jpeg", ""], null)).toBe("pdf");
    expect(pagesProblem(["image/jpeg", "image/png"], MAX_TOTAL_BYTES + 1)).toBe("size");
  });

  it("explains each problem in English and Spanish", () => {
    for (const p of ["count", "pdf", "size"] as const) {
      expect(pagesMessage(p, "en")).toMatch(/[a-z]/);
      expect(pagesMessage(p, "es")).not.toBe(pagesMessage(p, "en"));
    }
    expect(pagesMessage("count", "es")).toContain(String(MAX_PAGES));
  });
});

describe("billPages", () => {
  it("reads an old single-file bill as one page", () => {
    expect(billPages({ fileId: "a", fileType: "application/pdf" })).toEqual([{ fileId: "a", type: "application/pdf" }]);
    expect(billPages({})).toEqual([]);
  });

  it("puts page 1 first, then the rest in order", () => {
    const c = { fileId: "a", fileType: "image/jpeg", morePages: [{ fileId: "b", type: "image/jpeg" }, { fileId: "c", type: "image/png" }] };
    expect(billPages(c).map((p) => p.fileId)).toEqual(["a", "b", "c"]);
  });
});

describe("pagesNote", () => {
  it("says nothing for one file and names the pages for several", () => {
    expect(pagesNote(1)).toBe("");
    expect(pagesNote(3)).toMatch(/pages 1 to 3 of ONE bill/);
    expect(pagesNote(3)).toMatch(/last page/);
  });
});

describe("inOrder", () => {
  it("keeps the order of the items and runs at most `limit` at once", async () => {
    let running = 0;
    let most = 0;
    const out = await inOrder([30, 5, 20, 1, 10], 2, async (ms, i) => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3, 4]);
    expect(most).toBe(2);
  });

  it("fails if any page fails", async () => {
    await expect(inOrder([1, 2, 3], 2, async (x) => (x === 2 ? Promise.reject(new Error("page 2")) : x))).rejects.toThrow("page 2");
  });
});

describe("lines across pages", () => {
  const head = ["DATE", "REV", "CPT/HCPCS", "DESCRIPTION", "QTY", "CHARGES"];
  const page1 = [table([["Statement Date", "09/11/2026"]]), table([head, ["08/13/2026", "0450", "99284", "ED LEVEL 4", "1", "5,214.00"], ["08/13/2026", "0300", "85025", "CBC", "1", "217.00"]])];
  // A photo of page 2: the table runs on with no header row of its own, then the totals.
  const page2 = [table([["08/13/2026", "0324", "71046", "XR CHEST 2 VIEWS", "1", "804.00"], ["", "", "", "TOTAL CHARGES", "", "6,235.00"]])];

  it("joins the pages' lines in page order, reading a headerless table as the one before it", () => {
    expect(linesFromPages([page1, page2])).toEqual([
      { code: "99284", charge: 5214 },
      { code: "85025", charge: 217 },
      { code: "71046", charge: 804 },
    ]);
  });

  it("keeps the order the patient chose", () => {
    expect(linesFromPages([page2, page1]).map((l) => l.code)).toEqual(["99284", "85025"]);
  });

  it("leaves a single file's reading as it was: headerless tables are skipped", () => {
    expect(linesFromPages([[...page1, ...page2]]).map((l) => l.code)).toEqual(["99284", "85025"]);
    expect(linesFromTables([...page1, ...page2]).map((l) => l.code)).toEqual(["99284", "85025"]);
  });

  it("doesn't read a headerless table with other columns as charges", () => {
    const other = [table([["Amount due", "$6,235.00"], ["Pay by", "10/01/2026"]])];
    expect(linesFromPages([page1, other]).map((l) => l.code)).toEqual(["99284", "85025"]);
  });

  it("joinPages flattens in order", () => {
    expect(joinPages([[1, 2], [], [3]])).toEqual([1, 2, 3]);
  });
});

describe("the printed total across pages", () => {
  const L = (code: string, charge: number) => ({ date: "2026-08-13", code, revCode: null, description: code, quantity: 1, chargePrinted: charge.toFixed(2), charge });
  const bill = (lines: ParsedBill["lines"]): ParsedBill => ({
    hospitalName: "Test Hospital", isMedicalBill: true, hospitalWebsite: null, hospitalAddress: null, patientAddress: null, billingPhone: null, accountNumber: "1", patientName: null,
    statementDate: null, serviceDate: null, insurancePayer: null, insurancePaid: 0, adjustments: 0, patientPaid: 0,
    totalCharges: 6235, amountDue: 6235, isItemized: true, lines, unreadable: [],
  });
  const page1 = [L("99284", 5214), L("85025", 217)];
  const page2 = [L("71046", 804)];

  it("page 1 alone looks like a total that doesn't match", () => {
    expect(checkBill(bill(page1), null).some((f) => f.kind === "TOTAL_MISMATCH")).toBe(true);
  });

  it("every page's lines add up to the total printed on the last page", () => {
    expect(checkBill(bill(joinPages([page1, page2])), null).some((f) => f.kind === "TOTAL_MISMATCH")).toBe(false);
  });
});

describe("page list", () => {
  it("adds up to six and reports what didn't fit", () => {
    const r = addPages([1, 2, 3, 4], [5, 6, 7, 8]);
    expect(r.list).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.dropped).toEqual([7, 8]);
  });

  it("moves a page up or down, and not past either end", () => {
    expect(movePage(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(movePage(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(movePage(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(movePage(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("removes a page", () => {
    expect(removePage(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  it("knows a PDF by type or name", () => {
    expect(isPdf({ type: "application/pdf" })).toBe(true);
    expect(isPdf({ type: "", name: "bill.PDF" })).toBe(true);
    expect(isPdf({ type: "image/jpeg", name: "bill.jpg" })).toBe(false);
  });
});
