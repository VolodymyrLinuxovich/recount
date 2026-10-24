import { describe, expect, it } from "vitest";
import type { ParsedBill } from "../convex/lib/bill";
import { potentialSavings, type Finding } from "../convex/lib/checks";
import type { EobLine, ParsedEob } from "../convex/lib/eob";
import { EOB_FINDING_TARGET } from "../convex/lib/eob";
import { allFindings, billDue, checkEob, eobOwes, erVisit } from "../convex/lib/eobChecks";
import type { HospitalRef } from "../convex/lib/hospital";
import { SNAPSHOTS } from "../convex/lib/reference";
import { SAMPLE_BILL, SAMPLE_EOB } from "../convex/lib/sample";

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

const EL = (code: string | null, billed: number, extra: Partial<EobLine> = {}): EobLine => ({
  date: "2026-09-12", code, description: `Service ${code}`, billed, allowed: null, planPaid: null, patientOwes: null, notCovered: 0, remark: null, ...extra,
});

function eob(lines: EobLine[], extra: Partial<ParsedEob> = {}): ParsedEob {
  return {
    isEob: true, payer: "Blue Shield", planType: "PPO", memberName: "Pat Doe", memberId: "M1", claimNumber: "123",
    providerName: "Oakview Community Hospital", serviceDateFrom: "2026-09-12", serviceDateTo: "2026-09-12",
    network: "in", emergency: null, claimStatus: "processed", totalBilled: null, totalAllowed: null, totalPlanPaid: null,
    totalPatientOwes: null, appealDeadline: null, appealAddress: null, insurerPhone: null, lines, unreadable: [], ...extra,
  };
}

const kinds = (f: Finding[]) => f.map((x) => x.kind);
const find = (f: Finding[], k: Finding["kind"]) => f.find((x) => x.kind === k);

describe("helpers", () => {
  it("due falls back to total minus payments", () => {
    expect(billDue(bill([L("1001", 1000)], { amountDue: 400 }))).toBe(400);
    expect(billDue(bill([L("1001", 1000)], { insurancePaid: 300, adjustments: 100, patientPaid: 50 }))).toBe(550);
    expect(billDue(bill([L("1001", 1000)], { totalCharges: null }))).toBeNull();
  });
  it("eobOwes falls back to the lines' patientOwes", () => {
    expect(eobOwes(eob([], { totalPatientOwes: 80 }))).toBe(80);
    expect(eobOwes(eob([EL("1001", 1, { patientOwes: 30 }), EL("1002", 1, { patientOwes: 20 }), EL("1003", 1)]))).toBe(50);
    expect(eobOwes(eob([EL("1001", 1)]))).toBeNull();
  });
  it("erVisit uses the EOB flag, ER revenue codes, ER visit codes or the word emergency", () => {
    const e = eob([]);
    expect(erVisit(bill([L("1001", 1)]), { ...e, emergency: true })).toBe(true);
    expect(erVisit(bill([L("1001", 1, { revCode: "0450" })]), e)).toBe(true);
    expect(erVisit(bill([L("1001", 1, { revCode: "0459" })]), e)).toBe(true);
    expect(erVisit(bill([L("1001", 1, { revCode: "0460" })]), e)).toBe(false);
    expect(erVisit(bill([L("99283", 1)]), e)).toBe(true);
    expect(erVisit(bill([L("99286", 1)]), e)).toBe(false);
    expect(erVisit(bill([L("1001", 1, { description: "Emergency room visit" })]), e)).toBe(true);
    expect(erVisit(bill([L("1001", 1)]), e)).toBe(false);
  });
});

