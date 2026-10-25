import { describe, expect, it } from "vitest";
import type { ParsedBill } from "../convex/lib/bill";
import type { Finding, FindingKind } from "../convex/lib/checks";
import { assess, type FplTable } from "../convex/lib/eligibility";
import type { ParsedEob } from "../convex/lib/eob";
import { inventedAmounts, numbersIn } from "../convex/lib/letterCheck";
import {
  eobLawLine,
  findingTarget,
  letterKinds,
  letterPrompt,
  letterTitle,
  templateLetters,
  type LetterFacts,
} from "../convex/lib/letters";

const FPL: FplTable = { year: 2026, source: "test", base: 15000, perAdditional: 5000 };

const bill = (extra: Partial<ParsedBill> = {}): ParsedBill => ({
  isMedicalBill: true,
  hospitalName: "Zuckerberg San Francisco General",
  hospitalWebsite: null,
  hospitalAddress: "1001 Potrero Ave, San Francisco, CA 94110",
  billingPhone: null,
  accountNumber: "ZS-2026-0412",
  patientName: "Alex Rivera",
  patientAddress: null,
  statementDate: "2026-09-20",
  serviceDate: "2026-09-02",
  insurancePayer: "Golden Bear Health Plan HMO",
  insurancePaid: 0,
  adjustments: 0,
  patientPaid: 0,
  totalCharges: 2982,
  amountDue: 2982,
  isItemized: true,
  lines: [
    { date: "2026-09-02", code: "99284", revCode: "0450", description: "ED visit level 4", quantity: 1, chargePrinted: "2,400.00", charge: 2400 },
    { date: "2026-09-02", code: "85025", revCode: "0300", description: "CBC with differential", quantity: 1, chargePrinted: "100.00", charge: 100 },
    { date: "2026-09-02", code: "71046", revCode: "0320", description: "Chest x-ray, 2 views", quantity: 1, chargePrinted: "482.00", charge: 482 },
  ],
  unreadable: [],
  ...extra,
});

const eob = (extra: Partial<ParsedEob> = {}): ParsedEob => ({
  isEob: true,
  payer: "Golden Bear Health Plan HMO",
  planType: "HMO",
  memberName: "Alex Rivera",
  memberId: "GB123456789",
  claimNumber: "CLM-778812",
  providerName: "Zuckerberg San Francisco General",
  serviceDateFrom: "2026-09-02",
  serviceDateTo: "2026-09-02",
  network: "in",
  emergency: true,
  claimStatus: "partly_denied",
  totalBilled: 2500,
  totalAllowed: 1240,
  totalPlanPaid: 950,
  totalPatientOwes: 290,
  appealDeadline: "180 days from the date of this notice",
  appealAddress: "Golden Bear Health Plan, Appeals Unit, PO Box 1000, Oakland, CA 94601",
  insurerPhone: "1-800-555-0100",
  lines: [
    { date: "2026-09-02", code: "99284", description: "Emergency visit", billed: 2400, allowed: 1200, planPaid: 950, patientOwes: 250, notCovered: 0, remark: null },
    { date: "2026-09-02", code: "85025", description: "Blood count", billed: 100, allowed: 40, planPaid: 0, patientOwes: 40, notCovered: 40, remark: "CO-50 Not medically necessary" },
  ],
  unreadable: [],
  ...extra,
});

const finding = (kind: FindingKind, amount: number, lines: number[] = [], title: string = kind, detail: string = `About ${kind}.`): Finding => ({
  id: `${kind}-${lines.join("-")}`,
  kind,
  lines,
  amount,
  title,
  detail,
  evidence: [],
  confidence: "high",
});

const household = { size: 2, annualIncome: 60000, insured: true };

function facts(findings: Finding[], extra: Partial<LetterFacts> = {}): LetterFacts {
  const b = extra.bill ?? bill();
  return {
    bill: b,
    hospital: { name: "Zuckerberg San Francisco General", policyUrl: null, address: b.hospitalAddress },
    findings,
    eligibility: assess(household, FPL, null, b.amountDue),
    household,
    eob: eob(),
    ...extra,
  };
}

