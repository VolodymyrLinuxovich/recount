"use node";

import { filePart, modelReady, structured, type Run } from "./lib/model";
import type { Kind } from "./lib/pipeline";
import { inventedAmounts } from "./lib/letterCheck";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { ParsedBill } from "./lib/bill";
import { potentialSavings, type Finding } from "./lib/checks";
import { EobRead, fromEobRead, normalizeEobDates, ParsedEob } from "./lib/eob";
import { allFindings } from "./lib/eobChecks";
import type { Eligibility } from "./lib/eligibility";
import type { HospitalRef } from "./lib/hospital";
import { lawLine, letterKinds, letterPrompt, letterTitle, resolveFilledBrackets, templateLetters, type Letter } from "./lib/letters";
import { type Lang, isLang, money, pick } from "./lib/lang";
import { KNOWN_HOSPITALS, SNAPSHOTS, policyFindingsFor, type PolicyFinding } from "./lib/reference";
import { SAMPLE_BILL, SAMPLE_EOB } from "./lib/sample";
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

const READ_PROMPT = `This is a hospital bill a patient photographed or uploaded. Transcribe it into the schema.
Rules:
- Copy codes, descriptions, dates and amounts exactly as printed. Never guess a CPT/HCPCS code that isn't printed; use null.
- Each line's charge is the amount printed on that line, nothing else. Never adjust or recompute a line so the lines add up to the printed total: bills often contain arithmetic errors, and a total that doesn't match its lines is exactly what the patient needs us to find. Report the printed total as printed, too.
- If a number is blurry or cut off, put your best reading in the field AND add a short plain-English note to "unreadable" that a patient can understand (e.g. "The amount on the CT scan line is blurry"). Never use field names like hospitalAddress or insurancePaid in the notes.
- If you can't read the individual charges at all, return no lines rather than guessing.
- Payments and adjustments are positive numbers.
- If this is not a hospital or medical bill, return empty lines and say so in "unreadable".`;

async function step(ctx: ActionCtx, caseId: Id<"cases">, key: string, label: string, state: "running" | "done" | "warn" | "error", detail?: string, kind?: Kind) {
  await ctx.runMutation(internal.cases.step, { caseId, key, label, state, detail, kind });
}

/** Saves one model call's record on the case (provider, model, time, tokens; never the content). */
function recorder(ctx: ActionCtx, caseId: Id<"cases">) {
  return async (r: Run) => {
    await ctx.runMutation(internal.cases.recordRun, { caseId, ...r });
  };
}

