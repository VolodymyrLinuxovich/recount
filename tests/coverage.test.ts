import { describe, expect, it } from "vitest";
import type { ParsedBill } from "../convex/lib/bill";
import { potentialSavings } from "../convex/lib/checks";
import { COVERAGE_LAW_LINE, coverageFindings, coverageOf, type Coverage } from "../convex/lib/coverage";
import { allFindings } from "../convex/lib/eobChecks";
import { templateLetters } from "../convex/lib/letters";
import { FPL } from "../convex/lib/reference";
import { SAMPLE_BILL, SAMPLE_EOB } from "../convex/lib/sample";
import { assess } from "../convex/lib/eligibility";

const bill = (over: Partial<ParsedBill> = {}): ParsedBill => ({
  isMedicalBill: true,
  hospitalName: "Test Hospital",
  hospitalWebsite: null,
  hospitalAddress: null,
  billingPhone: null,
  accountNumber: "A1",
  patientName: "Pat Doe",
  patientAddress: null,
  statementDate: null,
  serviceDate: "2026-09-01",
  insurancePayer: null,
  insurancePaid: 0,
  adjustments: 0,
  patientPaid: 0,
  totalCharges: 1200,
  amountDue: 1200,
  isItemized: true,
  lines: [
    { date: "2026-09-01", code: "85025", revCode: null, description: "CBC", quantity: 1, chargePrinted: "200.00", charge: 200 },
    { date: "2026-09-01", code: "85025", revCode: null, description: "CBC", quantity: 1, chargePrinted: "200.00", charge: 200 },
    { date: "2026-09-01", code: "99284", revCode: null, description: "ER visit", quantity: 1, chargePrinted: "800.00", charge: 800 },
  ],
  unreadable: [],
  ...over,
});

const hh = (coverage: Coverage, annualIncome = 40000, size = 1) => ({ size, annualIncome, insured: coverage !== "none", coverage });
const kinds = (b: ParsedBill, coverage: Coverage, income?: number) => coverageFindings(b, hh(coverage, income), null, FPL).map((f) => f.kind);

describe("coverage rules", () => {
  it("Medi-Cal patient billed beyond share of cost", () => {
    const f = coverageFindings(bill(), hh("medi-cal"), null, FPL);
    expect(f.map((x) => x.kind)).toEqual(["MEDI_CAL_BALANCE_BILL"]);
    expect(f[0].amount).toBe(1200);
    expect(f[0].evidence.some((e) => e.source?.includes("sectionNum=14019.4"))).toBe(true);
  });

  it("no Medi-Cal finding when the bill asks for nothing", () => {
    expect(kinds(bill({ amountDue: 0 }), "medi-cal")).toEqual([]);
  });

  it("Medicare and Medi-Cal patient billed Medicare cost sharing", () => {
    const b = bill({ insurancePayer: "Medicare", insurancePaid: 900, amountDue: 300 });
    const f = coverageFindings(b, hh("both"), null, FPL);
    expect(f.map((x) => x.kind)).toEqual(["QMB_BILLED"]);
    expect(f[0].amount).toBe(300);
    expect(f[0].evidence.some((e) => e.value.includes("1396a(n)(3)(B)"))).toBe(true);
  });

  it("Medicare patient with no Medicare payment on the bill", () => {
    expect(kinds(bill(), "medicare")).toEqual(["MEDICARE_NOT_BILLED"]);
    // Medicare paid: no finding.
    expect(kinds(bill({ insurancePayer: "Medicare", insurancePaid: 900, amountDue: 300 }), "medicare")).toEqual([]);
    // Dual with no Medicare payment gets both.
    expect(kinds(bill(), "both")).toEqual(["QMB_BILLED", "MEDICARE_NOT_BILLED"]);
  });

  it("with an insurance statement, the statement rules check the Medicare payment instead", () => {
    expect(coverageFindings(bill(), hh("medicare"), SAMPLE_EOB, FPL).map((f) => f.kind)).toEqual([]);
  });

  it("uninsured and Medi-Cal-likely: points to retroactive Medi-Cal", () => {
    // 2026 poverty line for 1 is $15,960; 138% is about $22,025.
    const f = coverageFindings(bill(), hh("none", 20000), null, FPL);
    expect(f.map((x) => x.kind)).toEqual(["RETRO_MEDI_CAL"]);
    expect(f[0].amount).toBe(0);
    expect(f[0].evidence.some((e) => e.source?.includes("435.915"))).toBe(true);
    expect(kinds(bill(), "none", 40000)).toEqual([]);
  });

  it("private insurance gets no coverage findings", () => {
    expect(kinds(bill(), "private")).toEqual([]);
  });

  it("an old yes/no answer has no coverage type", () => {
    expect(coverageOf({ size: 1, annualIncome: 1, insured: true })).toBeNull();
    expect(coverageOf({ size: 1, annualIncome: 1, insured: false })).toBe("none");
    // An insurance statement turned "no" into "yes".
    expect(coverageOf({ size: 1, annualIncome: 1, insured: true, coverage: "none" })).toBeNull();
  });

  it("Spanish findings use usted", () => {
    const f = coverageFindings(bill(), hh("medi-cal"), null, FPL, "es");
    expect(f[0].detail).toMatch(/usted|Dele|le pide/i);
    expect(f[0].detail).not.toMatch(/\btú\b|\btienes\b|\bpuedes\b/);
  });
});

