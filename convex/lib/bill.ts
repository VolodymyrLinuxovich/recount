import { z } from "zod";

// What Claude must return after reading a bill photo or PDF.
// Every money field is a number in dollars. Anything it can't read is null and listed in `unreadable`.
export const BillLine = z.object({
  date: z.string().nullable().describe("Service date YYYY-MM-DD, or null if not printed"),
  code: z.string().nullable().describe("CPT/HCPCS code exactly as printed, or null if no code is printed"),
  revCode: z.string().nullable().describe("4-digit revenue code if printed, else null"),
  description: z.string().describe("Line description as printed"),
  quantity: z.number().describe("Units; 1 if not printed"),
  charge: z.number().describe("Total charge for this line in dollars"),
});
export type BillLine = z.infer<typeof BillLine>;

export const ParsedBill = z.object({
  isMedicalBill: z.boolean().describe("False if this is not a hospital or medical bill (e.g. a store receipt)"),
  hospitalName: z.string().nullable(),
  hospitalWebsite: z.string().nullable().describe("Only if printed on the bill"),
  hospitalAddress: z.string().nullable().describe("Hospital street address with city, as printed"),
  billingPhone: z.string().nullable(),
  accountNumber: z.string().nullable(),
  patientName: z.string().nullable(),
  patientAddress: z.string().nullable().describe("Patient or guarantor mailing address as printed, else null"),
  statementDate: z.string().nullable().describe("YYYY-MM-DD"),
  serviceDate: z.string().nullable().describe("First date of service, YYYY-MM-DD"),
  insurancePayer: z.string().nullable().describe("Insurance named on the bill, or null if self-pay/none"),
  insurancePaid: z.number().describe("Total insurance payments shown, 0 if none"),
  adjustments: z.number().describe("Total discounts/adjustments shown as a positive number, 0 if none"),
  patientPaid: z.number().describe("Payments already made by the patient, 0 if none"),
  totalCharges: z.number().nullable(),
  amountDue: z.number().nullable(),
  isItemized: z.boolean().describe("True if individual services with charges are listed"),
  lines: z.array(BillLine),
  unreadable: z.array(z.string()).describe("Parts of the bill you could not read with confidence"),
});
export type ParsedBill = z.infer<typeof ParsedBill>;