/** "MARIA HERNANDEZ" -> "Maria Hernandez"; names already in mixed case are left alone. */
function niceName(name: string): string {
  if (name !== name.toUpperCase()) return name.trim();
  return name
    .toLowerCase()
    .replace(/(^|[\s'-])([a-zà-ÿ])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\bMc([a-z])/g, (_m, ch: string) => "Mc" + ch.toUpperCase())
    .trim();
}

async function readBill(blob: Blob, mediaType: string, lang: Lang, record: (r: Run) => Promise<void>): Promise<ParsedBill> {
  const res = await structured(
    {
      task: "read",
      parts: [await filePart(blob, mediaType), { type: "text", text: READ_PROMPT + (lang === "es" ? "\n- Write the notes in \"unreadable\" in Spanish (the patient reads Spanish). Keep everything else exactly as printed." : "") }],
      schema: ParsedBill,
      maxTokens: 16000,
    },
    record,
  );
  if (res.refused) throw new Error("The model declined to read this file.");
  if (!res.data) throw new Error("Couldn't read the bill into a structured form.");
  // The printed text is the source of truth for each amount: parse it ourselves instead of
  // trusting a number the model might have "fixed" to make the lines add up.
  const parsed = res.data;
  const bill = {
    ...parsed,
    lines: parsed.lines.map((l) => {
      const fromText = Number(String(l.chargePrinted ?? "").replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(fromText) && /\d/.test(l.chargePrinted ?? "") ? { ...l, charge: fromText } : l;
    }),
  };
  // Bills print names in capitals; letters read better as "Maria Hernandez".
  return { ...bill, patientName: bill.patientName ? niceName(bill.patientName) : null };
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
const ChargesColumn = z.object({
  charges: z.array(z.string()).describe("Each line item's charge exactly as printed, top to bottom"),
});

/**
 * A narrow second read: copy only the CHARGES column of the line-item table. Asked about nothing
 * else (no totals), it has no reason to "fix" a line so the lines add up, which full-bill reads
 * sometimes do. Returns amounts in line order, or null if it can't be used.
 */
async function readChargesColumn(blob: Blob, mediaType: string, record: (r: Run) => Promise<void>): Promise<number[] | null> {
  const res = await structured(
    {
      task: "column",
      parts: [await filePart(blob, mediaType), { type: "text", text: "Copy the CHARGES column of the itemized line table, top to bottom across all pages, exactly as printed, one string per line item. Only the line items: no totals, payments or amount due." }],
      schema: ChargesColumn,
      maxTokens: 4000,
    },
    record,
  );
  const raw = res.data?.charges;
  if (!raw) return null;
  const nums = raw.map((x) => Number(x.replace(/[^0-9.\-]/g, "")));
  return nums.every((n) => Number.isFinite(n)) ? nums : null;
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
  // An insurance statement the patient already added counts too (see lib/eobChecks.ts).
  const cur = await ctx.runQuery(internal.cases.load, { id: caseId });
  const eob = cur?.eobStatus === "done" ? ((cur.eob ?? null) as ParsedEob | null) : null;
  const findings: Finding[] = allFindings(bill, hospital, eob, lang);
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
      if (c.fileId && modelReady("read")) {
        const blob = await ctx.storage.get(c.fileId);
        if (!blob) throw new Error("Uploaded file is missing");
        try {
          // Two reads in parallel (no extra wait): the full bill, and a narrow copy of just the CHARGES
          // column. A full read sometimes "fixes" a line so the lines match the printed total, which
          // hides a real billing error; the narrow copy has no reason to. Where they disagree we use the
          // literal column copy AND show the patient both numbers to check against the paper bill.
          const type = c.fileType ?? blob.type ?? "image/jpeg";
          const [first, column] = await Promise.all([readBill(blob, type, lang, recorder(ctx, caseId)), readChargesColumn(blob, type, recorder(ctx, caseId)).catch(() => null)]);
          bill = first;
          if (column && column.length === first.lines.length) {
            const disagree = first.lines
              .map((l, i) => ({ index: i, first: column[i], second: l.charge }))
              .filter((x) => Math.abs(x.first - x.second) > 0.005);
            if (disagree.length) {
              bill = {
                ...bill,
                lines: first.lines.map((l, i) => ({ ...l, charge: column[i] })),
                amountChecks: disagree,
                unreadable: [
                  ...bill.unreadable,
                  ...disagree.map((x) =>
                    t(
                      `Line ${x.index + 1}: we read $${x.first.toFixed(2)}, but a second look read $${x.second.toFixed(2)}. Please check this amount on your bill.`,
                      `Línea ${x.index + 1}: leímos $${x.first.toFixed(2)}, pero una segunda lectura dio $${x.second.toFixed(2)}. Por favor revise este monto en su factura.`,
                    ),
                  ),
                ],
              } as ParsedBill;
            }
            await step(ctx, caseId, "compare-reads",
              disagree.length ? t("The two reads disagree on some amounts", "Las dos lecturas no coinciden en algunos montos") : t("Both reads agree on every amount", "Las dos lecturas coinciden en todos los montos"),
              disagree.length ? "warn" : "done");
          } else {
            await step(ctx, caseId, "compare-reads", t("Couldn't compare a second read; please check the amounts", "No pudimos comparar una segunda lectura; revise los montos"), "warn");
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
        billSource === "claude" ? "ai" : "rule",
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
      await ctx.runMutation(internal.cases.patch, { id: caseId, fields: { status: "error", error: patientError(e, t) } });
    }
  },
});

/** Our own errors (CODE: text) go to the patient as they are; anything else gets a plain message. */
function patientError(e: unknown, t: (en: string, es: string) => string): string {
  const raw = String(e).replace(/^Error:\s*/, "");
  if (/^[A-Z_]{4,}:/.test(raw)) return raw.slice(0, 300);
  if (/exceeds|too large|maximum/i.test(raw)) {
    return t("RETAKE: This file is too large for us to read. Please take a new photo, or send a smaller file.", "RETAKE: Este archivo es demasiado grande. Tome otra foto o envíe un archivo más pequeño.");
  }
  return t("Something went wrong while reading your bill. Please try again.", "Algo salió mal al leer su factura. Inténtelo de nuevo.");
}

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
      await ctx.runMutation(internal.cases.patch, { id: caseId, fields: { status: "error", error: patientError(e, pick(lang)) } });
    }
  },
});

const Letters = z.object({
  letters: z.array(
    z.object({
      kind: z.enum(["assistance", "dispute", "appeal"]),
      title: z.string(),
      subject: z.string(),
      body: z.string(),
      subjectPatient: z.string().nullable().describe("Spanish translation of subject for the patient, only if patientLanguage is es; else null"),
      bodyPatient: z.string().nullable().describe("Spanish translation of body for the patient, only if patientLanguage is es; else null"),
    }),
  ),
});


export const draftLetters = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const c = await ctx.runQuery(internal.cases.load, { id: caseId });
    if (!c?.bill || !c.eligibility) return;
    const lang: Lang = isLang(c.lang) ? c.lang : "en";
    const t = pick(lang);
    const bill = c.bill as ParsedBill;
    const hospitalRef = (c.hospital ?? null) as HospitalRef | null;
    const eob = c.eobStatus === "done" ? ((c.eob ?? null) as ParsedEob | null) : null;
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
      findingsEn: lang === "es" ? allFindings(bill, hospitalRef, eob, "en") : undefined,
      eob,
      policyFindings: (c.policyFindings ?? []) as PolicyFinding[],
      eligibility: c.eligibility as Eligibility,
      household: c.household,
    };
    await step(ctx, caseId, "letters", t("Writing your letters", "Escribiendo sus cartas"), "running");
    let letters: Letter[] | null = null;
    let lettersSource: "claude" | "template" = "template";
    if (modelReady("letters")) {
      try {
        const record = recorder(ctx, caseId);
        const forModel = { ...facts, findings: facts.findingsEn ?? facts.findings, findingsEn: undefined, patientLanguage: lang };
        const kinds = letterKinds(facts);
        // One call per letter, in parallel: about half the wait of writing both in one reply.
        const results = await Promise.all(
          kinds.map((kind) =>
            structured(
              {
                task: "letters",
                parts: [{ type: "text", text: `${letterPrompt(kind)}\n\n<facts>\n${JSON.stringify(forModel, null, 2)}\n</facts>` }],
                schema: Letters,
                maxTokens: 8000,
              },
              record,
            ),
          ),
        );
        const got = results.flatMap((res, i) =>
          !res.refused && res.data?.letters?.[0] ? [{ ...res.data.letters[0], kind: kinds[i] }] : [],
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
      ...(lang === "es" ? { title: letterTitle(l.kind, "es") } : {}),
    }));
    // Rule check: every dollar amount in the letters must come from the facts.
    const odd = inventedAmounts(letters.flatMap((l) => [l.subject, l.body]), { ...facts, findingsEn: facts.findingsEn ?? null });
    await step(ctx, caseId, "letters-check",
      odd.length
        ? t(`Please check these amounts in your letters against your bill: ${odd.map((n) => money(n)).join(", ")}`, `Revise estos montos de sus cartas contra su factura: ${odd.map((n) => money(n)).join(", ")}`)
        : t("Every dollar amount in your letters matches your bill and our checks", "Cada monto en dólares de sus cartas coincide con su factura y nuestras revisiones"),
      odd.length ? "warn" : "done");
    // An insurance statement added or removed while we wrote makes these letters stale; a newer run writes them.
    const now = await ctx.runQuery(internal.cases.load, { id: caseId });
    if (!now || now.status !== "drafting" || JSON.stringify(now.findings ?? []) !== JSON.stringify(c.findings ?? []) || (now.eobStatus === "done") !== (c.eobStatus === "done")) return;
    await ctx.runMutation(internal.cases.patch, { id: caseId, fields: { letters, lettersSource, status: "ready", ...(odd.length ? { letterFlags: odd } : { letterFlags: undefined }) } });
    await step(ctx, caseId, "letters",
      lettersSource === "claude" ? t("Drafted your letters", "Redactamos sus cartas") : t("Prepared your letters from our standard templates", "Preparamos sus cartas con nuestras plantillas estándar"),
      "done", t("Nothing is sent until you review and approve.", "No se envía nada hasta que usted lo revise y apruebe."), lettersSource === "claude" ? "ai" : "rule");
  },
});

