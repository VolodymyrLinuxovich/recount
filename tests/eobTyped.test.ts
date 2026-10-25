import { describe, expect, it } from "vitest";
import type { ParsedBill } from "../convex/lib/bill";
import { TYPED_MAX, typedAmountProblem, typedEob } from "../convex/lib/eob";
import { allFindings, checkEob, eobShowsInsured } from "../convex/lib/eobChecks";
import { SAMPLE_BILL } from "../convex/lib/sample";
import { eobGap, eobStillOwes, parseTypedDollars } from "../src/components/flow/eobView";

// Totals the patient typed from their statement, instead of a photo the model reads.

type BL = ParsedBill["lines"][number];
const L = (code: string | null, charge: number, extra: Partial<BL> = {}): BL => ({
  date: "2026-09-12", code, revCode: null, description: `Service ${code}`, quantity: 1, charge, chargePrinted: charge.toFixed(2), ...extra,
});
function bill(lines: BL[], extra: Partial<ParsedBill> = {}): ParsedBill {
  return {
    isMedicalBill: true, hospitalName: "Oakview Community Hospital", hospitalWebsite: null, hospitalAddress: null, billingPhone: null,
    accountNumber: "A1", patientName: "Pat Doe", patientAddress: null, statementDate: null, serviceDate: "2026-09-12",
    insurancePayer: null, insurancePaid: 0, adjustments: 0, patientPaid: 0,
    totalCharges: lines.reduce((a, l) => a + l.charge, 0), amountDue: null, isItemized: true, lines, unreadable: [], ...extra,
  };
}

const LINE_KINDS = ["NOT_ON_EOB", "DENIED_BY_PLAN", "EOB_MISMATCH", "CLAIM_PENDING"];
const kinds = (fs: { kind: string }[]) => fs.map((f) => f.kind);

describe("typedEob", () => {
  it("builds a statement with only the typed totals", () => {
    const e = typedEob({ patientOwes: 250.5, planPaid: 1200, network: "in", payer: "  Blue   Shield " });
    expect(e).toMatchObject({
      isEob: true, typed: true, payer: "Blue Shield", network: "in", claimStatus: "processed",
      totalPatientOwes: 250.5, totalPlanPaid: 1200, totalBilled: null, totalAllowed: null,
      claimNumber: null, memberName: null, providerName: null, serviceDateFrom: null, serviceDateTo: null, lines: [], unreadable: [],
    });
  });

  it("leaves what wasn't typed empty", () => {
    const e = typedEob({ patientOwes: 0 });
    expect(e.payer).toBeNull();
    expect(e.totalPlanPaid).toBeNull();
    expect(e.network).toBe("unknown");
  });

  it("refuses bad amounts", () => {
    expect(() => typedEob({ patientOwes: -1 })).toThrow();
    expect(() => typedEob({ patientOwes: 10.005 })).toThrow();
    expect(() => typedEob({ patientOwes: 10, planPaid: TYPED_MAX })).toThrow();
    expect(() => typedEob({ patientOwes: Number.NaN })).toThrow();
  });
});

describe("validation of typed amounts", () => {
  it("typedAmountProblem", () => {
    expect([0, 0.01, 250, 250.5, 1234.56, 9_999_999.99].map(typedAmountProblem)).toEqual([null, null, null, null, null, null]);
    expect(typedAmountProblem(-0.01)).toBe("bad");
    expect(typedAmountProblem(1.234)).toBe("bad");
    expect(typedAmountProblem(Infinity)).toBe("bad");
    expect(typedAmountProblem(10_000_000)).toBe("tooBig");
  });

  it("parseTypedDollars reads what people type", () => {
    expect(parseTypedDollars("")).toEqual({ value: null, problem: null });
    expect(parseTypedDollars("  ")).toEqual({ value: null, problem: null });
    expect(parseTypedDollars("250")).toEqual({ value: 250, problem: null });
    expect(parseTypedDollars("$1,250.50")).toEqual({ value: 1250.5, problem: null });
    expect(parseTypedDollars("$ 12,204.00")).toEqual({ value: 12204, problem: null });
    expect(parseTypedDollars("0")).toEqual({ value: 0, problem: null });
    expect(parseTypedDollars(".5")).toEqual({ value: 0.5, problem: null });
    expect(parseTypedDollars("12.")).toEqual({ value: 12, problem: null });
  });

  it("parseTypedDollars rejects the rest", () => {
    for (const s of ["-5", "abc", "12.345", "1.2.3", "5k", "12,34"]) expect(parseTypedDollars(s).problem, s).toBe("bad");
    expect(parseTypedDollars("10,000,000")).toEqual({ value: null, problem: "tooBig" });
    expect(parseTypedDollars("9,999,999.99").value).toBe(9_999_999.99);
  });
});

