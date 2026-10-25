"use node";

// Drafts the complaint to HCAI. The model writes from the case's facts only; if it's unavailable
// or fails, the fixed template in lib/complaint.ts is used. Either way the patient reviews,
// fills any [blanks], approves, and files it themselves.
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { FollowUp } from "./followUp";
import type { ParsedBill } from "./lib/bill";
import { COMPLAINT_LAW, HCAI_ADDRESS, quotesEligibility, templateComplaint, type ComplaintFacts } from "./lib/complaint";
import { inventedAmounts } from "./lib/letterCheck";
import { lawLine, resolveFilledBrackets } from "./lib/letters";
import { modelReady, structured, type Run } from "./lib/model";
import { type Lang, isLang, pick } from "./lib/lang";
import { byKey } from "./lib/statewide";

const Out = z.object({
  subject: z.string(),
  body: z.string(),
  bodyPatient: z.string().nullable().describe("Faithful Spanish translation of body, only if patientLanguage is es; else null"),
});

const PROMPT = `Write a complaint a California patient will file with HCAI's Hospital Bill Complaint Program, using ONLY the facts in the JSON below.
- Write it in English, addressed to the program at "programAddress".
- Say plainly what the patient asked for (financial assistance from the hospital), when they sent it, and what happened ("outcome": denied = the hospital denied it; no_reply = no decision yet as of "today"; collections = the account was sent to a collection agency while the request was open).
- List the hospital, the hospital's address if given, the account number, the date of service and the amount billed.
- Quote the law ONLY from "lawToQuote", word for word, with its citation. Quote nothing else as law. If "lawToQuote" is empty, cite no law.
- If "policyFindings" is not empty, quote each policy sentence and the matching "law" line after it.
- Ask the program to review how the hospital handled the request. List the copies the patient will attach from "attachments".
- Never say the patient qualifies, never threaten, never mention deadlines, penalties or amounts that aren't in the facts. Plain, short sentences.
- Use [brackets] ONLY for unknown values, as short placeholders with no colon inside, like "[Address]" or "[Phone]". End with "Thank you,", the patient's name, then "[Address]" and "[Phone]" on their own lines.
- If "patientLanguage" is "es", also give a faithful Spanish translation of the body in bodyPatient; otherwise null.`;

