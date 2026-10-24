// A made-up ER bill for the demo. The patient is fictional. Line amounts are set from the
// hospital's published standard charges, with two planted problems (a duplicate line and a
// line billed above the published charge). public/sample-bill.png is rendered from this.

import type { ParsedBill } from "./bill";

export const SAMPLE_BILL: ParsedBill = {
  hospitalName: "Zuckerberg San Francisco General Hospital and Trauma Center",
  hospitalWebsite: null,
  billingPhone: "(628) 206-8448",
  accountNumber: "SAMPLE-40017782",
  patientName: "Alex Rivera",
  statementDate: "2026-10-01",
  serviceDate: "2026-09-12",
  insurancePayer: null,
  insurancePaid: 0,
  adjustments: 0,
  patientPaid: 0,
  totalCharges: 0,
  amountDue: 0,
  isItemized: true,
  lines: [],
  unreadable: [],
};
