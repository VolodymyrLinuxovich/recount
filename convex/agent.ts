"use node";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { ParsedBill } from "./lib/bill";
import { checkBill, potentialSavings, type Finding } from "./lib/checks";
import type { Eligibility } from "./lib/eligibility";
import type { HospitalRef } from "./lib/hospital";
import { lawLine, resolveFilledBrackets, templateLetters, type Letter } from "./lib/letters";
import { type Lang, isLang, money, pick } from "./lib/lang";
import { KNOWN_HOSPITALS, SNAPSHOTS, policyFindingsFor, type PolicyFinding } from "./lib/reference";
import { SAMPLE_BILL } from "./lib/sample";
import { byKey, matchHospital, refFromIndex } from "./lib/statewide";

/** Registry address for a known SF hospital key (its HCAI slug is in KNOWN_HOSPITALS). */
function hcaiAddress(key: string): string | null {
  const k = KNOWN_HOSPITALS.find((h) => h.key === key);
  for (const slug of k?.hcai ?? []) {
    const h = byKey(slug);
    if (h?.address) return h.address;
  }
  return null;
}

const MODEL = "claude-opus-5-5";

const READ_PROMPT = `This is a hospital bill a patient photographed or uploaded. Transcribe it into the schema.
Rules:
- Copy codes, descriptions, dates and amounts exactly as printed. Never guess a CPT/HCPCS code that isn't printed; use null.
- If a number is blurry or cut off, put your best reading in the field AND add a short plain-English note to "unreadable" that a patient can understand (e.g. "The amount on the CT scan line is blurry"). Never use field names like hospitalAddress or insurancePaid in the notes.
- If you can't read the individual charges at all, return no lines rather than guessing.
- Payments and adjustments are positive numbers.
- If this is not a hospital or medical bill, return empty lines and say so in "unreadable".`;

async function step(ctx: ActionCtx, caseId: Id<"cases">, key: string, label: string, state: "running" | "done" | "warn" | "error", detail?: string) {
  await ctx.runMutation(internal.cases.step, { caseId, key, label, state, detail });
}

function hasClaude() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function readWithClaude(blob: Blob, mediaType: string, lang: Lang): Promise<ParsedBill> {
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
    output_config: { effort: "medium", format: betaZodOutputFormat(ParsedBill) },
    messages: [{ role: "user", content: [media, { type: "text", text: READ_PROMPT + (lang === "es" ? "\n- Write the notes in \"unreadable\" in Spanish (the patient reads Spanish). Keep everything else exactly as printed." : "") }] }],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined to read this file.");
  if (!res.parsed_output) throw new Error("Couldn't read the bill into a structured form.");
  return res.parsed_output;
}

/** The Actor's dataset item uses its own field names; turn it into our HospitalRef. */
function fromActor(item: Record<string, unknown>, key: string, fallbackName: string): HospitalRef {
  const mrf = item.mrf as HospitalRef["mrf"] | null;
  const fap = (item.fap ?? null) as (Omit<NonNullable<HospitalRef["fap"]>, "quotes"> & { quotes?: unknown[] }) | null;
  const quotes = (fap?.quotes ?? []).map((q) =>
    typeof q === "string" ? q : Array.isArray(q) ? String(q[q.length - 1]) : String((q as { text?: string }).text ?? ""),
  );
  return {
    key,
    name: (item.name as string) ?? (item.hospitalName as string) ?? fallbackName,
    source: "apify-live",
    fetchedAt: new Date().toISOString(),
    mrf: mrf ? { url: mrf.url, lastUpdated: mrf.lastUpdated ?? null, prices: mrf.prices ?? {} } : null,
    fap: fap
      ? {
          url: fap.url ?? null,
          freeCareMaxFplPct: fap.freeCareMaxFplPct ?? null,
          discountMaxFplPct: fap.discountMaxFplPct ?? null,
          quotes: quotes.filter(Boolean),
          phone: fap.phone ?? null,
          applicationUrl: fap.applicationUrl ?? null,
        }
      : null,
    warnings: (item.warnings as string[]) ?? [],
  };
}