// The demo case: balance above the EOB (with the missing plan payment folded in),
// one line the EOB doesn't list, and one denied line.
const demoFindings = [
  finding("OWES_MORE_THAN_EOB", 2692),
  finding("NOT_ON_EOB", 0, [2]),
  finding("DENIED_BY_PLAN", 40, [1]),
];

const allText = (ls: ReturnType<typeof templateLetters>) => ls.flatMap((l) => [l.subject, l.body, l.subjectPatient ?? "", l.bodyPatient ?? ""]);

describe("letterKinds", () => {
  it("always includes assistance", () => {
    expect(letterKinds({ findings: [] })).toEqual(["assistance"]);
  });
  it("adds dispute for bill checks", () => {
    expect(letterKinds({ findings: [finding("DUPLICATE_LINE", 100, [0, 1])] })).toEqual(["assistance", "dispute"]);
  });
  it("adds dispute when the only hospital finding comes from the EOB", () => {
    expect(letterKinds({ findings: [finding("CLAIM_PENDING", 0)] })).toEqual(["assistance", "dispute"]);
  });
  it("adds appeal for a denial, and only appeal when nothing targets the hospital", () => {
    expect(letterKinds({ findings: [finding("DENIED_BY_PLAN", 40)] })).toEqual(["assistance", "appeal"]);
    expect(letterKinds({ findings: demoFindings })).toEqual(["assistance", "dispute", "appeal"]);
  });
  it("writes no letter for a mismatched EOB", () => {
    expect(findingTarget("EOB_MISMATCH")).toBe("none");
    expect(letterKinds({ findings: [finding("EOB_MISMATCH", 0)] })).toEqual(["assistance"]);
  });
  it("matches the kinds templateLetters writes", () => {
    for (const fs of [[], demoFindings, [finding("DENIED_BY_PLAN", 40)], [finding("EOB_MISMATCH", 0)], [finding("SURPRISE_BILL", 100)]]) {
      const f = facts(fs);
      expect(templateLetters(f).map((l) => l.kind)).toEqual(letterKinds(f));
    }
  });
});

