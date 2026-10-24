// A made-up ER bill for the demo. The patient is fictional. Charges are Zuckerberg San
// Francisco General's own published gross charges (CMS price file, updated 2026-03-19),
// with two planted problems: the CBC is billed twice, and the chest x-ray is billed at
// $482 although the published charge is $402. public/sample-bill.png is rendered from this.

import type { ParsedBill } from "./bill";

const D = "2026-09-12";
const lines: ParsedBill["lines"] = [
  { date: D, code: "99284", revCode: "0450", description: "ER EXAM/TREATMENT ROOM LEVEL IV", quantity: 1, charge: 6084 },
  { date: D, code: "70450", revCode: "0350", description: "CT BRAIN WITHOUT CONTRAST", quantity: 1, charge: 4403 },
  { date: D, code: "71046", revCode: "0320", description: "X-RAY CHEST 2 VIEWS", quantity: 1, charge: 482 },
  { date: D, code: "80053", revCode: "0301", description: "COMPREHENSIVE METABOLIC PANEL", quantity: 1, charge: 528 },
  { date: D, code: "85025", revCode: "0305", description: "CBC WITH PLATELETS & DIFF", quantity: 1, charge: 269 },
  { date: D, code: "85025", revCode: "0305", description: "CBC WITH PLATELETS & DIFF", quantity: 1, charge: 269 },
  { date: D, code: "93005", revCode: "0730", description: "EKG TRACING ONLY", quantity: 1, charge: 287 },
  { date: D, code: "96374", revCode: "0450", description: "IV PUSH SINGLE OR INITIAL DRUG", quantity: 1, charge: 419 },
];
const total = lines.reduce((a, l) => a + l.charge, 0);

export const SAMPLE_BILL: ParsedBill = {
  hospitalName: "Zuckerberg San Francisco General Hospital and Trauma Center",
  hospitalWebsite: null,
  billingPhone: "(628) 206-8448",
  accountNumber: "SAMPLE-40017782",
  patientName: "Alex Rivera",
  statementDate: "2026-10-01",
  serviceDate: D,
  insurancePayer: null,
  insurancePaid: 0,
  adjustments: 0,
  patientPaid: 0,
  totalCharges: total,
  amountDue: total,
  isItemized: true,
  lines,
  unreadable: [],
};