describe("coverage in allFindings", () => {
  it("without the household, nothing changes", () => {
    expect(allFindings(bill(), null, null).map((f) => f.kind)).toEqual(["DUPLICATE_LINE"]);
  });

  it("a Medi-Cal balance counts once: the line findings show $0", () => {
    const f = allFindings(bill(), null, null, "en", hh("medi-cal"));
    expect(f.map((x) => x.kind)).toEqual(["DUPLICATE_LINE", "MEDI_CAL_BALANCE_BILL"]);
    expect(f[0].amount).toBe(0);
    expect(potentialSavings(f)).toBe(1200);
  });

  it("Medicare not billed keeps the line findings' amounts", () => {
    const f = allFindings(bill(), null, null, "en", hh("medicare"));
    expect(f.find((x) => x.kind === "DUPLICATE_LINE")!.amount).toBe(200);
  });
});

describe("coverage letters", () => {
  const letters = (coverage: Coverage, b = bill(), income = 40000, lang: "en" | "es" = "en") => {
    const household = hh(coverage, income);
    const findings = allFindings(b, null, null, lang, household);
    const eligibility = assess(household, FPL, null, b.amountDue, lang);
    return templateLetters({ bill: b, hospital: null, findings, eligibility, household }, lang);
  };

  it.each([
    ["medi-cal", "MEDI_CAL_BALANCE_BILL", 40000],
    ["both", "QMB_BILLED", 40000],
    ["medicare", "MEDICARE_NOT_BILLED", 40000],
    ["none", "RETRO_MEDI_CAL", 20000],
  ] as const)("%s: the dispute letter quotes the law line for %s", (coverage, kind, income) => {
    const dispute = letters(coverage, bill(), income).find((l) => l.kind === "dispute")!;
    expect(dispute.body).toContain(COVERAGE_LAW_LINE[kind][0]);
  });

  it("Spanish copy has the Spanish law line; the hospital copy stays English", () => {
    const dispute = letters("medi-cal", bill(), 40000, "es").find((l) => l.kind === "dispute")!;
    expect(dispute.bodyPatient).toContain(COVERAGE_LAW_LINE.MEDI_CAL_BALANCE_BILL[1]);
    expect(dispute.body).toContain(COVERAGE_LAW_LINE.MEDI_CAL_BALANCE_BILL[0]);
  });

  it("the sample bill still works with a coverage answer", () => {
    expect(() => allFindings(SAMPLE_BILL, null, null, "en", hh("both"))).not.toThrow();
  });
});