type Known = (typeof KNOWN_HOSPITALS)[number];

/** Run the Apify Actor live for a known hospital and merge with the hand-checked snapshot. */
async function liveLookup(known: Known, codes: string[]): Promise<HospitalRef | null> {
  const token = process.env.APIFY_TOKEN;
  const actor = process.env.APIFY_ACTOR_ID;
  if (!token || !actor || !known.live) return null;
  // Apify REST API: run the Actor and get its dataset items in one call.
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=150`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ hospitalUrl: known.url, hospitalName: known.name, codes }),
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const items = (await res.json()) as unknown[];
  if (!items[0]) return null;
  const live = fromActor(items[0] as Record<string, unknown>, known.key, known.name);
  const snap = SNAPSHOTS[known.key] ?? null;
  const snapFap = snap?.fap ?? null;
  // Live rows can come from a different variant of a code (setting, modifier, per-unit vs per-line).
  // Our snapshot rows were checked by hand, so for any code both have, the snapshot wins.
  const prices = { ...(live.mrf?.prices ?? {}), ...(snap?.mrf?.prices ?? {}) };
  const merged = { ...live, mrf: live.mrf ? { ...live.mrf, prices } : snap?.mrf ?? null };
  return merged.fap?.freeCareMaxFplPct != null || !snapFap ? merged : { ...merged, fap: snapFap };
}

/**
 * Prices and policy for a known hospital. If we already hold checked data (a hand-checked
 * snapshot or an earlier live lookup), use it right away and refresh live in the background,
 * so the patient doesn't wait on a ~10 s crawl. Only with no saved data do we wait for the live run.
 */
const Amounts = z.object({
  charges: z.array(z.number()).describe("The charge on each listed line, in the same order, read again carefully"),
});

/**
 * Second, focused read of just the amounts. Used only when the lines we read don't add up to
 * the bill's printed total. We accept the new reading only if it then adds up exactly, so a
 * misread digit (a 6 read as a 4) gets fixed without guessing.
 */
async function recheckAmounts(blob: Blob, mediaType: string, bill: ParsedBill): Promise<number[] | null> {
  const client = new Anthropic();
  const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const media =
    mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: mediaType as "image/png" | "image/jpeg" | "image/webp", data } } as const);
  const listed = bill.lines.map((l, i) => `${i + 1}. code ${l.code ?? "-"} | ${l.description} | read as ${l.charge}`).join("\n");
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(Amounts) },
    messages: [{ role: "user", content: [media, { type: "text", text: `These lines were read from this bill, but they add up to ${bill.lines.reduce((a, l) => a + l.charge, 0).toFixed(2)} while the bill's printed total charges are ${bill.totalCharges}. Look closely at each line's charge on the image (watch for 6/4, 1/7, 3/8, 5/6 confusions) and return every line's charge, in order. Do not change the number of lines.\n${listed}` }] }],
  });
  const charges = res.parsed_output?.charges;
  if (!charges || charges.length !== bill.lines.length) return null;
  const sum = charges.reduce((a, b) => a + b, 0);
  return bill.totalCharges != null && Math.abs(sum - bill.totalCharges) <= 1 ? charges : null;
}

