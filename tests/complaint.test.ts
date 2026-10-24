import { describe, expect, it } from "vitest";
import type { ParsedBill } from "../convex/lib/bill";
import { blanksIn, HCAI_ADDRESS, longDate, quotesEligibility, templateComplaint, type ComplaintFacts } from "../convex/lib/complaint";

const bill: ParsedBill = {
  hospitalName: "Test Hospital", isMedicalBill: true, hospitalWebsite: null, hospitalAddress: "1 Main St, Oakland, CA 94601", patientAddress: null, billingPhone: null,
  accountNumber: "A-123", patientName: "Alex Rivera", statementDate: "2026-10-01", serviceDate: "2026-09-12", insurancePayer: null, insurancePaid: 0,
  adjustments: 0, patientPaid: 0, totalCharges: 1000, amountDue: 1000, isItemized: true, lines: [], unreadable: [],
};

const base: ComplaintFacts = {
  bill,
  hospital: { name: "Test Hospital", address: "1 Main St, Oakland, CA 94601" },
  outcome: "denied",
  sentOn: "2026-10-02",
  today: "2026-11-20",
  household: { size: 2, annualIncome: 30000, insured: false },
  fplPct: 140,
};

describe("complaint template", () => {
  it("is addressed to HCAI and carries the case facts", () => {
    const l = templateComplaint(base);
    expect(l.kind).toBe("complaint");
    expect(l.body.startsWith(HCAI_ADDRESS.join("\n"))).toBe(true);
    for (const s of ["Test Hospital, 1 Main St", "Account number: A-123", "Date of service: September 12, 2026", "Amount billed: $1,000.00", "request: October 2, 2026", "Alex Rivera"]) {
      expect(l.body).toContain(s);
    }
    expect(l.subject).toBe("Complaint about Test Hospital, account A-123");
    expect(l.bodyPatient).toBeUndefined();
  });

  it("says what happened for each outcome", () => {
    expect(templateComplaint(base).body).toContain("The hospital denied my request");
    expect(templateComplaint({ ...base, outcome: "no_reply" }).body).toContain("As of November 20, 2026, the hospital has not given me a decision");
    const col = templateComplaint({ ...base, outcome: "collections" }).body;
    expect(col).toContain("sent my account to a collection agency");
    expect(col).toContain('127425(g) says a hospital "shall not send the unpaid bill to any collection agency');
    expect(col).toContain("the collection notice");
  });

  it("quotes the collections rule only when the bill went to collections", () => {
    expect(templateComplaint(base).body).not.toContain("127425(g)");
    expect(templateComplaint({ ...base, outcome: "no_reply" }).body).not.toContain("127425(g)");
  });

  it("quotes the 400% rule only for uninsured patients at or below 400% FPL", () => {
    expect(templateComplaint(base).body).toContain("127405(a)(1)(A)");
    expect(quotesEligibility({ ...base, fplPct: 401 })).toBe(false);
    expect(quotesEligibility({ ...base, household: { size: 2, annualIncome: 30000, insured: true } })).toBe(false);
    expect(quotesEligibility({ ...base, household: null })).toBe(false);
    expect(templateComplaint({ ...base, fplPct: 450 }).body).not.toContain("127405(a)(1)(A)");
  });

  it("never says the patient qualifies, and invents no deadline or penalty", () => {
    for (const outcome of ["denied", "no_reply", "collections"] as const) {
      const b = templateComplaint({ ...base, outcome }, "es");
      for (const text of [b.body, b.bodyPatient ?? ""]) {
        expect(text).not.toMatch(/\bI qualify\b|\bI am eligible\b|califico|penalt|multa|\bdays\b|\bdías\b|deadline|plazo/i);
      }
    }
  });

  it("quotes the hospital's policy conflicts, but not 'ask' findings or rules we can't state", () => {
    const l = templateComplaint({
      ...base,
      policyFindings: [
        { rule: "DEADLINE", verdict: "conflict", quote: "Apply within 240 days." },
        { rule: "ASSETS", verdict: "ask", quote: "We may review assets." },
        { rule: "UNKNOWN", verdict: "conflict", quote: "Something else." },
      ],
    });
    expect(l.body).toContain('"Apply within 240 days." California law does not allow time limits');
    expect(l.body).not.toContain("We may review assets.");
    expect(l.body).not.toContain("Something else.");
  });

  it("leaves blanks for unknown facts, which block approval until filled", () => {
    const l = templateComplaint({ ...base, sentOn: null, bill: { ...bill, accountNumber: null, patientName: null } });
    expect(blanksIn([l.subject, l.body])).toEqual(["[account number]", "[Your name]", "[date you sent your request]", "[Address]", "[Phone]"]);
    expect(blanksIn(["Sign: [Signature]", "[Firma]"])).toEqual([]);
  });

  it("has a Spanish copy to read, with the state's address kept as is", () => {
    const l = templateComplaint({ ...base, outcome: "collections" }, "es");
    expect(l.subject).toMatch(/^Complaint about/);
    expect(l.subjectPatient).toBe("Queja sobre Test Hospital, cuenta A-123");
    expect(l.bodyPatient).toContain(HCAI_ADDRESS[2]);
    expect(l.bodyPatient).toContain("Fecha del servicio: 12 de septiembre de 2026");
    expect(l.bodyPatient).toContain("agencia de cobranza");
    expect(l.bodyPatient).toContain("127425(g)");
  });

  it("formats dates and leaves other text alone", () => {
    expect(longDate("2026-01-05")).toBe("January 5, 2026");
    expect(longDate("not a date")).toBe("not a date");
  });
});
