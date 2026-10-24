"use node";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ApifyClient } from "apify-client";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { ParsedBill } from "./lib/bill";
import { checkBill, potentialSavings, type Finding } from "./lib/checks";
import type { Eligibility } from "./lib/eligibility";
import type { HospitalRef } from "./lib/hospital";
import { lawLine, templateLetters, type Letter } from "./lib/letters";
import { type Lang, isLang, pick } from "./lib/lang";
import { KNOWN_HOSPITALS, SNAPSHOTS, policyFindingsFor, type PolicyFinding } from "./lib/reference";
import { SAMPLE_BILL } from "./lib/sample";

const MODEL = "claude-opus-5-5";

const READ_PROMPT = `This is a hospital bill a patient photographed or uploaded. Transcribe it into the schema.
Rules:
- Copy codes, descriptions, dates and amounts exactly as printed. Never guess a CPT/HCPCS code that isn't printed; use null.
- If a number is blurry or cut off, put your best reading in the field AND name that field in "unreadable".
- Payments and adjustments are positive numbers.
- If this is not a hospital or medical bill, return empty lines and say so in "unreadable".`;

async function step(ctx: ActionCtx, caseId: Id<"cases">, key: string, label: string, state: "running" | "done" | "warn" | "error", detail?: string) {
  await ctx.runMutation(internal.cases.step, { caseId, key, label, state, detail });
}

function hasClaude() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function readWithClaude(blob: Blob, mediaType: string): Promise<ParsedBill> {
  const client = new Anthropic();
  const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const media =
    mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: mediaType as "image/png" | "image/jpeg" | "image/webp", data } } as const);
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(ParsedBill) },
    messages: [{ role: "user", content: [media, { type: "text", text: READ_PROMPT }] }],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined to read this file.");
  if (!res.parsed_output) throw new Error("Couldn't read the bill into a structured form.");
  return res.parsed_output;
}

async function lookupHospital(ctx: ActionCtx, caseId: Id<"cases">, name: string | null, lang: Lang): Promise<HospitalRef | null> {
  const t = pick(lang);
  const known = KNOWN_HOSPITALS.find((h) => name && h.match.test(name));
  if (!known) {
    await step(ctx, caseId, "hospital", t("Couldn't match the hospital", "No pudimos identificar el hospital"), "warn",
      t(`We don't have "${name ?? "unknown"}" yet, so we'll skip the price check.`, `Todavía no tenemos "${name ?? "desconocido"}", así que no revisaremos los precios.`));
    return null;
  }
  await step(ctx, caseId, "hospital", t(`Pulling ${known.name}'s published prices and assistance policy`, `Buscando los precios publicados y la política de ayuda de ${known.name}`), "running");
  const token = process.env.APIFY_TOKEN;
  const actor = process.env.APIFY_ACTOR_ID;
  if (token && actor) {
    try {
      const client = new ApifyClient({ token });
      const run = await client.actor(actor).call({ hospitalUrl: known.url, hospitalName: known.name }, { waitSecs: 180 });
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      if (items[0]) {
        const ref = { ...(items[0] as unknown as HospitalRef), key: known.key, source: "apify-live" as const, fetchedAt: new Date().toISOString() };
        await ctx.runMutation(internal.cases.saveHospital, { key: known.key, data: ref });
        await step(ctx, caseId, "hospital", t(`Read ${known.name}'s price file and policy live`, `Leímos en vivo el archivo de precios y la política de ${known.name}`), "done", ref.mrf?.url ?? undefined);
        return ref;
      }
    } catch (e) {
      await step(ctx, caseId, "hospital", t("Live lookup failed, using our last saved run", "La búsqueda en vivo falló; usamos la última búsqueda guardada"), "warn", String(e).slice(0, 200));
    }
  }
  const cached = await ctx.runQuery(internal.cases.cachedHospital, { key: known.key });
  const snap = (cached?.data as HospitalRef | undefined) ?? SNAPSHOTS[known.key] ?? null;
  if (!snap) {
    await step(ctx, caseId, "hospital", t(`No price data for ${known.name} yet`, `Todavía no hay datos de precios de ${known.name}`), "warn");
    return null;
  }
  await step(ctx, caseId, "hospital",
    t(`Using a saved lookup of ${known.name} (${snap.fetchedAt.slice(0, 10)})`, `Usamos una búsqueda guardada de ${known.name} (${snap.fetchedAt.slice(0, 10)})`), "done",
    t("Saved run of the same Apify Actor, not fetched just now.", "Resultado guardado del mismo Actor de Apify, no buscado ahora mismo."));
  return snap;
}