describe("dispute letter with an EOB", () => {
  const f = facts(demoFindings);
  const [, dispute] = templateLetters(f, "es");

  it("states the EOB amounts and asks to correct the balance", () => {
    expect(dispute.kind).toBe("dispute");
    expect(dispute.body).toContain("compared it with my insurance statement");
    expect(dispute.body).toContain("Golden Bear Health Plan HMO, claim CLM-778812");
    expect(dispute.body).toContain("says my share is $290.00");
    expect(dispute.body).toContain("Your bill asks for $2,982.00, which is $2,692.00 more");
    expect(dispute.body).toContain("my plan paid $950.00, and your bill shows no insurance payment");
    expect(dispute.body).toContain(eobLawLine("IN_NETWORK", "en"));
    expect(dispute.body).toContain("Line 3, Chest x-ray, 2 views (code 71046), $482.00, is not on my insurance statement");
    expect(dispute.body).not.toContain("DENIED_BY_PLAN");
    expect(dispute.body).not.toContain("not medically necessary");
  });

  it("has a Spanish copy with the same amounts", () => {
    expect(dispute.subjectPatient).toBe("Preguntas sobre los cargos de la cuenta ZS-2026-0412");
    expect(dispute.bodyPatient).toContain("dice que mi parte es $290.00");
    expect(dispute.bodyPatient).toContain("$2,692.00 más");
    expect(dispute.bodyPatient).toContain(eobLawLine("IN_NETWORK", "es"));
    expect(dispute.bodyPatient).toContain("La línea 3, Chest x-ray, 2 views (código 71046), $482.00, no aparece");
  });

  it("doesn't claim the in-network rule when the network is unknown", () => {
    const [, d] = templateLetters(facts(demoFindings, { eob: eob({ network: "unknown" }) }));
    expect(d.body).not.toContain(eobLawLine("IN_NETWORK", "en"));
    expect(d.body).toContain("explain the difference in writing");
  });

  it("cites the No Surprises Act for an out-of-network emergency", () => {
    const sf = facts([finding("SURPRISE_BILL", 2692)], { eob: eob({ network: "out", claimStatus: "processed" }) });
    const [, d] = templateLetters(sf, "es");
    expect(d.body).toContain(eobLawLine("NO_SURPRISES", "en"));
    expect(d.body).toContain("42 U.S.C. 300gg-131");
    expect(d.body).toContain("correct my bill to the in-network cost sharing shown on the statement");
    expect(d.body).not.toContain(eobLawLine("IN_NETWORK", "en"));
    expect(d.bodyPatient).toContain(eobLawLine("NO_SURPRISES", "es"));
  });

  it("asks to apply a missing plan payment", () => {
    const [, d] = templateLetters(facts([finding("INSURANCE_NOT_APPLIED", 950)], { eob: eob({ totalPatientOwes: 2032 }) }), "es");
    expect(d.body).toContain("shows my plan paid $950.00. Your bill shows no insurance payment.");
    expect(d.bodyPatient).toContain("mi plan pagó $950.00");
  });

  it("asks to hold a bill while the claim is pending", () => {
    const pf = facts([finding("CLAIM_PENDING", 0)], { eob: eob({ claimStatus: "pending", totalPlanPaid: null, totalPatientOwes: null, lines: [] }) });
    const letters = templateLetters(pf, "es");
    expect(letters.map((l) => l.kind)).toEqual(["assistance", "dispute"]);
    expect(letters[1].body).toContain("hold this bill and do not send it to collections until my insurance finishes");
    expect(letters[1].bodyPatient).toContain("no la envíen a cobranzas");
  });

  it("keeps bill checks and EOB findings in one numbered list", () => {
    const fs = [finding("DUPLICATE_LINE", 100, [0, 1], "CBC is billed twice", "Lines 1 and 2 match."), finding("OWES_MORE_THAN_EOB", 2692)];
    const [, d] = templateLetters(facts(fs));
    expect(d.body).toContain("1. CBC is billed twice. Lines 1 and 2 match. ($100.00)");
    expect(d.body).toContain("2. My balance is higher than my insurance statement says.");
  });

  it("is unchanged without an EOB", () => {
    const [, d] = templateLetters(facts([finding("DUPLICATE_LINE", 100, [0, 1], "CBC is billed twice", "Lines 1 and 2 match.")], { eob: null }));
    expect(d.body).toContain("have questions about these charges:");
    expect(d.body).not.toContain("insurance statement");
  });
});

