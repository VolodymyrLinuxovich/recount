import { describe, expect, it } from "vitest";
import { CPT, FINDING_SYSTEM, HCPCS, REVENUE, codeSystem, stableUuid, toFhir } from "../convex/lib/fhir";
import { allFindings } from "../convex/lib/eobChecks";
import { SNAPSHOTS } from "../convex/lib/reference";
import { SAMPLE_BILL, SAMPLE_EOB } from "../convex/lib/sample";

// Loose shape for poking at resources in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FhirResource = Record<string, any>;
const now = new Date("2026-10-24T12:00:00Z");
const of = (b: ReturnType<typeof toFhir>, type: string) => b.entry.map((e) => e.resource).filter((r) => r.resourceType === type) as FhirResource[];

describe("HL7 FHIR R4 export", () => {
  const findings = allFindings(SAMPLE_BILL, SNAPSHOTS.zsfg, SAMPLE_EOB);
  const bundle = toFhir({ caseId: "case1", bill: SAMPLE_BILL, eob: SAMPLE_EOB, findings, now });

  it("is a collection bundle whose references all resolve inside it", () => {
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    const urls = new Set(bundle.entry.map((e) => e.fullUrl));
    expect(urls.size).toBe(bundle.entry.length);
    const refs = JSON.stringify(bundle).match(/"reference":"([^"]+)"/g)!.map((r) => r.slice(13, -1));
    expect(refs.length).toBeGreaterThan(10);
    for (const r of refs) expect(urls.has(r), r).toBe(true);
    for (const u of urls) expect(u).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("is the same export every time (Convex queries must be deterministic)", () => {
    expect(toFhir({ caseId: "case1", bill: SAMPLE_BILL, eob: SAMPLE_EOB, findings, now })).toEqual(bundle);
    expect(stableUuid("a")).not.toBe(stableUuid("b"));
  });

  it("has one ChargeItem per bill line with its code, revenue code and charge", () => {
    const items = of(bundle, "ChargeItem");
    expect(items).toHaveLength(SAMPLE_BILL.lines.length);
    for (const [i, c] of items.entries()) {
      const l = SAMPLE_BILL.lines[i];
      expect(c.status).toBe("billable"); // required
      expect(c.subject.reference).toMatch(/^urn:uuid:/); // required
      expect(c.code.text).toBe(l.description);
      expect(c.priceOverride).toEqual({ value: l.charge, currency: "USD" });
      if (l.code) expect(c.code.coding[0]).toEqual({ system: codeSystem(l.code), code: l.code });
      if (l.revCode) expect(c.code.coding.some((x: { system: string }) => x.system === REVENUE)).toBe(true);
    }
  });

  it("has an Invoice with every line and the bill's totals", () => {
    const [inv] = of(bundle, "Invoice");
    expect(inv.status).toBe("issued");
    expect(inv.lineItem).toHaveLength(SAMPLE_BILL.lines.length);
    expect(inv.lineItem[0].chargeItemReference.reference).toMatch(/^urn:uuid:/);
    expect(inv.totalNet).toEqual({ value: SAMPLE_BILL.amountDue, currency: "USD" });
  });

  it("maps the insurance statement to Coverage and ExplanationOfBenefit with R4's required fields", () => {
    const [eob] = of(bundle, "ExplanationOfBenefit");
    for (const k of ["status", "type", "use", "patient", "created", "insurer", "provider", "outcome", "insurance"]) expect(eob[k], k).toBeDefined();
    expect(eob.outcome).toBe("partial"); // the sample is partly denied
    expect(eob.item).toHaveLength(SAMPLE_EOB.lines.length);
    const owes = eob.total.find((t: FhirResource) => t.category.coding[0].code === "memberliability");
    expect(owes.amount.value).toBe(SAMPLE_EOB.totalPatientOwes);
    const [cov] = of(bundle, "Coverage");
    expect(cov.payor).toHaveLength(1);
    expect(cov.beneficiary.reference).toBe(eob.patient.reference);
  });

  it("has one DetectedIssue per finding, pointing at its lines", () => {
    const issues = of(bundle, "DetectedIssue");
    expect(issues).toHaveLength(findings.length);
    const dup = issues.find((d) => d.code.coding[0].code === "DUPLICATE_LINE")!;
    expect(dup.code.coding[0].system).toBe(FINDING_SYSTEM);
    expect(dup.status).toBe("final");
    expect(dup.implicated.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the hospital account number on the Invoice and leaves out the insurance member ID", () => {
    const [inv] = of(bundle, "Invoice");
    expect(inv.identifier.some((i: { value: string }) => i.value === SAMPLE_BILL.accountNumber)).toBe(true);
    expect(JSON.stringify(bundle)).not.toContain(SAMPLE_EOB.memberId!);
  });

  it("works for a bill with no statement and no findings", () => {
    const b = toFhir({ caseId: "case2", bill: { ...SAMPLE_BILL, patientName: null }, now });
    expect(of(b, "ExplanationOfBenefit")).toHaveLength(0);
    expect(of(b, "Patient")[0].name).toBeUndefined();
  });

  it("tells CPT from HCPCS", () => {
    expect(codeSystem("99284")).toBe(CPT);
    expect(codeSystem("0001F")).toBe(CPT);
    expect(codeSystem("J1885")).toBe(HCPCS);
    expect(codeSystem("0450")).toBeNull();
  });
});