/** Keep only warnings about codes that are actually on this bill. */
function warningsForBill(ref: HospitalRef, bill: ParsedBill): HospitalRef {
  const onBill = new Set(bill.lines.map((l) => (l.code ?? "").toUpperCase()));
  const missing = bill.lines.map((l) => (l.code ?? "").toUpperCase()).filter((c) => c && ref.mrf && !ref.mrf.prices[c]);
  const warnings = ref.warnings.filter((w) => !w.startsWith("Codes not in the price file"));
  if (missing.length) warnings.push(`Codes on this bill that aren't in the price file: ${[...new Set(missing)].join(", ")}`);
  void onBill;
  return { ...ref, warnings };
}

export const readAndCheck = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.runQuery(internal.cases.load, { id: caseId });
    if (!c) return;
    const lang: Lang = isLang(c.lang) ? c.lang : "en";
    const t = pick(lang);
    try {
      // 1. Read the bill.
      await step(ctx, caseId, "read", t("Reading your bill", "Leyendo su factura"), "running");
      let bill: ParsedBill;
      let billSource: "claude" | "sample-source" = "claude";
      if (c.fileId && hasClaude()) {
        const blob = await ctx.storage.get(c.fileId);
        if (!blob) throw new Error("Uploaded file is missing");
        try {
          bill = await readWithClaude(blob, c.fileType ?? blob.type ?? "image/jpeg");
        } catch (e) {
          if (!c.sample) throw e;
          bill = SAMPLE_BILL;
          billSource = "sample-source";
          await step(ctx, caseId, "read", t("Model unavailable, loaded the sample bill's source data", "El modelo no está disponible; cargamos los datos de la factura de ejemplo"), "warn", String(e).slice(0, 200));
        }
      } else if (c.sample) {
        bill = SAMPLE_BILL;
        billSource = "sample-source";
      } else {
        throw new Error(t("Reading photos needs the Claude API key on the server.", "Para leer fotos se necesita la clave de Claude en el servidor."));
      }
      const n = bill.lines.length;
      await step(
        ctx,
        caseId,
        "read",
        billSource === "claude"
          ? t(`Read ${n} line${n === 1 ? "" : "s"} from your bill`, `Leímos ${n} línea${n === 1 ? "" : "s"} de su factura`)
          : t(`Loaded the sample bill (${n} lines) from its source data`, `Cargamos la factura de ejemplo (${n} líneas) desde sus datos`),
        bill.unreadable.length ? "warn" : "done",
        bill.unreadable.length ? t(`Please double-check: ${bill.unreadable.join("; ")}`, `Por favor revise: ${bill.unreadable.join("; ")}`) : undefined,
      );
      await ctx.runMutation(internal.cases.patch, { id: caseId, fields: { bill, billSource } });

      // 2. Look up the hospital's own published numbers.
      const found = await lookupHospital(ctx, caseId, bill.hospitalName, lang);
      const hospital = found ? warningsForBill(found, bill) : null;

      // 3. Check every line (rules, no model).
      await step(ctx, caseId, "check", t(`Checking ${n} charges against the hospital's own prices`, `Comparando ${n} cargos con los precios del propio hospital`), "running");
      const findings: Finding[] = checkBill(bill, hospital, lang);
      const total = potentialSavings(findings);
      const k = findings.length;
      await step(
        ctx,
        caseId,
        "check",
        k ? t(`Found ${k} thing${k === 1 ? "" : "s"} to question`, `Encontramos ${k} ${k === 1 ? "cosa" : "cosas"} para preguntar`) : t("No line-level problems found", "No encontramos problemas en las líneas"),
        "done",
        total > 0 ? t(`Up to $${total.toFixed(2)} in questionable charges`, `Hasta $${total.toFixed(2)} en cargos dudosos`) : undefined,
      );

      // 4. What our statewide audit found in this hospital's own policy.
      const policyFindings = (hospital ? policyFindingsFor(hospital.key) : []).map((f) =>
        lang === "es" ? { ...f, explanationEn: f.explanation, explanation: lawLine(f.rule, "es") ?? f.explanation } : f,
      );
      if (policyFindings.length) {
        const m = policyFindings.length;
        await step(ctx, caseId, "policy",
          t(`${hospital!.name}'s own policy has ${m} problem${m === 1 ? "" : "s"} under California law`, `La propia política de ${hospital!.name} tiene ${m} problema${m === 1 ? "" : "s"} según la ley de California`),
          "warn", policyFindings.map((f) => `"${f.quote}"`).join(" "));
      }
      await ctx.runMutation(internal.cases.patch, { id: caseId, fields: { hospital, findings, policyFindings, status: "needs_household" } });
    } catch (e) {
      await step(ctx, caseId, "error", t("Something went wrong", "Algo salió mal"), "error", String(e).slice(0, 300));
      await ctx.runMutation(internal.cases.patch, { id: caseId, fields: { status: "error", error: String(e).slice(0, 300) } });
    }
  },
});