describe("rule 1: EOB_MISMATCH", () => {
  const b = bill([L("1001", 500)], { amountDue: 500 });
  it("fires on dates more than 3 days apart, and stops", () => {
    const f = checkEob(b, eob([EL("1001", 500)], { serviceDateFrom: "2026-08-01", serviceDateTo: "2026-08-02", totalPatientOwes: 0, claimStatus: "pending" }));
    expect(kinds(f)).toEqual(["EOB_MISMATCH"]);
    expect(f[0].amount).toBe(0);
    expect(f[0].confidence).toBe("check");
  });
  it("allows 3 days of slack either side", () => {
    expect(kinds(checkEob(b, eob([EL("1001", 500)], { serviceDateFrom: "2026-09-15", serviceDateTo: "2026-09-15" })))).not.toContain("EOB_MISMATCH");
    expect(kinds(checkEob(b, eob([EL("1001", 500)], { serviceDateFrom: "2026-09-09", serviceDateTo: "2026-09-09" })))).not.toContain("EOB_MISMATCH");
    expect(kinds(checkEob(b, eob([EL("1001", 500)], { serviceDateFrom: "2026-09-16", serviceDateTo: "2026-09-16" })))).toEqual(["EOB_MISMATCH"]);
    expect(kinds(checkEob(b, eob([EL("1001", 500)], { serviceDateFrom: "2026-09-01", serviceDateTo: "2026-09-08" })))).toEqual(["EOB_MISMATCH"]);
  });
  it("uses line dates when the bill has no service date, and a range that overlaps", () => {
    const b2 = bill([L("1001", 500, { date: "2026-09-20" })], { serviceDate: null });
    expect(kinds(checkEob(b2, eob([], { serviceDateFrom: "2026-09-18", serviceDateTo: "2026-09-25" })))).not.toContain("EOB_MISMATCH");
  });
  it("skips the date check when either side has no dates", () => {
    const b2 = bill([L("1001", 500, { date: null })], { serviceDate: null });
    expect(kinds(checkEob(b2, eob([], { serviceDateFrom: "2020-01-01", serviceDateTo: null })))).not.toContain("EOB_MISMATCH");
    expect(kinds(checkEob(b, eob([], { serviceDateFrom: null, serviceDateTo: null })))).not.toContain("EOB_MISMATCH");
  });
  it("fires when the provider shares no real word with the hospital", () => {
    expect(kinds(checkEob(b, eob([], { providerName: "Riverside Medical Center" })))).toEqual(["EOB_MISMATCH"]);
    // Generic words don't count as a match.
    expect(kinds(checkEob(b, eob([], { providerName: "The Health Hospital Medical Center" })))).toEqual(["EOB_MISMATCH"]);
    expect(kinds(checkEob(b, eob([], { providerName: "OAKVIEW HOSP" })))).not.toContain("EOB_MISMATCH");
    expect(kinds(checkEob(b, eob([], { providerName: null })))).not.toContain("EOB_MISMATCH");
  });
  it("also accepts the matched hospital's official name", () => {
    expect(kinds(checkEob(b, eob([], { providerName: "Oak Valley Regional" }), "en", ["Oak Valley Regional Hospital"]))).not.toContain("EOB_MISMATCH");
  });
  it("in allFindings, keeps the bill checks but nothing else from the EOB", () => {
    const f = allFindings(bill([L("1001", 100), L("1001", 100)], { amountDue: 200 }), null, eob([], { providerName: "Riverside", totalPatientOwes: 0 }));
    expect(kinds(f)).toEqual(["DUPLICATE_LINE", "EOB_MISMATCH"]);
    expect(find(f, "DUPLICATE_LINE")!.amount).toBe(100);
  });
});