const EOB_PROMPT = `This is an insurance Explanation of Benefits (EOB) a patient photographed or uploaded: the insurer's statement for a hospital claim. It is not a bill. Transcribe it into the schema.
Rules:
- If this is not an EOB (for example a hospital bill, a receipt or a letter), set isEob to false and leave the rest empty or null.
- Copy names, codes, dates and amounts exactly as printed. Never guess a code, a date or an amount that isn't printed: use null for a missing amount and "" for missing text. A blank cell in the table is missing, not $0, and never work it out from other cells.
- "patientOwes" and "totalPatientOwes" are what the EOB says the patient may owe the provider (often called "your responsibility", "you may owe" or "patient responsibility"). Copy them as printed; never compute them.
- "notCovered" is the amount the plan denied or did not cover on that line, 0 if none. Copy each remark or denial code with its text as printed.
- network: "in" only if the provider is marked in-network or participating, "out" only if marked out-of-network or non-participating, else "unknown".
- claimStatus: "pending" if the claim is still in process, "denied" if the whole claim was denied, "partly_denied" if some lines were denied, "processed" if it was paid or processed, else "unknown".
- Amounts are positive numbers in dollars.
- If a number is blurry or cut off, put your best reading in the field AND add a short plain note to "unreadable" that a patient can understand (e.g. "The amount you owe is blurry"). Never use field names in the notes.`;