const Letters = z.object({
  letters: z.array(
    z.object({
      kind: z.enum(["assistance", "dispute"]),
      title: z.string(),
      subject: z.string(),
      body: z.string(),
      subjectPatient: z.string().nullable().describe("Spanish translation of subject for the patient, only if patientLanguage is es; else null"),
      bodyPatient: z.string().nullable().describe("Spanish translation of body for the patient, only if patientLanguage is es; else null"),
    }),
  ),
});

const LETTER_PROMPT = `Write the letters a patient will send to a hospital billing office, using ONLY the facts in the JSON below.
- Letters to the hospital are always in English.
- "assistance": a request for financial assistance (charity care / discount payment) under the hospital's policy and California Health & Safety Code 127400-127446. Ask them to screen the patient, to send the application if one is needed, and to hold the account from collections while it is reviewed.
- If "policyFindings" lists parts of the hospital's own policy that conflict with California law, mention them in the assistance letter politely: quote the policy and the law, and ask the hospital to apply the law.
- "dispute": only if there are findings. Ask for an itemized bill if it's a summary bill, and list each finding with the exact amounts and the published number it's based on.
- If "patientLanguage" is "es", also give a faithful Spanish translation of each letter in subjectPatient/bodyPatient so the patient understands what they sign. Otherwise set them to null.
Rules: plain, polite, firm. Short sentences. No legal threats, no claims beyond the facts, no invented law, amounts, dates or names. Use [brackets] for anything the patient must fill in (signature, address). Sign as the patient.`;

export const draftLetters = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.runQuery(internal.cases.load, { id: caseId });
    if (!c?.bill || !c.eligibility) return;
    const lang: Lang = isLang(c.lang) ? c.lang : "en";
    const t = pick(lang);
    const bill = c.bill as ParsedBill;
    const hospitalRef = (c.hospital ?? null) as HospitalRef | null;
    const facts = {
      bill,
      hospital: hospitalRef ? { name: hospitalRef.name, policyUrl: hospitalRef.fap?.url ?? null } : null,
      findings: (c.findings ?? []) as Finding[],
      // The hospital letter quotes findings in English even when the patient reads Spanish.
      findingsEn: lang === "es" ? checkBill(bill, hospitalRef, "en") : undefined,
      policyFindings: (c.policyFindings ?? []) as PolicyFinding[],
      eligibility: c.eligibility as Eligibility,
      household: c.household,
    };
    await step(ctx, caseId, "letters", t("Writing your letters", "Escribiendo sus cartas"), "running");
    let letters: Letter[] | null = null;
    let lettersSource: "claude" | "template" = "template";
    if (hasClaude()) {
      try {
        const client = new Anthropic();
        const forModel = { ...facts, findings: facts.findingsEn ?? facts.findings, findingsEn: undefined, patientLanguage: lang };
        const res = await client.beta.messages.parse({
          model: MODEL,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium", format: betaZodOutputFormat(Letters) },
          messages: [{ role: "user", content: `${LETTER_PROMPT}\n\n<facts>\n${JSON.stringify(forModel, null, 2)}\n</facts>` }],
        });
        if (res.stop_reason !== "refusal" && res.parsed_output) {
          letters = res.parsed_output.letters.map((l) => ({
            kind: l.kind,
            title: l.title,
            subject: l.subject,
            body: l.body,
            ...(lang === "es" && l.bodyPatient ? { subjectPatient: l.subjectPatient ?? undefined, bodyPatient: l.bodyPatient } : {}),
          }));
          lettersSource = "claude";
        }
      } catch (e) {
        await step(ctx, caseId, "letters", t("Model unavailable, used our standard letters", "El modelo no está disponible; usamos nuestras cartas estándar"), "warn", String(e).slice(0, 200));
      }
    }
    if (!letters) letters = templateLetters(facts, lang);
    await ctx.runMutation(internal.cases.patch, { id: caseId, fields: { letters, lettersSource, status: "ready" } });
    await step(ctx, caseId, "letters",
      lettersSource === "claude" ? t("Drafted your letters", "Redactamos sus cartas") : t("Prepared your letters from our standard templates", "Preparamos sus cartas con nuestras plantillas estándar"),
      "done", t("Nothing is sent until you review and approve.", "No se envía nada hasta que usted lo revise y apruebe."));
  },
});