async function lookupHospital(ctx: ActionCtx, caseId: Id<"cases">, known: Known, lang: Lang, codes: string[]): Promise<HospitalRef | null> {
  const t = pick(lang);
  const cached = await ctx.runQuery(internal.cases.cachedHospital, { key: known.key });
  const saved = (cached?.data as HospitalRef | undefined) ?? SNAPSHOTS[known.key] ?? null;
  if (saved) {
    if (known.live) await ctx.scheduler.runAfter(0, internal.agent.refreshHospital, { key: known.key, codes });
    const live = saved.source === "apify-live";
    await step(ctx, caseId, "hospital",
      live
        ? t(`Using ${known.name}'s price file and policy (live lookup ${saved.fetchedAt.slice(0, 10)})`, `Usamos el archivo de precios y la política de ${known.name} (búsqueda en vivo ${saved.fetchedAt.slice(0, 10)})`)
        : t(`Using ${known.name}'s published prices and assistance policy`, `Usamos los precios publicados y la política de ayuda de ${known.name}`),
      "done",
      live
        ? t("Read from the hospital's own files by our Apify Actor; a fresh check runs in the background.", "Leído de los archivos del propio hospital por nuestro Actor de Apify; se hace una nueva revisión en segundo plano.")
        : t("Extracted from the hospital's published price file and assistance policy by our data pipeline; a live check runs in the background.", "Extraído del archivo de precios y la política publicados por el hospital; se hace una revisión en vivo en segundo plano."));
    return saved;
  }
  await step(ctx, caseId, "hospital", t(`Pulling ${known.name}'s published prices and assistance policy`, `Buscando los precios publicados y la política de ayuda de ${known.name}`), "running");
  try {
    const ref = await liveLookup(known, codes);
    if (ref) {
      await ctx.runMutation(internal.cases.saveHospital, { key: known.key, data: ref });
      await step(ctx, caseId, "hospital", t(`Read ${known.name}'s price file and policy live`, `Leímos en vivo el archivo de precios y la política de ${known.name}`), "done", ref.mrf?.url ?? undefined);
      return ref;
    }
  } catch (e) {
    await step(ctx, caseId, "hospital-live", t("Live lookup failed", "La búsqueda en vivo falló"), "warn", String(e).slice(0, 200));
  }
  await step(ctx, caseId, "hospital", t(`No price data for ${known.name} yet`, `Todavía no hay datos de precios de ${known.name}`), "warn");
  return null;
}

/** Background refresh of a hospital's live data (never blocks a patient). */
export const refreshHospital = internalAction({
  args: { key: v.string(), codes: v.array(v.string()) },
  handler: async (ctx, { key, codes }): Promise<void> => {
    const known = KNOWN_HOSPITALS.find((k) => k.key === key);
    if (!known) return;
    try {
      const ref = await liveLookup(known, codes);
      if (ref) await ctx.runMutation(internal.cases.saveHospital, { key, data: ref });
    } catch {
      // Keep the saved data; the next bill tries again.
    }
  },
});

/** Patient-facing warnings: only codes on this bill that the price file lacks. Crawl notes stay internal. */
function warningsForBill(ref: HospitalRef, bill: ParsedBill, lang: Lang): HospitalRef {
  const missing = [...new Set(bill.lines.map((l) => (l.code ?? "").toUpperCase()).filter((c) => c && ref.mrf && !ref.mrf.prices[c]))];
  const t = pick(lang);
  const warnings = missing.length
    ? [t(`Codes on this bill that aren't in the hospital's price file: ${missing.join(", ")}`, `Códigos de esta factura que no están en el archivo de precios del hospital: ${missing.join(", ")}`)]
    : [];
  return { ...ref, warnings };
}

/** Build the hospital reference for a resolved statewide key (or a known SF key). */
async function resolveRef(ctx: ActionCtx, caseId: Id<"cases">, key: string, bill: ParsedBill, lang: Lang): Promise<HospitalRef | null> {
  const t = pick(lang);
  const known = KNOWN_HOSPITALS.find((k) => k.key === key || k.hcai.includes(key));
  const codes = [...new Set(bill.lines.map((l) => (l.code ?? "").toUpperCase()).filter(Boolean))];
  if (known) {
    const ref = await lookupHospital(ctx, caseId, known, lang, codes);
    return ref ? warningsForBill(ref, bill, lang) : null;
  }
  const h = byKey(key);
  if (!h) return null;
  await step(ctx, caseId, "hospital", t(`Found ${h.name}'s financial assistance policy`, `Encontramos la política de asistencia financiera de ${h.name}`), "done",
    t("From the policies California hospitals file with the state (HCAI). We don't have this hospital's price file, so charges are not compared to its prices.",
      "De las políticas que los hospitales de California presentan al estado (HCAI). No tenemos el archivo de precios de este hospital, así que no comparamos los cargos con sus precios."));
  return refFromIndex(h);
}