async function readEobFile(blob: Blob, mediaType: string, lang: Lang, record: (r: Run) => Promise<void>): Promise<ParsedEob> {
  const res = await structured(
    {
      task: "read",
      parts: [await filePart(blob, mediaType), { type: "text", text: EOB_PROMPT + (lang === "es" ? "\n- Write the notes in \"unreadable\" in Spanish (the patient reads Spanish). Keep everything else exactly as printed." : "") }],
      schema: EobRead,
      maxTokens: 12000,
    },
    record,
  );
  if (res.refused) throw new Error("The model declined to read this file.");
  if (!res.data) throw new Error("Couldn't read the insurance statement into a structured form.");
  return normalizeEobDates(fromEobRead(res.data));
}

/** Read the patient's insurance statement (EOB), then compare it with the bill by rules. */
export const readEob = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }): Promise<void> => {
    const c = await ctx.runQuery(internal.cases.load, { id: caseId });
    if (!c || c.eobStatus !== "reading" || c.status === "approved") return;
    const lang: Lang = isLang(c.lang) ? c.lang : "en";
    const t = pick(lang);
    const fileId = c.eobFileId ?? null;
    const fail = async (code: string, label: string, detail?: string) => {
      await step(ctx, caseId, "eob-read", label, "warn", detail, "ai");
      await ctx.runMutation(internal.cases.eobFailed, { id: caseId, fileId: fileId ?? undefined, error: code });
    };
    await step(ctx, caseId, "eob-read", t("Reading your insurance statement", "Leyendo su estado del seguro"), "running", undefined, "ai");
    let eob: ParsedEob;
    let eobSource: "claude" | "sample-source" = "claude";
    if (fileId && modelReady("read")) {
      try {
        const blob = await ctx.storage.get(fileId);
        if (!blob) throw new Error("Uploaded file is missing");
        eob = await readEobFile(blob, c.eobFileType ?? blob.type ?? "image/jpeg", lang, recorder(ctx, caseId));
      } catch (e) {
        if (!c.sample) {
          const big = /exceeds|too large|maximum/i.test(String(e));
          await fail(big ? "TOO_LARGE" : "RETAKE",
            big ? t("This file is too large to read", "Este archivo es demasiado grande") : t("We couldn't read this insurance statement", "No pudimos leer este estado del seguro"),
            String(e).slice(0, 200));
          return;
        }
        eob = SAMPLE_EOB;
        eobSource = "sample-source";
        await step(ctx, caseId, "eob-read", t("Model unavailable, loaded the sample insurance statement's source data", "El modelo no está disponible; cargamos los datos del estado del seguro de ejemplo"), "warn", String(e).slice(0, 200), "rule");
      }
    } else if (c.sample) {
      eob = SAMPLE_EOB;
      eobSource = "sample-source";
    } else {
      await fail("NO_MODEL", t("Reading statements needs the model key on the server", "Para leer estados del seguro se necesita la clave del modelo en el servidor"));
      return;
    }
    if (!eob.isEob) {
      await fail("NOT_AN_EOB", t("This doesn't look like an insurance statement (EOB)", "Esto no parece un estado del seguro (EOB)"));
      return;
    }
    if (!eob.lines.length && eob.totalPatientOwes == null && eob.totalPlanPaid == null && eob.claimStatus !== "pending") {
      await fail("RETAKE", t("We couldn't read the amounts on this statement", "No pudimos leer los montos de este estado del seguro"));
      return;
    }
    const n = eob.lines.length;
    await step(ctx, caseId, "eob-read",
      eobSource === "claude"
        ? t(`Read ${n} line${n === 1 ? "" : "s"} from your insurance statement`, `Leímos ${n} línea${n === 1 ? "" : "s"} de su estado del seguro`)
        : t(`Loaded the sample insurance statement (${n} lines) from its source data`, `Cargamos el estado del seguro de ejemplo (${n} líneas) desde sus datos`),
      eob.unreadable.length ? "warn" : "done",
      eob.unreadable.length ? t(`Please double-check: ${eob.unreadable.join("; ")}`, `Por favor revise: ${eob.unreadable.join("; ")}`) : undefined,
      eobSource === "claude" ? "ai" : "rule");

    await step(ctx, caseId, "eob-check", t("Comparing your bill with your insurance statement", "Comparando su factura con su estado del seguro"), "running", undefined, "rule");
    const res = await ctx.runMutation(internal.cases.applyEob, { id: caseId, fileId: fileId ?? undefined, eob, eobSource });
    if (!res) {
      await step(ctx, caseId, "eob-check", t("Insurance statement not used", "No usamos el estado del seguro"), "warn",
        t("The bill changed while we read it (approved, or another statement was added).", "La factura cambió mientras lo leíamos (se aprobó o se agregó otro estado)."), "rule");
      return;
    }
    const k = res.eobFindings;
    await step(ctx, caseId, "eob-check",
      res.mismatch
        ? t("This statement may be for a different visit", "Este estado puede ser de otra visita")
        : k
          ? t(`Found ${k} thing${k === 1 ? "" : "s"} to question with your insurance statement`, `Encontramos ${k} ${k === 1 ? "cosa" : "cosas"} para preguntar con su estado del seguro`)
          : t("Your bill matches your insurance statement", "Su factura coincide con su estado del seguro"),
      res.mismatch ? "warn" : "done",
      [
        res.total > 0 ? t(`Up to ${money(res.total)} in questionable charges.`, `Hasta ${money(res.total)} en cargos dudosos.`) : "",
        res.redraft ? t("Rewriting your letters with it.", "Volvemos a escribir sus cartas con esto.") : "",
      ].filter(Boolean).join(" ") || undefined,
      "rule");
  },
});
