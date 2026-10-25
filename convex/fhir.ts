// The bill as HL7 FHIR R4 JSON (convex/lib/fhir.ts), for the "Download as HL7 FHIR" link.
// Same access as opening the bill: its secret token, or the signed-in owner.
import { v } from "convex/values";
import { query } from "./_generated/server";
import { owned } from "./cases";
import { toFhir } from "./lib/fhir";
import type { ParsedBill } from "./lib/bill";
import type { ParsedEob } from "./lib/eob";
import type { Finding } from "./lib/checks";

export const exportCase = query({
  args: { id: v.id("cases"), token: v.optional(v.string()) },
  handler: async (ctx, { id, token }) => {
    const c = await owned(ctx, id, token);
    if (!c?.bill) return null;
    return toFhir({
      caseId: id,
      bill: c.bill as ParsedBill,
      eob: c.eobStatus === "done" ? ((c.eob ?? null) as ParsedEob | null) : null,
      findings: (c.findings ?? []) as Finding[],
      hospitalName: (c.hospital as { name?: string } | undefined)?.name ?? null,
      now: new Date(c.statusAt ?? c.createdAt),
    });
  },
});