describe("rules with typed totals", () => {
  const b = bill([L("99284", 1800), L("80053", 300), L("71046", 400)], { amountDue: 2500 });

  it("flags a hospital asking more than insurance says you owe", () => {
    const f = checkEob(b, typedEob({ patientOwes: 350, network: "in", payer: "Blue Shield" }));
    expect(kinds(f)).toEqual(["OWES_MORE_THAN_EOB"]);
    expect(f[0].amount).toBe(2150);
    expect(f[0].detail).toContain("$350.00");
    expect(f[0].evidence[0].source).toBe("What you typed from your Blue Shield statement");
  });

  it("says the source in Spanish too", () => {
    const f = checkEob(b, typedEob({ patientOwes: 350 }), "es");
    expect(f[0].evidence[0].source).toBe("Lo que usted escribió de su estado del seguro");
  });

  it("never fires line rules: no lines, no codes, no dates", () => {
    const f = checkEob(b, typedEob({ patientOwes: 350, planPaid: 900, network: "unknown" }));
    expect(kinds(f).filter((k) => LINE_KINDS.includes(k))).toEqual([]);
  });

  it("finds nothing when the bill matches what was typed", () => {
    expect(checkEob(b, typedEob({ patientOwes: 2500 }))).toEqual([]);
    // Plan paid but the bill already asks for exactly what the statement says: no false alarm.
    expect(checkEob(b, typedEob({ patientOwes: 2500, planPaid: 900 }))).toEqual([]);
  });

  it("notes an insurance payment missing from the bill", () => {
    const f = checkEob(b, typedEob({ patientOwes: 400, planPaid: 2100 }));
    expect(kinds(f)).toEqual(["OWES_MORE_THAN_EOB"]);
    expect(f[0].detail).toContain("Your plan paid $2,100.00");
  });

  it("flags a surprise bill for out-of-network ER care", () => {
    const f = checkEob(b, typedEob({ patientOwes: 350, network: "out" }));
    expect(kinds(f)).toEqual(["SURPRISE_BILL"]);
    expect(f[0].amount).toBe(2150);
  });

  it("counts what the patient already paid", () => {
    const paid = bill([L("99284", 1000)], { amountDue: 900, patientPaid: 100 });
    const f = checkEob(paid, typedEob({ patientOwes: 300 }));
    expect(f[0].amount).toBe(700);
  });

  it("marks the patient insured and keeps the money counted once", () => {
    const e = typedEob({ patientOwes: 100, network: "in" });
    expect(eobShowsInsured(SAMPLE_BILL, null, e)).toBe(true);
    const all = allFindings(SAMPLE_BILL, null, e);
    const fromEob = all.filter((f) => f.kind === "OWES_MORE_THAN_EOB");
    expect(fromEob).toHaveLength(1);
    expect(kinds(all).filter((k) => LINE_KINDS.includes(k))).toEqual([]);
    // The typed total resets what is owed, so bill line findings show $0.
    expect(all.filter((f) => f.kind !== "OWES_MORE_THAN_EOB").every((f) => f.amount === 0)).toBe(true);
  });

  it("the screen's numbers agree", () => {
    const e = typedEob({ patientOwes: 350 });
    expect(eobStillOwes(e, b)).toBe(350);
    expect(eobGap(2500, 350, checkEob(b, e))).toBe(2150);
  });
});