/** Second half of the check, after the hospital is known (or the patient said it isn't listed). */
async function finishCheck(ctx: ActionCtx, caseId: Id<"cases">, bill: ParsedBill, key: string | null, lang: Lang): Promise<void> {
  const t = pick(lang);
  const hospital = key ? await resolveRef(ctx, caseId, key, bill, lang) : null;
  if (!key) {
    await step(ctx, caseId, "hospital", t("Hospital not identified", "Hospital no identificado"), "warn",
      t("We'll use California's rules only, without this hospital's own policy or prices.", "Usaremos solo las reglas de California, sin la política ni los precios de este hospital."));
  }
  const n = bill.lines.length;
  const priced = Boolean(hospital?.mrf);
  await step(ctx, caseId, "check",
    priced ? t(`Checking ${n} charges against the hospital's own prices`, `Comparando ${n} cargos con los precios del propio hospital`)
      : t(`Checking ${n} charges for repeats and totals`, `Revisando ${n} cargos para ver repeticiones y totales`), "running");
  const findings: Finding[] = checkBill(bill, hospital, lang);
  const total = potentialSavings(findings);
  const k = findings.length;
  await step(
    ctx,
    caseId,
    "check",
    k ? t(`Found ${k} thing${k === 1 ? "" : "s"} to question`, `Encontramos ${k} ${k === 1 ? "cosa" : "cosas"} para preguntar`) : t("No line-level problems found", "No encontramos problemas en las líneas"),
    "done",
    [
      total > 0 ? t(`Up to ${money(total)} in questionable charges.`, `Hasta ${money(total)} en cargos dudosos.`) : "",
      priced ? "" : t("We don't have this hospital's price list, so we couldn't check each charge against its prices.", "No tenemos la lista de precios de este hospital, así que no pudimos comparar cada cargo con sus precios."),
    ].filter(Boolean).join(" ") || undefined,
  );
  // What our statewide audit found in this hospital's own policy.
  const policyFindings = (hospital ? policyFindingsFor(hospital.key) : []).map((f) =>
    lang === "es" ? { ...f, explanationEn: f.explanation, explanation: lawLine(f.rule, "es") ?? f.explanation } : f,
  );
  if (policyFindings.length) {
    const n = (v: string) => policyFindings.filter((f) => f.verdict === v).length;
    const [bad, likely, ask] = [n("conflict"), n("likely"), n("ask")];
    const en = [
      bad ? `${bad} conflict${bad === 1 ? "" : "s"} with California law` : "",
      likely ? `${likely} likely conflict${likely === 1 ? "" : "s"}` : "",
      ask ? `${ask} worth asking about` : "",
    ].filter(Boolean).join(", ");
    const es = [
      bad ? `${bad} conflicto${bad === 1 ? "" : "s"} con la ley de California` : "",
      likely ? `${likely} posible${likely === 1 ? "" : "s"} conflicto${likely === 1 ? "" : "s"}` : "",
      ask ? `${ask} que vale preguntar` : "",
    ].filter(Boolean).join(", ");
    await step(ctx, caseId, "policy", t(`${hospital!.name}'s own policy: ${en}`, `Política de ${hospital!.name}: ${es}`),
      "warn", policyFindings.map((f) => `"${f.quote}"`).join(" "));
  }
  await ctx.runMutation(internal.cases.patch, {
    id: caseId,
    fields: { hospital, hospitalKey: key ?? undefined, findings, policyFindings, hospitalCandidates: undefined, status: "needs_household" },
  });
}