describe("rule 2: CLAIM_PENDING", () => {
  it("fires and stops", () => {
    const f = checkEob(bill([L("1001", 500)], { amountDue: 500 }), eob([EL("1001", 500, { notCovered: 500 })], { claimStatus: "pending", totalPatientOwes: 0, totalPlanPaid: 100 }));
    expect(kinds(f)).toEqual(["CLAIM_PENDING"]);
    expect(f[0].confidence).toBe("high");
    expect(f[0].amount).toBe(0);
    expect(f[0].detail).toMatch(/Don't pay/);
    expect(f[0].detail).toMatch(/hold the bill/);
    expect(EOB_FINDING_TARGET.CLAIM_PENDING).toBe("hospital");
  });
});

describe("rule 3: SURPRISE_BILL", () => {
  const er = bill([L("99285", 3000, { revCode: "0450" })], { amountDue: 3000 });
  it("fires for out-of-network emergency care billed above cost sharing", () => {
    const f = checkEob(er, eob([EL("99285", 3000)], { network: "out", totalPatientOwes: 400 }));
    expect(kinds(f)).toEqual(["SURPRISE_BILL"]);
    expect(f[0].amount).toBe(2600);
    expect(f[0].detail).toContain("2799B-1");
    expect(f[0].detail).toContain("300gg-131");
    expect(f[0].detail).toContain("1-800-985-3059");
    expect(f[0].evidence[0]).toEqual({ label: "Your insurance says you owe", value: "$400.00", source: "EOB from Blue Shield, claim 123" });
  });
  it("never appears together with OWES_MORE_THAN_EOB", () => {
    const f = checkEob(er, eob([EL("99285", 3000)], { network: "out", totalPatientOwes: 400 }));
    expect(find(f, "OWES_MORE_THAN_EOB")).toBeUndefined();
  });
  it("needs an ER visit and an out-of-network provider", () => {
    const notEr = bill([L("70450", 3000)], { amountDue: 3000 });
    expect(kinds(checkEob(notEr, eob([EL("70450", 3000)], { network: "out", totalPatientOwes: 400 })))).toEqual(["OWES_MORE_THAN_EOB"]);
    expect(kinds(checkEob(notEr, eob([EL("70450", 3000)], { network: "out", emergency: true, totalPatientOwes: 400 })))).toEqual(["SURPRISE_BILL"]);
    expect(kinds(checkEob(er, eob([EL("99285", 3000)], { network: "unknown", totalPatientOwes: 400 })))).toEqual(["OWES_MORE_THAN_EOB"]);
  });
  it("counts what the patient already paid", () => {
    const paid = bill([L("99285", 3000)], { amountDue: 2900, patientPaid: 100 });
    const f = checkEob(paid, eob([EL("99285", 3000)], { network: "out", totalPatientOwes: 400 }));
    expect(f[0].amount).toBe(2600); // 2900 - (400 - 100)
  });
  it("folds the missing plan payment in as evidence", () => {
    const f = checkEob(er, eob([EL("99285", 3000)], { network: "out", totalPatientOwes: 400, totalPlanPaid: 900 }));
    expect(kinds(f)).toEqual(["SURPRISE_BILL"]);
    expect(f[0].evidence.some((e) => e.value.includes("Your plan paid $900.00, and the bill shows no insurance payment"))).toBe(true);
  });
});

describe("rule 4: OWES_MORE_THAN_EOB", () => {
  it("in network: says the provider can't balance bill", () => {
    const f = checkEob(bill([L("1001", 1000)], { amountDue: 1000 }), eob([EL("1001", 1000)], { totalPatientOwes: 250 }));
    expect(kinds(f)).toEqual(["OWES_MORE_THAN_EOB"]);
    expect(f[0].amount).toBe(750);
    expect(f[0].confidence).toBe("high");
    expect(f[0].detail).toContain("Your insurance says you owe $250.00. The hospital is asking for $1,000.00.");
    expect(f[0].detail).toContain("allowed amount");
  });
  it("unknown network: only asks the hospital to explain", () => {
    const f = checkEob(bill([L("1001", 1000)], { amountDue: 1000 }), eob([EL("1001", 1000)], { network: "unknown", totalPatientOwes: 250 }));
    expect(f[0].detail).not.toContain("allowed amount");
    expect(f[0].detail).toContain("explain the difference");
  });
  it("needs at least $1.00 more, compared in cents", () => {
    const b = (due: number) => bill([L("1001", 1000)], { amountDue: due });
    const e = eob([EL("1001", 1000)], { totalPatientOwes: 250 });
    expect(kinds(checkEob(b(250.99), e))).toEqual([]);
    expect(kinds(checkEob(b(251), e))).toEqual(["OWES_MORE_THAN_EOB"]);
    expect(checkEob(b(251.004), e)[0].amount).toBe(1);
  });
  it("uses the lines' patientOwes when the total isn't printed", () => {
    const f = checkEob(bill([L("1001", 600), L("1002", 400)], { amountDue: 1000 }), eob([EL("1001", 600, { patientOwes: 60 }), EL("1002", 400, { patientOwes: 40 })]));
    expect(f[0].amount).toBe(900);
  });
  it("is skipped when the EOB doesn't say what the patient owes, or the bill has no amount", () => {
    expect(kinds(checkEob(bill([L("1001", 1000)], { amountDue: 1000 }), eob([EL("1001", 1000)])))).toEqual([]);
    expect(kinds(checkEob(bill([L("1001", 1000)], { amountDue: null, totalCharges: null }), eob([EL("1001", 1000)], { totalPatientOwes: 10 })))).toEqual([]);
  });
  it("stillOwes never goes below zero", () => {
    const f = checkEob(bill([L("1001", 1000)], { amountDue: 500, patientPaid: 300 }), eob([EL("1001", 1000)], { totalPatientOwes: 100 }));
    expect(f[0].amount).toBe(500);
  });
});

describe("rule 5: INSURANCE_NOT_APPLIED", () => {
  it("fires when the plan paid and the bill shows no payment", () => {
    const f = checkEob(bill([L("1001", 1000)], { amountDue: 200 }), eob([EL("1001", 1000)], { totalPlanPaid: 800, totalPatientOwes: 200 }));
    expect(kinds(f)).toEqual(["INSURANCE_NOT_APPLIED"]);
    expect(f[0].amount).toBe(200); // min(plan paid, due)
  });
  it("is folded into OWES_MORE_THAN_EOB instead of counting twice", () => {
    const f = checkEob(bill([L("1001", 1000)], { amountDue: 1000 }), eob([EL("1001", 1000)], { totalPlanPaid: 800, totalPatientOwes: 200 }));
    expect(kinds(f)).toEqual(["OWES_MORE_THAN_EOB"]);
    expect(f[0].evidence.some((e) => e.value === "Your plan paid $800.00, and the bill shows no insurance payment")).toBe(true);
    expect(f[0].detail).toContain("Your plan paid $800.00");
  });
  it("doesn't fire when the bill shows an insurance payment, or the plan paid nothing", () => {
    expect(kinds(checkEob(bill([L("1001", 1000)], { amountDue: 200, insurancePaid: 800 }), eob([EL("1001", 1000)], { totalPlanPaid: 800, totalPatientOwes: 200 })))).toEqual([]);
    expect(kinds(checkEob(bill([L("1001", 1000)], { amountDue: 200 }), eob([EL("1001", 1000)], { totalPlanPaid: 0, totalPatientOwes: 200 })))).toEqual([]);
    expect(kinds(checkEob(bill([L("1001", 1000)], { amountDue: 200 }), eob([EL("1001", 1000)], { totalPlanPaid: null, totalPatientOwes: 200 })))).toEqual([]);
  });
});

describe("rule 6: NOT_ON_EOB", () => {
  it("one finding per bill line whose code isn't on the EOB", () => {
    const b = bill([L("1001", 100), L("1002", 100), L("1003", 100), L(null, 50)], { amountDue: 0 });
    const f = checkEob(b, eob([EL("1001", 100), EL("1003", 100)], { totalPatientOwes: 0 }));
    expect(kinds(f)).toEqual(["NOT_ON_EOB"]);
    expect(f[0].lines).toEqual([1]);
    expect(f[0].amount).toBe(0);
    expect(f[0].confidence).toBe("check");
    expect(f[0].detail).toContain("sent to your insurance");
  });
  it("normalizes codes and also matches revenue codes", () => {
    const b = bill([L("85-025", 10), L("99284", 10, { revCode: "0450" })], { amountDue: 0 });
    expect(checkEob(b, eob([EL("85025", 10), EL("0450", 10)], { totalPatientOwes: 0 }))).toEqual([]);
  });
  it("needs at least one coded EOB line", () => {
    const b = bill([L("1001", 100)], { amountDue: 0 });
    expect(checkEob(b, eob([EL(null, 100)], { totalPatientOwes: 0 }))).toEqual([]);
    expect(checkEob(b, eob([], { totalPatientOwes: 0 }))).toEqual([]);
  });
});

describe("rule 7: DENIED_BY_PLAN", () => {
  it("one finding for every denied line, with remarks as evidence", () => {
    const b = bill([L("1001", 300), L("1002", 200), L("1003", 100)], { amountDue: 500 });
    const e = eob(
      [EL("1001", 300, { notCovered: 300, patientOwes: 300, remark: "CO-50 Not medically necessary" }), EL("1002", 200, { notCovered: 200, patientOwes: 200, remark: "N130" }), EL("1003", 100)],
      { totalPatientOwes: 500, claimStatus: "partly_denied", planType: "HMO", appealDeadline: "180 days", appealAddress: "PO Box 1" },
    );
    const f = checkEob(b, e);
    expect(kinds(f)).toEqual(["DENIED_BY_PLAN"]);
    expect(f[0].amount).toBe(500);
    expect(f[0].lines).toEqual([0, 1]);
    expect(f[0].evidence[0]).toEqual({ label: "Service 1001", value: "$300.00 · CO-50 Not medically necessary", source: "EOB from Blue Shield, claim 123" });
    expect(f[0].detail).toContain("appeal");
    expect(f[0].detail).toContain("1-888-466-2219");
    expect(f[0].detail).toContain("healthhelp.ca.gov");
    expect(f[0].detail).toContain("1-800-927-4357");
    expect(f[0].detail).toContain("180 days");
    expect(f[0].evidence.some((x) => x.value === "PO Box 1")).toBe(true);
    expect(EOB_FINDING_TARGET.DENIED_BY_PLAN).toBe("insurer");
  });
  it("a whole denied claim without line amounts uses totalPatientOwes", () => {
    const f = checkEob(bill([L("1001", 300)], { amountDue: 300 }), eob([EL("1001", 300, { notCovered: null })], { claimStatus: "denied", totalPatientOwes: 300 }));
    expect(kinds(f)).toEqual(["DENIED_BY_PLAN"]);
    expect(f[0].amount).toBe(300);
    expect(f[0].title).toContain("denied this claim");
  });
  it("partly denied with no line amounts still gives one finding, $0", () => {
    const f = checkEob(bill([L("1001", 300)], { amountDue: 300 }), eob([EL("1001", 300)], { claimStatus: "partly_denied", totalPatientOwes: 300 }));
    expect(kinds(f)).toEqual(["DENIED_BY_PLAN"]);
    expect(f[0].amount).toBe(0);
    expect(f[0].detail).not.toContain("0 services");
  });
  it("Medi-Cal and Medicare: follow the statement's steps, no DMHC", () => {
    for (const planType of ["Medi-Cal", "Medicare Advantage"]) {
      const f = checkEob(bill([L("1001", 300)], { amountDue: 300 }), eob([EL("1001", 300, { notCovered: 300 })], { planType, totalPatientOwes: 300 }));
      expect(f[0].detail).toContain("Follow the appeal steps on your statement");
      expect(f[0].detail).not.toContain("DMHC");
    }
  });
  it("comes after the money finding and doesn't overlap it", () => {
    const b = bill([L("1001", 1000), L("1002", 300)], { amountDue: 1300 });
    const e = eob([EL("1001", 1000, { patientOwes: 100 }), EL("1002", 300, { patientOwes: 300, notCovered: 300 })], { totalPatientOwes: 400 });
    const f = checkEob(b, e);
    expect(kinds(f)).toEqual(["OWES_MORE_THAN_EOB", "DENIED_BY_PLAN"]);
    expect(f[0].amount + f[1].amount).toBe(1200); // due 1300 minus the $100 the patient really owes
  });
});

describe("rule order", () => {
  it("money, then not-on-EOB lines, then denials", () => {
    const b = bill([L("1001", 1000), L("2002", 50)], { amountDue: 1050 });
    const e = eob([EL("1001", 1000, { notCovered: 100, patientOwes: 100 })], { totalPatientOwes: 100 });
    expect(kinds(checkEob(b, e))).toEqual(["OWES_MORE_THAN_EOB", "NOT_ON_EOB", "DENIED_BY_PLAN"]);
  });
  it("every evidence line cites a source", () => {
    const b = bill([L("1001", 1000), L("2002", 50)], { amountDue: 1050 });
    const e = eob([EL("1001", 1000, { notCovered: 100, patientOwes: 100 })], { totalPatientOwes: 100, totalPlanPaid: 500 });
    for (const f of checkEob(b, e)) for (const ev of f.evidence) expect(ev.source).toBeTruthy();
  });
});

describe("null handling", () => {
  it("an EOB that read almost nothing gives no findings and doesn't throw", () => {
    const empty = eob([], { payer: null, claimNumber: null, providerName: null, serviceDateFrom: null, serviceDateTo: null, network: "unknown", claimStatus: "unknown" });
    expect(checkEob(bill([L("1001", 100)]), empty)).toEqual([]);
    expect(checkEob(bill([], { totalCharges: null, serviceDate: null, accountNumber: null }), empty)).toEqual([]);
  });
  it("names the insurer generically when the payer isn't printed", () => {
    const f = checkEob(bill([L("1001", 1000)], { amountDue: 1000 }), eob([], { payer: null, claimNumber: null, totalPatientOwes: 0 }));
    expect(f[0].evidence[0].source).toBe("EOB from your insurance");
  });
  it("allFindings with no EOB is just the bill checks", () => {
    const b = bill([L("1001", 100), L("1001", 100)]);
    expect(kinds(allFindings(b, null, null))).toEqual(["DUPLICATE_LINE"]);
    expect(kinds(allFindings(b, null, undefined))).toEqual(["DUPLICATE_LINE"]);
    expect(kinds(allFindings(b, null, eob([], { isEob: false, totalPatientOwes: 0 })))).toEqual(["DUPLICATE_LINE"]);
  });
});

describe("Spanish", () => {
  it("every EOB finding has Spanish text", () => {
    const er = bill([L("99285", 3000), L("2002", 50)], { amountDue: 3050 });
    const all = [
      ...checkEob(er, eob([EL("99285", 3000, { notCovered: 100, patientOwes: 100 })], { network: "out", totalPatientOwes: 400, totalPlanPaid: 100 }), "es"),
      ...checkEob(er, eob([EL("99285", 3000)], { totalPatientOwes: 400 }), "es"),
      ...checkEob(bill([L("1001", 100)], { amountDue: 100 }), eob([], { totalPlanPaid: 100, totalPatientOwes: 100 }), "es"),
      ...checkEob(er, eob([], { claimStatus: "pending" }), "es"),
      ...checkEob(er, eob([], { providerName: "Riverside" }), "es"),
    ];
    expect(new Set(kinds(all))).toEqual(new Set(["SURPRISE_BILL", "NOT_ON_EOB", "DENIED_BY_PLAN", "OWES_MORE_THAN_EOB", "INSURANCE_NOT_APPLIED", "CLAIM_PENDING", "EOB_MISMATCH"]));
    const en = /\b(the|your|you|hospital is asking)\b/i;
    for (const f of all) {
      expect(f.title).not.toMatch(en);
      expect(f.detail.replace(/No Surprises (Act|Help Desk)|Public Health Service Act/g, "")).not.toMatch(en);
      for (const e of f.evidence) expect(e.label).not.toMatch(en);
    }
    expect(find(all, "SURPRISE_BILL")!.detail).toContain("Su seguro dice que usted debe $400.00");
    expect(find(all, "DENIED_BY_PLAN")!.detail).toContain("Revisión Médica Independiente");
  });
});

describe("allFindings: each dollar once", () => {
  const ref: HospitalRef = {
    key: "h", name: "Oakview Community Hospital", source: "snapshot", fetchedAt: "2026-10-24",
    mrf: { url: "https://example.org/mrf.json", lastUpdated: null, prices: { "1001": { description: "x", grossCharge: 800, discountedCash: 300, min: null, max: null } } },
    fap: null, warnings: [],
  };
  it("an EOB makes the patient insured, so no cash price gap", () => {
    const b = bill([L("1001", 800)], { amountDue: 800 });
    expect(kinds(allFindings(b, ref, null))).toContain("CASH_PRICE_GAP");
    expect(kinds(allFindings(b, ref, eob([EL("1001", 800)], { totalPatientOwes: 800 })))).not.toContain("CASH_PRICE_GAP");
  });
  it("bill line amounts go to $0 when the EOB sets what the patient owes", () => {
    const b = bill([L("1001", 1000), L("1001", 1000)], { amountDue: 2000 });
    const f = allFindings(b, ref, eob([EL("1001", 1000, { patientOwes: 100 })], { totalPatientOwes: 100 }));
    expect(kinds(f)).toEqual(["DUPLICATE_LINE", "ABOVE_LIST_PRICE", "ABOVE_LIST_PRICE", "OWES_MORE_THAN_EOB"]);
    for (const x of f.filter((x) => x.kind !== "OWES_MORE_THAN_EOB")) {
      expect(x.amount).toBe(0);
      expect(x.detail).toContain("already counted");
    }
    expect(potentialSavings(f)).toBe(1900);
  });
  it("keeps bill amounts when the bill already matches the EOB, except on denied lines", () => {
    const b = bill([L("1001", 1000), L("2002", 50), L("2002", 50)], { amountDue: 1100 });
    const f = allFindings(b, ref, eob([EL("1001", 1000, { notCovered: 1000, patientOwes: 1000 }), EL("2002", 50, { patientOwes: 100 })], { totalPatientOwes: 1100 }));
    expect(kinds(f)).toEqual(["DUPLICATE_LINE", "ABOVE_LIST_PRICE", "DENIED_BY_PLAN"]);
    expect(find(f, "DUPLICATE_LINE")!.amount).toBe(50);
    expect(find(f, "ABOVE_LIST_PRICE")!.amount).toBe(0); // the denied line is counted in the appeal
    expect(potentialSavings(f)).toBe(1050);
  });
  it("savings never exceed what the bill asks for, on the sample", () => {
    const f = allFindings(SAMPLE_BILL, SNAPSHOTS.zsfg ?? null, SAMPLE_EOB);
    expect(potentialSavings(f)).toBeLessThanOrEqual(SAMPLE_BILL.amountDue!);
  });
});

describe("the sample EOB", () => {
  it("is internally consistent", () => {
    const e = SAMPLE_EOB;
    const sum = (k: "billed" | "allowed" | "planPaid" | "patientOwes") => e.lines.reduce((a, l) => a + (l[k] ?? 0), 0);
    expect(sum("billed")).toBe(e.totalBilled);
    expect(sum("allowed")).toBe(e.totalAllowed);
    expect(sum("planPaid")).toBe(e.totalPlanPaid);
    expect(sum("patientOwes")).toBe(e.totalPatientOwes);
    for (const l of e.lines) expect(l.allowed).toBe(l.planPaid! + l.patientOwes! - l.notCovered!);
    expect(e.payer).toBe("Golden Bear Health Plan HMO");
    expect(e.memberName).toBe(SAMPLE_BILL.patientName);
    expect(e.serviceDateFrom).toBe(SAMPLE_BILL.serviceDate);
  });
  it("gives the demo findings: owes more (with the missing plan payment) and one denied line", () => {
    const f = checkEob(SAMPLE_BILL, SAMPLE_EOB);
    expect(kinds(f)).toEqual(["OWES_MORE_THAN_EOB", "DENIED_BY_PLAN"]);
    expect(f[0].amount).toBe(12741 - 537);
    expect(f[0].evidence.some((x) => x.value === "Your plan paid $2,050.00, and the bill shows no insurance payment")).toBe(true);
    expect(f[1].amount).toBe(287);
    expect(f[1].lines).toEqual([6]);
    expect(f[1].evidence[0].value).toContain("CO-50 Not medically necessary");
  });
  it("with the ZSFG snapshot: the duplicate CBC and x-ray stay as questions, counted once", () => {
    const f = allFindings(SAMPLE_BILL, SNAPSHOTS.zsfg ?? null, SAMPLE_EOB);
    expect(kinds(f)).not.toContain("EOB_MISMATCH");
    expect(kinds(f)).not.toContain("CASH_PRICE_GAP");
    expect(kinds(f)).toContain("OWES_MORE_THAN_EOB");
    expect(kinds(f)).toContain("DENIED_BY_PLAN");
    expect(kinds(f)).toContain("DUPLICATE_LINE");
    expect(potentialSavings(f)).toBe(12741 - 537 + 287);
  });
});

import { isoDate, normalizeEobDates } from "../convex/lib/eob";
describe("EOB dates", () => {
  it("turns printed US dates into YYYY-MM-DD", () => {
    expect(isoDate("08/08/2026")).toBe("2026-08-08");
    expect(isoDate("8/9/26")).toBe("2026-08-09");
    expect(isoDate("2026-08-08")).toBe("2026-08-08");
    expect(isoDate(null)).toBeNull();
    expect(isoDate("Aug 8")).toBe("Aug 8");
  });
  it("normalizes every date on the statement", () => {
    const e = normalizeEobDates({ serviceDateFrom: "08/08/2026", serviceDateTo: "08/09/2026", lines: [{ date: "08/08/2026" }] } as never);
    expect([e.serviceDateFrom, e.serviceDateTo, e.lines[0].date]).toEqual(["2026-08-08", "2026-08-09", "2026-08-08"]);
  });
});