export const draftComplaint = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.runQuery(internal.cases.load, { id: caseId });
    const f = c?.followUp as FollowUp | undefined;
    if (!c?.bill || !f) return;
    const lang: Lang = isLang(c.lang) ? c.lang : "en";
    const t = pick(lang);
    type Complaint = ReturnType<typeof templateComplaint>;
    const finish = (l: Complaint): Complaint => ({
      ...l,
      title: lang === "es" ? "Queja ante el estado" : l.title,
      subject: resolveFilledBrackets(l.subject),
      body: resolveFilledBrackets(l.body),
      ...(l.bodyPatient ? { bodyPatient: resolveFilledBrackets(l.bodyPatient) } : {}),
    });
    let tpl: Complaint | null = null;
    let saved = false;
    try {
      const bill = c.bill as ParsedBill;
      const facts: ComplaintFacts = {
        bill,
        hospital: c.hospital ? { name: c.hospital.name, address: bill.hospitalAddress ?? byKey(c.hospitalKey ?? "")?.address ?? null } : null,
        outcome: f.outcome,
        sentOn: f.sentOn,
        today: new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }),
        household: c.household ?? null,
        fplPct: c.eligibility?.fplPct ?? null,
        policyFindings: ((c.policyFindings ?? []) as { rule: string; verdict: string; quote: string }[]).filter((p) => p.verdict !== "ask" && lawLine(p.rule, "en")),
      };
      const template = templateComplaint(facts, lang);
      tpl = template;

      await ctx.runMutation(internal.cases.step, { caseId, key: "complaint", label: t("Writing your complaint", "Escribiendo su queja"), state: "running" });
      let letter = template;
      let source: "claude" | "template" = "template";
      if (modelReady("letters")) {
        try {
          const forModel = {
            programAddress: HCAI_ADDRESS.join(", "),
            patient: bill.patientName,
            hospital: facts.hospital?.name ?? bill.hospitalName,
            hospitalAddress: facts.hospital?.address ?? null,
            accountNumber: bill.accountNumber,
            serviceDate: bill.serviceDate,
            amountBilled: bill.amountDue,
            requestSentOn: f.sentOn,
            today: facts.today,
            outcome: f.outcome,
            household: facts.household ? { ...facts.household, fplPct: facts.fplPct } : null,
            lawToQuote: [
              ...(quotesEligibility(facts) ? [{ ...COMPLAINT_LAW.eligible, means: "eligible to apply for charity care or discount payment" }] : []),
              ...(f.outcome === "collections" ? [{ ...COMPLAINT_LAW.collections, means: "while the patient is attempting to qualify, unless the assignee agrees to follow the law" }] : []),
            ],
            policyFindings: facts.policyFindings?.map((p) => ({ quote: p.quote, law: lawLine(p.rule, "en") })),
            attachments: ["hospital bill", "financial assistance request", "recent pay stubs or tax returns", ...(f.outcome === "denied" ? ["the denial letter, if received"] : []), ...(f.outcome === "collections" ? ["the collection notice"] : [])],
            patientLanguage: lang,
          };
          const record = async (r: Run) => {
            await ctx.runMutation(internal.cases.recordRun, { caseId, ...r });
          };
          const res = await structured(
            { task: "letters", parts: [{ type: "text", text: `${PROMPT}\n\n<facts>\n${JSON.stringify(forModel, null, 2)}\n</facts>` }], schema: Out, maxTokens: 6000 },
            record,
          );
          const o = res.refused ? null : res.data;
          // Rule check: a complaint to the state must not name a dollar amount that isn't in the facts.
          const odd = o?.body ? inventedAmounts([o.subject, o.body], { forModel, template: [template.subject, template.body] }) : [];
          if (odd.length) {
            await ctx.runMutation(internal.cases.step, {
              caseId, key: "complaint", label: t("The draft named an amount not on your bill, so we used our standard complaint", "El borrador mencionaba un monto que no está en su factura; usamos nuestra queja estándar"), state: "warn",
            });
          } else if (o?.body) {
            letter = {
              ...template,
              subject: o.subject || template.subject,
              body: o.body,
              // Our own Spanish subject, so it can't be garbled; the model's Spanish body if it gave one.
              ...(lang === "es" ? { subjectPatient: template.subjectPatient, bodyPatient: o.bodyPatient || template.bodyPatient } : {}),
            };
            source = "claude";
          }
        } catch (e) {
          await ctx.runMutation(internal.cases.step, {
            caseId, key: "complaint", label: t("Model unavailable, used our standard complaint", "El modelo no está disponible; usamos nuestra queja estándar"), state: "warn", detail: String(e).slice(0, 200),
          });
        }
      }
      await ctx.runMutation(internal.followUp.saveComplaint, { id: caseId, letter: finish(letter), source });
      saved = true;
      await ctx.runMutation(internal.cases.step, {
        caseId, key: "complaint", label: source === "claude" ? t("Drafted your complaint", "Redactamos su queja") : t("Prepared your complaint from our standard template", "Preparamos su queja con nuestra plantilla estándar"),
        state: "done", detail: t("Recount never files it. You do, if you choose to.", "Recount nunca la presenta. Usted decide si la presenta."),
      });
    } finally {
      // Whatever failed above, the patient gets our standard complaint instead of "drafting" forever.
      if (!saved && tpl) {
        await ctx.runMutation(internal.followUp.saveComplaint, { id: caseId, letter: finish(tpl), source: "template" }).catch((e) => console.error("saveComplaint failed", e));
      }
    }
  },
});