describe("appeal letter", () => {
  const f = facts(demoFindings);
  const appeal = templateLetters(f, "es").find((l) => l.kind === "appeal")!;

  it("goes to the insurer with member ID, claim and date", () => {
    expect(appeal.title).toBe("Insurance appeal");
    expect(appeal.subject).toBe("Appeal of claim CLM-778812, member ID GB123456789");
    expect(appeal.body.startsWith("Golden Bear Health Plan HMO\nGolden Bear Health Plan, Appeals Unit, PO Box 1000, Oakland, CA 94601")).toBe(true);
    expect(appeal.body).toContain("Member ID: GB123456789");
    expect(appeal.body).toContain("Claim number: CLM-778812");
    expect(appeal.body).toContain("Date of service: 2026-09-02");
    expect(appeal.body).toContain('1. Blood count (code 85025), 2026-09-02: $40.00 not covered. Reason given: "CO-50 Not medically necessary".');
    expect(appeal.body).not.toContain("Emergency visit");
    expect(appeal.body).toContain("full internal appeal (grievance)");
    expect(appeal.body).toContain("decision in writing");
    expect(appeal.body).toContain("criteria");
    expect(appeal.body).toContain('"180 days from the date of this notice"');
    expect(appeal.body).toContain(eobLawLine("IMR", "en"));
    expect(appeal.body).not.toContain("billing office");
  });

  it("has a Spanish copy", () => {
    expect(letterTitle("appeal", "es")).toBe("Apelación al seguro");
    expect(appeal.subjectPatient).toBe("Apelación del reclamo CLM-778812, número de miembro GB123456789");
    expect(appeal.bodyPatient).toContain("Número de miembro: GB123456789");
    expect(appeal.bodyPatient).toContain("$40.00 no cubierto");
    expect(appeal.bodyPatient).toContain(eobLawLine("IMR", "es"));
  });

  it("doesn't name the state review for Medi-Cal or Medicare", () => {
    for (const planType of ["Medi-Cal", "Medicare Advantage"]) {
      const a = templateLetters(facts(demoFindings, { eob: eob({ planType }) }), "es").find((l) => l.kind === "appeal")!;
      expect(a.body).toContain("follow");
      expect(a.body).toContain(eobLawLine("PLAN_APPEAL_STEPS", "en"));
      expect(a.body).not.toContain("Independent Medical Review");
      expect(a.body).not.toContain("Managed Health Care");
      expect(a.bodyPatient).toContain(eobLawLine("PLAN_APPEAL_STEPS", "es"));
    }
  });

  it("uses placeholders for missing EOB facts", () => {
    const a = templateLetters(facts([finding("DENIED_BY_PLAN", 40)], { eob: eob({ payer: null, memberId: null, claimNumber: null, appealAddress: null, serviceDateFrom: null, serviceDateTo: null }), bill: bill({ serviceDate: null }) })).find((l) => l.kind === "appeal")!;
    expect(a.body).toContain("[Insurance company]\n[insurer appeals address]");
    expect(a.body).toContain("Member ID: [member ID]");
    expect(a.body).toContain("Claim number: [claim number]");
    expect(a.body).toContain("Date of service: [date of service]");
    expect(a.subject).toBe("Appeal of claim [claim number], member ID [member ID]");
  });

  it("covers a whole denied claim without line amounts", () => {
    const e = eob({ claimStatus: "denied", totalPlanPaid: 0, totalPatientOwes: 2500, lines: [{ date: null, code: "99284", description: "Emergency visit", billed: 2400, allowed: null, planPaid: 0, patientOwes: null, notCovered: null, remark: "N130 Benefit maximum reached" }] });
    const a = templateLetters(facts([finding("DENIED_BY_PLAN", 2500)], { eob: e })).find((l) => l.kind === "appeal")!;
    expect(a.body).toContain('1. Emergency visit (code 99284): $2,400.00 not covered. Reason given: "N130 Benefit maximum reached".');
    expect(a.body).toContain("Total not covered: $2,500.00.");
    expect(inventedAmounts([a.subject, a.body], facts([finding("DENIED_BY_PLAN", 2500)], { eob: e }))).toEqual([]);
  });
});

describe("template letters stay true to the facts", () => {
  const cases: [string, LetterFacts][] = [
    ["demo", facts(demoFindings)],
    ["surprise", facts([finding("SURPRISE_BILL", 2692)], { eob: eob({ network: "out" }) })],
    ["patient paid some", facts([finding("OWES_MORE_THAN_EOB", 2692)], { bill: bill({ patientPaid: 50, amountDue: 2932 }) })],
    ["pending", facts([finding("CLAIM_PENDING", 0)], { eob: eob({ claimStatus: "pending" }) })],
    ["no EOB", facts([finding("DUPLICATE_LINE", 100, [0, 1], "CBC is billed twice", "Lines 1 and 2 match.")], { eob: null })],
  ];

  for (const [name, f] of cases) {
    for (const lang of ["en", "es"] as const) {
      it(`${name} (${lang}): every amount comes from the facts`, () => {
        expect(inventedAmounts(allText(templateLetters(f, lang)), f)).toEqual([]);
      });
      it(`${name} (${lang}): no blanks where facts exist`, () => {
        for (const l of templateLetters(f, lang)) {
          const blanks = [l.subject, l.body, l.subjectPatient ?? "", l.bodyPatient ?? ""].join("\n").match(/\[[^\]\n]+\]/g) ?? [];
          // Only the patient's own contact lines are left for them to fill.
          expect(blanks.filter((b) => !["[Address]", "[Phone]", "[Dirección]", "[Teléfono]"].includes(b))).toEqual([]);
        }
      });
    }
  }
});