export const readAndCheck = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }): Promise<void> => {
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
          bill = await readWithClaude(blob, c.fileType ?? blob.type ?? "image/jpeg", lang);
          const sum = bill.lines.reduce((a, l) => a + l.charge, 0);
          if (bill.lines.length && bill.totalCharges != null && Math.abs(sum - bill.totalCharges) > 1) {
            await step(ctx, caseId, "read", t("Double-checking the amounts", "Revisando de nuevo los montos"), "running");
            const fixed = await recheckAmounts(blob, c.fileType ?? blob.type ?? "image/jpeg", bill).catch(() => null);
            if (fixed) {
              const changed = bill.lines.map((l, i) => (l.charge !== fixed[i] ? i : -1)).filter((i) => i >= 0);
              bill = { ...bill, lines: bill.lines.map((l, i) => ({ ...l, charge: fixed[i] })) };
              // Notes about misread amounts no longer apply once the lines add up.
              if (changed.length) bill = { ...bill, unreadable: bill.unreadable.filter((u) => !/total|sum|add up|amount|monto|suma/i.test(u)) };
            }
          }
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
      if (bill.lines.length === 0 && bill.isMedicalBill !== false && !/not a (hospital|medical)/i.test(bill.unreadable.join(" "))) {
        throw new Error(t("RETAKE: We couldn't read the charges on this photo. Please take a new photo in good light, flat and close enough to read.", "RETAKE: No pudimos leer los cargos en esta foto. Tome otra foto con buena luz, plana y de cerca."));
      }
      const addr = `${bill.hospitalAddress ?? ""}`;
      // Only a "…, ST 12345" or a trailing "…, ST" state code counts; street names like Washington Blvd don't.
      const stateMatch = addr.match(/,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$/) ?? addr.match(/,\s*([A-Z]{2})\s*$/);
      if (stateMatch && !/^(CA|California)$/i.test(stateMatch[1])) {
        throw new Error(t("OUT_OF_STATE: Recount covers California hospitals. This bill looks like it's from another state, where different rules apply.", "OUT_OF_STATE: Recount cubre hospitales de California. Esta factura parece ser de otro estado, donde aplican otras reglas."));
      }
      if (bill.isMedicalBill === false || (bill.lines.length === 0 && /not a (hospital|medical)/i.test(bill.unreadable.join(" ")))) {
        throw new Error(t("NOT_A_BILL: This is not a hospital or medical bill.", "NOT_A_BILL: Esto no es una factura de hospital ni médica (not a hospital or medical bill)."));
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

      // 2. Which hospital? Known SF hospitals first, then every California hospital on file.
      const known = KNOWN_HOSPITALS.find((h) => bill.hospitalName && h.match.test(bill.hospitalName));
      // A hint (e.g. the patient came from that hospital's audit page) settles an unclear match,
      // but never overrides a bill that clearly names a different hospital.
      const hint = c.hospitalHint && (byKey(c.hospitalHint) || KNOWN_HOSPITALS.some((k) => k.key === c.hospitalHint)) ? c.hospitalHint : null;
      if (known) {
        await finishCheck(ctx, caseId, bill, known.key, lang);
        return;
      }
      const m = matchHospital(bill.hospitalName, bill.hospitalAddress ?? null, bill.patientAddress ?? null);
      if (m.confident) {
        await finishCheck(ctx, caseId, bill, m.confident.key, lang);
        return;
      }
      if (hint && (!m.candidates.length || m.candidates.some((x) => x.key === hint))) {
        await finishCheck(ctx, caseId, bill, hint, lang);
        return;
      }
      if (m.candidates.length) {
        await step(ctx, caseId, "hospital", t("Which hospital is this?", "¿De qué hospital es esta factura?"), "warn",
          t(`We read "${bill.hospitalName ?? "?"}" on the bill. Please pick your hospital.`, `Leímos "${bill.hospitalName ?? "?"}" en la factura. Por favor elija su hospital.`));
        await ctx.runMutation(internal.cases.patch, { id: caseId, fields: { hospitalCandidates: m.candidates, status: "confirm_hospital" } });
        return;
      }
      await finishCheck(ctx, caseId, bill, null, lang);
    } catch (e) {
      await step(ctx, caseId, "error", t("Something went wrong", "Algo salió mal"), "error", String(e).slice(0, 300));
      await ctx.runMutation(internal.cases.patch, { id: caseId, fields: { status: "error", error: String(e).slice(0, 300) } });
    }
  },
});