describe("letterPrompt", () => {
  it("keeps every rule of the old prompt", () => {
    for (const kind of ["assistance", "dispute", "appeal"] as const) {
      const p = letterPrompt(kind);
      expect(p).toContain("using ONLY the facts in the JSON below");
      expect(p).toContain("no invented law, amounts, dates or names");
      expect(p).toContain("Use [brackets] ONLY for values you don't know");
      expect(p).toContain('If "patientLanguage" is "es"');
      expect(p).toContain("Never say the patient qualifies or is eligible");
      expect(p.endsWith(`Write ONLY the "${kind}" letter (an array with exactly one letter).`)).toBe(true);
    }
  });
  it("gives the dispute letter the EOB rules and law lines", () => {
    const p = letterPrompt("dispute");
    expect(p).toContain("CLAIM_PENDING");
    expect(p).toContain("word for word");
    expect(p).toContain(eobLawLine("NO_SURPRISES", "en"));
    expect(p).toContain(eobLawLine("IN_NETWORK", "en"));
  });
  it("describes the appeal letter", () => {
    const p = letterPrompt("appeal");
    expect(p).toContain("insurance company, not the hospital");
    expect(p).toContain("[insurer appeals address]");
    expect(p).toContain(eobLawLine("IMR", "en"));
    expect(p).toContain(eobLawLine("PLAN_APPEAL_STEPS", "en"));
    expect(p).not.toContain(eobLawLine("NO_SURPRISES", "en"));
  });
});

describe("letter amount check with an EOB", () => {
  it("walks nested EOB lines and totals", () => {
    const known = numbersIn({ eob: eob() });
    for (const n of [950, 290, 1240, 2500, 40, 250]) expect(known.has(n)).toBe(true);
  });
  it("counts EOB amounts as known only when the EOB is in the facts", () => {
    const text = ["Your plan allowed $1,240.00 and paid $950.00. You owe $290.00."];
    expect(inventedAmounts(text, { bill: bill(), eob: eob() })).toEqual([]);
    expect(inventedAmounts(text, { bill: bill() })).toEqual([1240, 950, 290]);
  });
  it("skips nulls and odd values without failing", () => {
    expect([...numbersIn({ a: null, b: undefined, c: [null, { d: NaN, e: 12.345 }], f: "$5.00" })].sort()).toEqual([12.35, 5]);
  });
});

describe("appeal letter without line amounts", () => {
  it("doesn't appeal a copay remark; uses the general sentence", () => {
    const e = eob({
      totalPatientOwes: 250, totalPlanPaid: 750,
      lines: [{ date: "2026-09-02", code: "99284", description: "Emergency visit", billed: 1000, allowed: 1000, planPaid: 750, patientOwes: 250, notCovered: null, remark: "PR-3 Emergency room copay" }],
    });
    const appeal = templateLetters(facts([finding("DENIED_BY_PLAN", 0)], { eob: e })).find((l) => l.kind === "appeal")!;
    expect(appeal.body).not.toContain("copay");
    expect(appeal.body).toContain("Your statement shows that services on this claim were denied or not covered.");
  });
  it("still lists a line with a CO- denial code", () => {
    const e = eob({
      lines: [
        { date: "2026-09-02", code: "99284", description: "Emergency visit", billed: 1000, allowed: 1000, planPaid: 750, patientOwes: 250, notCovered: null, remark: "PR-3 Emergency room copay" },
        { date: "2026-09-02", code: "85025", description: "Blood count", billed: 100, allowed: 0, planPaid: 0, patientOwes: null, notCovered: null, remark: "CO-50 Not medically necessary" },
      ],
    });
    const appeal = templateLetters(facts([finding("DENIED_BY_PLAN", 0)], { eob: e })).find((l) => l.kind === "appeal")!;
    expect(appeal.body).toContain("Blood count");
    expect(appeal.body).not.toContain("copay");
  });
});