/** Runs after the patient picks their hospital (key) or says it isn't listed (null). */
export const continueCheck = internalAction({
  args: { caseId: v.id("cases"), key: v.union(v.string(), v.null()) },
  handler: async (ctx, { caseId, key }): Promise<void> => {
    const c = await ctx.runQuery(internal.cases.load, { id: caseId });
    if (!c?.bill) return;
    const lang: Lang = isLang(c.lang) ? c.lang : "en";
    try {
      await finishCheck(ctx, caseId, c.bill as ParsedBill, key, lang);
    } catch (e) {
      await step(ctx, caseId, "error", pick(lang)("Something went wrong", "Algo salió mal"), "error", String(e).slice(0, 300));
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
- If "patientLanguage" is "es", also give a faithful Spanish translation of each letter: subjectPatient translates ONLY the subject line, bodyPatient translates the body. Otherwise set them to null.
Never say the patient qualifies or is eligible; ask the hospital to screen them. Rules: plain, polite, firm. Short sentences. No legal threats, no claims beyond the facts, no invented law, amounts, dates or names. Address the letter to the hospital's mailing address from the facts when it's given. Use [brackets] ONLY for values you don't know, as short placeholders with no colon and no value inside, like "[Your street address]" or "[Signature]". When a value is known (for example the patient's name from the bill), write it plainly, never inside brackets. Sign as the patient.`;

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
      hospital: hospitalRef
        ? {
            name: hospitalRef.name,
            policyUrl: hospitalRef.fap?.url ?? null,
            // Mailing address: the one printed on the bill, else the state registry's.
            address: bill.hospitalAddress ?? byKey(c.hospitalKey ?? "")?.address ?? hcaiAddress(hospitalRef.key),
          }
        : null,
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
        const kinds: ("assistance" | "dispute")[] = facts.findings.length ? ["assistance", "dispute"] : ["assistance"];
        // One call per letter, in parallel: about half the wait of writing both in one reply.
        const results = await Promise.all(
          kinds.map((kind) =>
            client.beta.messages.parse({
              model: MODEL,
              max_tokens: 8000,
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
              output_config: { effort: "low", format: betaZodOutputFormat(Letters) },
              messages: [{ role: "user", content: `${LETTER_PROMPT}\n\nWrite ONLY the "${kind}" letter (an array with exactly one letter).\n\n<facts>\n${JSON.stringify(forModel, null, 2)}\n</facts>` }],
            }),
          ),
        );
        const got = results.flatMap((res, i) =>
          res.stop_reason !== "refusal" && res.parsed_output?.letters?.[0] ? [{ ...res.parsed_output.letters[0], kind: kinds[i] }] : [],
        );
        if (got.length === kinds.length) {
          letters = got.map((l) => ({
            kind: l.kind,
            title: l.title,
            subject: l.subject,
            body: l.body,
            ...(lang === "es" && l.bodyPatient ? { subjectPatient: l.subjectPatient ?? undefined, bodyPatient: l.bodyPatient } : {}),
          }));
          lettersSource = "claude";
          if (lang === "es") {
            // Subjects are short and fixed; use our own Spanish wording so the model can't garble them.
            const fixed = templateLetters(facts, "es");
            letters = letters.map((l) => ({ ...l, subjectPatient: fixed.find((f) => f.kind === l.kind)?.subjectPatient ?? l.subjectPatient }));
          }
        }
      } catch (e) {
        await step(ctx, caseId, "letters", t("Model unavailable, used our standard letters", "El modelo no está disponible; usamos nuestras cartas estándar"), "warn", String(e).slice(0, 200));
      }
    }
    if (!letters) letters = templateLetters(facts, lang);
    letters = letters.map((l) => ({
      ...l,
      subject: resolveFilledBrackets(l.subject),
      body: resolveFilledBrackets(l.body),
      ...(l.bodyPatient ? { bodyPatient: resolveFilledBrackets(l.bodyPatient) } : {}),
    }));
    await ctx.runMutation(internal.cases.patch, { id: caseId, fields: { letters, lettersSource, status: "ready" } });
    await step(ctx, caseId, "letters",
      lettersSource === "claude" ? t("Drafted your letters", "Redactamos sus cartas") : t("Prepared your letters from our standard templates", "Preparamos sus cartas con nuestras plantillas estándar"),
      "done", t("Nothing is sent until you review and approve.", "No se envía nada hasta que usted lo revise y apruebe."));
  },
});
