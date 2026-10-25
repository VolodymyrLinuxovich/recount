// Run the app's own reading pipeline and rules on the hard eval set.
//
//   npx tsx eval/hard/run.ts --set bills --env ../.env.local               # every hard bill
//   npx tsx eval/hard/run.ts --set eob --env ../.env.local --split dev     # bill + EOB pairs, dev split only
//   npx tsx eval/hard/run.ts --set bills --oracle                          # rules on the answer key, no API calls
//
// This is not a copy of the pipeline. It calls the same code the Convex action does: structured() in
// convex/lib/model.ts (model, effort, schema), the READ_PROMPT and EOB_PROMPT text taken from convex/agent.ts
// at run time, Document Intelligence through convex/lib/docIntel.ts (analyzeLayout, linesFromPages), the
// hospital match in convex/lib/reference.ts and statewide.ts, and the rules in checks.ts and eobChecks.ts.
// What it repeats by hand is the glue in readAndCheck (agent.ts): the two reads in parallel, the second read's
// time limit, the line-by-line comparison and the RETAKE / NOT_A_BILL / OUT_OF_STATE stops. Keep that in step.
//
// Writes, per case, into eval/out/<--out> (default hard-preds or hard-eob-preds):
//   <id>.parsed.json    the bill the app keeps        <id>.reads.json   both raw reads
//   <id>.findings.json  the app's findings            <id>.meta.json    outcome, hospital match, timings, tokens
//   <id>.eob.json       the EOB the app keeps (eob set), <id>.findings-truebill.json (rules on the true bill + read EOB)
// Document Intelligence results are cached in eval/out/hard-docintel/ so a rerun only calls Claude.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { structured, type Part, type Run } from "../../convex/lib/model";
import { analyzeLayout, docIntelOn, linesFromPages, type Table } from "../../convex/lib/docIntel";
import { pagesNote, inOrder } from "../../convex/lib/pages";
import { balanceOnly, ParsedBill } from "../../convex/lib/bill";
import { printedAmount } from "../../convex/lib/amount";
import { EobRead, fromEobRead, normalizeEobDates, type ParsedEob } from "../../convex/lib/eob";
import { allFindings } from "../../convex/lib/eobChecks";
import type { Finding } from "../../convex/lib/checks";
import type { HospitalRef } from "../../convex/lib/hospital";
import { KNOWN_HOSPITALS } from "../../convex/lib/reference";
import { matchHospital } from "../../convex/lib/statewide";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const EVAL_OUT = join(ROOT, "eval", "out");

const args = process.argv.slice(2);
const opt = (name: string, dflt?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const flag = (name: string) => args.includes(`--${name}`);
const set = opt("set", "bills") as "bills" | "eob";
const split = opt("split", "all");
const only = opt("only")?.split(",");
const oracle = flag("oracle");
const force = flag("force");
const jobs = Number(opt("j", "4"));
const src = join(EVAL_OUT, set === "bills" ? "hard" : "hard-eob");
// --out is a folder under eval/out (or an absolute path).
const out = resolve(EVAL_OUT, opt("out", set === "bills" ? "hard-preds" : "hard-eob-preds")!);
const cacheDir = join(EVAL_OUT, "hard-docintel");
// --reuse <folder under eval/out>: take Claude's full read from an earlier run's <id>.reads.json instead of
// calling Claude again (only valid while READ_PROMPT and the schema are unchanged).
const reuse = opt("reuse") ? resolve(EVAL_OUT, opt("reuse")!) : null;
// --docintel-only: fill the Document Intelligence cache one request at a time, waiting out 429s. No Claude calls.
const docintelOnly = flag("docintel-only");

// Keys from an env file, never printed. Only the three the pipeline needs; the file wins over the shell.
const envFile = opt("env");
if (envFile) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && ["ANTHROPIC_API_KEY", "AZURE_DOCINTEL_ENDPOINT", "AZURE_DOCINTEL_KEY"].includes(m[1])) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

// The prompts, read from agent.ts so the eval can't drift from the app.
const agentTs = readFileSync(join(ROOT, "convex", "agent.ts"), "utf8");
function prompt(name: string): string {
  const m = new RegExp(`const ${name}\\s*=\\s*\`((?:[^\`\\\\]|\\\\.)*)\``).exec(agentTs);
  if (!m || m[1].includes("${")) throw new Error(`${name} not found as a plain template literal in convex/agent.ts`);
  return m[1].replace(/\\`/g, "`").replace(/\\\\/g, "\\");
}
const READ_PROMPT = prompt("READ_PROMPT");
const EOB_PROMPT = prompt("EOB_PROMPT");
const COLUMN_READ_MS = Number(/const COLUMN_READ_MS = ([\d_]+)/.exec(agentTs)![1].replace(/_/g, ""));

type PageFile = { data: string; type: string; name: string };
type Truth = Record<string, any>;

const runs: Run[] = [];
const record = async (r: Run) => {
  runs.push(r);
};

function pageParts(pages: PageFile[]): Part[] {
  const file = (p: PageFile): Part => ({ type: "file", mediaType: p.type, data: p.data });
  if (pages.length === 1) return [file(pages[0])];
  return pages.flatMap((p, i) => [{ type: "text", text: `Page ${i + 1} of ${pages.length}:` } as Part, file(p)]);
}

/** readBill in agent.ts (English). */
async function readBill(pages: PageFile[], rec: (r: Run) => Promise<void>): Promise<ParsedBill> {
  const res = await structured({ task: "read", parts: [...pageParts(pages), { type: "text", text: READ_PROMPT + pagesNote(pages.length) }], schema: ParsedBill, maxTokens: 16000 }, rec);
  if (res.refused) throw new Error("The model declined to read this file.");
  if (!res.data) throw new Error("Couldn't read the bill into a structured form.");
  return {
    ...res.data,
    lines: res.data.lines.map((l) => {
      const fromText = printedAmount(l.chargePrinted);
      return fromText !== null ? { ...l, charge: fromText } : l;
    }),
  };
}

const ChargesColumn = z.object({ charges: z.array(z.string()).describe("Each line item's charge exactly as printed, top to bottom") });

/** readChargesColumn in agent.ts, with Document Intelligence results cached on disk. */
async function readColumn(id: string, pages: PageFile[], rec: (r: Run) => Promise<void>): Promise<{ charges: number[] | null; source: string; ms: number | null }> {
  if (docIntelOn()) {
    const cache = join(cacheDir, `${id}.json`);
    let tables: Table[][] | null = null;
    let ms: number | null = null;
    if (existsSync(cache)) ({ tables, ms } = JSON.parse(readFileSync(cache, "utf8")));
    else {
      const t0 = Date.now();
      try {
        tables = await inOrder(pages, 2, (p) => analyzeLayout(p.data));
        ms = Date.now() - t0;
        writeFileSync(cache, JSON.stringify({ tables, ms }));
      } catch (e) {
        console.error(`${id}: Document Intelligence failed: ${String(e).slice(0, 160)}`);
      }
    }
    if (tables) {
      const lines = linesFromPages(tables);
      if (lines.length) return { charges: lines.map((l) => l.charge), source: "docintel", ms };
    }
  }
  const t0 = Date.now();
  const res = await structured(
    {
      task: "column",
      parts: [
        ...pageParts(pages),
        { type: "text", text: "Copy the CHARGES column of the itemized line table, top to bottom across all pages, exactly as printed, one string per line item. Only the line items: no totals, payments or amount due." + (pages.length > 1 ? ` The ${pages.length} images are pages 1 to ${pages.length} of one bill, in order: go through them in that order.` : "") },
      ],
      schema: ChargesColumn,
      maxTokens: 4000,
    },
    rec,
  ).catch(() => null);
  const raw = res?.data?.charges;
  if (!raw) return { charges: null, source: "claude-column", ms: Date.now() - t0 };
  const nums = raw.map(printedAmount);
  return { charges: nums.every((n) => n !== null) ? (nums as number[]) : null, source: "claude-column", ms: Date.now() - t0 };
}

type Outcome = "ok" | "RETAKE" | "NOT_A_BILL" | "OUT_OF_STATE" | "ERROR";

/** readAndCheck step 1 in agent.ts: both reads, compare, the stops. */
async function readAndCheck(id: string, pages: PageFile[], rec: (r: Run) => Promise<void>) {
  const columnMs = Math.min(60_000, COLUMN_READ_MS + 8_000 * (pages.length - 1));
  const reused = reuse && existsSync(join(reuse, `${id}.reads.json`)) ? (JSON.parse(readFileSync(join(reuse, `${id}.reads.json`), "utf8")).full as ParsedBill) : null;
  const [first, column] = await Promise.all([reused ?? readBill(pages, rec), readColumn(id, pages, rec)]);
  const raw = { full: JSON.parse(JSON.stringify(first)), column };
  // The app gives the second read columnMs; a cached Document Intelligence time stands in for the live one.
  const col = column.ms !== null && column.ms > columnMs ? null : column.charges;
  let bill: ParsedBill = first;
  let compare = "no second read";
  if (col && col.length === first.lines.length) {
    const disagree = first.lines.map((l, i) => ({ index: i, first: l.charge, second: col[i] })).filter((x) => Math.abs(x.first - x.second) > 0.005);
    compare = disagree.length ? `disagree on ${disagree.length}` : "agree";
    if (disagree.length) {
      bill = {
        ...bill,
        amountChecks: disagree,
        unreadable: [...bill.unreadable, ...disagree.map((x) => `Line ${x.index + 1}: we read $${x.first.toFixed(2)}, but a second look read $${x.second.toFixed(2)}. Please check this amount on your bill.`)],
      } as ParsedBill;
    }
  } else if (col) compare = `line count differs (${first.lines.length} vs ${col.length})`;
  let outcome: Outcome = "ok";
  if (bill.lines.length === 0 && bill.isMedicalBill !== false && !balanceOnly(bill) && !/not a (hospital|medical)/i.test(bill.unreadable.join(" "))) outcome = "RETAKE";
  const addr = `${bill.hospitalAddress ?? ""}`;
  const st = addr.match(/,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$/) ?? addr.match(/,\s*([A-Z]{2})\s*$/);
  if (outcome === "ok" && st && !/^(CA|California)$/i.test(st[1])) outcome = "OUT_OF_STATE";
  if (outcome === "ok" && (bill.isMedicalBill === false || (bill.lines.length === 0 && /not a (hospital|medical)/i.test(bill.unreadable.join(" "))))) outcome = "NOT_A_BILL";
  return { bill, raw, outcome, compare, secondRead: column.source };
}

// The eval's hospital keys and the app's.
const APP_KEY: Record<string, string> = { zsfg: "zsfg", ucsf: "ucsf", cpmc: "cpmc", stfrancis: "saintfrancis" };

/** The hospital step in readAndCheck: a known SF hospital, else a confident statewide match, else the patient picks. */
function hospitalFor(bill: ParsedBill, truthKey: string): { how: string; ref: HospitalRef | null } {
  const refOf = (k: string) => JSON.parse(readFileSync(join(EVAL_OUT, "hard", "refs", `${k}.json`), "utf8")) as HospitalRef;
  const known = KNOWN_HOSPITALS.find((h) => bill.hospitalName && h.match.test(bill.hospitalName));
  if (known) {
    const k = Object.entries(APP_KEY).find(([, v]) => v === known.key)?.[0];
    return { how: k === truthKey ? "known" : `known:${known.key} (wrong)`, ref: k ? refOf(k) : null };
  }
  const m = matchHospital(bill.hospitalName, bill.hospitalAddress ?? null, bill.patientAddress ?? null);
  const truthHcai = KNOWN_HOSPITALS.find((h) => h.key === APP_KEY[truthKey])?.hcai ?? [];
  if (m.confident) return truthHcai.includes(m.confident.key) ? { how: "statewide", ref: refOf(truthKey) } : { how: `statewide:${m.confident.key} (wrong)`, ref: null };
  if (m.candidates.length) return { how: "patient picks", ref: refOf(truthKey) };
  return { how: "not found", ref: null };
}

function loadPages(dir: string, files: string[]): PageFile[] {
  return files.map((f) => ({
    name: f,
    data: readFileSync(join(dir, f)).toString("base64"),
    type: f.endsWith(".pdf") ? "application/pdf" : f.endsWith(".png") ? "image/png" : "image/jpeg",
  }));
}

/** readEobFile in agent.ts plus the stops in readEob. */
async function readEob(file: PageFile, rec: (r: Run) => Promise<void>): Promise<{ eob: ParsedEob | null; outcome: string }> {
  const res = await structured({ task: "read", parts: [{ type: "file", mediaType: file.type, data: file.data }, { type: "text", text: EOB_PROMPT }], schema: EobRead, maxTokens: 12000 }, rec);
  if (res.refused || !res.data) return { eob: null, outcome: "RETAKE" };
  const eob = normalizeEobDates(fromEobRead(res.data));
  if (!eob.isEob) return { eob, outcome: "NOT_AN_EOB" };
  if (!eob.lines.length && eob.totalPatientOwes == null && eob.totalPlanPaid == null && eob.claimStatus !== "pending") return { eob, outcome: "RETAKE" };
  return { eob, outcome: "ok" };
}

const save = (name: string, data: unknown) => writeFileSync(join(out, name), JSON.stringify(data, null, 1));
const brief = (f: Finding[]) => f.map((x) => ({ id: x.id, kind: x.kind, lines: x.lines, amount: x.amount, confidence: x.confidence }));

async function oneBill(t: Truth) {
  const files = t.files.pdf ? [t.files.pdf] : t.files.pages;
  const t0 = Date.now();
  const mine: Run[] = [];
  const rec = async (r: Run) => {
    mine.push(r);
    await record(r);
  };
  const { bill, raw, outcome, compare, secondRead } = await readAndCheck(t.id, loadPages(src, files), rec);
  const hosp = hospitalFor(bill, t.hospitalKey);
  const findings = outcome === "ok" ? allFindings(bill, hosp.ref, null) : [];
  save(`${t.id}.parsed.json`, bill);
  save(`${t.id}.reads.json`, raw);
  save(`${t.id}.findings.json`, brief(findings));
  save(`${t.id}.meta.json`, { outcome, compare, secondRead, hospital: hosp.how, seconds: Math.round((Date.now() - t0) / 100) / 10, runs: mine });
  return `${t.id}: ${outcome} ${bill.lines.length}/${t.bill.lines.length} lines, reads ${compare}, hospital ${hosp.how}, ${findings.filter((f) => f.kind !== "CASH_PRICE_GAP").map((f) => f.kind).join(" ") || "no findings"}`;
}

async function onePair(t: Truth) {
  const t0 = Date.now();
  const mine: Run[] = [];
  const rec = async (r: Run) => {
    mine.push(r);
    await record(r);
  };
  // With --reuse, an earlier run's EOB read is used as it was kept (EOB_PROMPT and the schema must be unchanged).
  const reusedEob = reuse && existsSync(join(reuse, `${t.id}.eob.json`)) ? (JSON.parse(readFileSync(join(reuse, `${t.id}.eob.json`), "utf8")) as ParsedEob | null) : undefined;
  const eobRead = reusedEob !== undefined
    ? Promise.resolve({ eob: reusedEob, outcome: (JSON.parse(readFileSync(join(reuse!, `${t.id}.meta.json`), "utf8")).eobOutcome as string) ?? "ok" })
    : readEob(loadPages(src, [t.files.eob])[0], rec);
  const [b, e] = await Promise.all([readAndCheck(t.id, loadPages(src, [t.files.bill]), rec), eobRead]);
  const hosp = hospitalFor(b.bill, t.hospitalKey);
  const eob = e.outcome === "ok" ? e.eob : null;
  const findings = b.outcome === "ok" ? allFindings(b.bill, hosp.ref, eob) : [];
  const trueBill = allFindings(t.bill, hosp.ref, eob);
  save(`${t.id}.parsed.json`, b.bill);
  save(`${t.id}.reads.json`, b.raw);
  save(`${t.id}.eob.json`, e.eob);
  save(`${t.id}.findings.json`, brief(findings));
  save(`${t.id}.findings-truebill.json`, brief(trueBill));
  save(`${t.id}.meta.json`, { outcome: b.outcome, eobOutcome: e.outcome, compare: b.compare, secondRead: b.secondRead, hospital: hosp.how, seconds: Math.round((Date.now() - t0) / 100) / 10, runs: mine });
  const ks = (f: Finding[]) => f.filter((x) => x.kind !== "CASH_PRICE_GAP").map((x) => `${x.kind} ${x.amount}`).join(", ") || "none";
  return `${t.id}: bill ${b.outcome}, eob ${e.outcome}; findings ${ks(findings)} | want ${t.expect.map((x: any) => `${x.kind} ${x.amount}`).join(", ") || "none"}`;
}

function runOracle(truths: Truth[]) {
  let bad = 0;
  for (const t of truths) {
    const refPath = set === "bills" ? join(src, t.ref) : join(src, t.ref);
    const ref = JSON.parse(readFileSync(refPath, "utf8")) as HospitalRef;
    const got = allFindings(t.bill, ref, set === "eob" ? t.eob : null).filter((f) => f.kind !== "CASH_PRICE_GAP");
    const want = set === "bills" ? t.errors.map((e: any) => e.kind) : t.expect.map((e: any) => e.kind);
    const g = got.map((f) => f.kind).sort().join(",");
    const w = [...want].sort().join(",");
    let ok = g === w;
    if (ok && set === "eob") {
      ok = t.expect.every((x: any) => got.some((f) => f.kind === x.kind && Math.abs(f.amount - x.amount) < 0.005));
    }
    if (!ok) {
      bad++;
      console.log(`${t.id}: app rules find [${got.map((f) => `${f.kind} ${f.amount}`).join(", ")}], answer key [${set === "bills" ? w : t.expect.map((x: any) => `${x.kind} ${x.amount}`).join(", ")}]`);
    }
  }
  console.log(`oracle: ${truths.length - bad}/${truths.length} cases where the app's rules on the answer key give exactly the planted findings`);
  if (bad) process.exitCode = 1;
}

async function prefetch(truths: Truth[]) {
  mkdirSync(cacheDir, { recursive: true });
  for (const t of truths) {
    const cache = join(cacheDir, `${t.id}.json`);
    if (existsSync(cache)) continue;
    const files = set === "eob" ? [t.files.bill] : t.files.pdf ? [t.files.pdf] : t.files.pages;
    const tables: Table[][] = [];
    let ms = 0;
    for (const p of loadPages(src, files)) {
      for (let attempt = 0; ; attempt++) {
        const t0 = Date.now();
        try {
          tables.push(await analyzeLayout(p.data, 60_000));
          ms += Date.now() - t0;
          break;
        } catch (e) {
          if (!/429|timed out/.test(String(e)) || attempt > 8) throw e;
          await new Promise((r) => setTimeout(r, 15_000));
        }
      }
    }
    // Pages are timed one after another here; the app reads two at a time, so this overstates multi-page times a little.
    writeFileSync(cache, JSON.stringify({ tables, ms }));
    console.log(`${t.id}: ${tables.map((x) => x.length).join("+")} tables, ${(ms / 1000).toFixed(1)} s`);
  }
}

async function main() {
  const truths: Truth[] = readdirSync(src)
    .filter((f) => f.endsWith(".truth.json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(src, f), "utf8")))
    .filter((t) => (split === "all" || t.split === split) && (!only || only.includes(t.id)));
  if (oracle) return runOracle(truths);
  if (docintelOnly) return prefetch(truths);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set (pass --env <file>)");
  console.log(`second read: ${docIntelOn() ? "Azure AI Document Intelligence" : "Claude column read"}; ${truths.length} cases`);
  mkdirSync(out, { recursive: true });
  mkdirSync(cacheDir, { recursive: true });
  // --cached-only: only cases whose Document Intelligence result is already cached (no Azure calls).
  const todo = truths.filter((t) => (force || !existsSync(join(out, `${t.id}.meta.json`))) && (!flag("cached-only") || existsSync(join(cacheDir, `${t.id}.json`))));
  await inOrder(todo, jobs, async (t) => {
    try {
      console.log(await (set === "bills" ? oneBill(t) : onePair(t)));
    } catch (e) {
      console.log(`${t.id}: FAILED ${String(e).slice(0, 200)}`);
      save(`${t.id}.meta.json`, { outcome: "ERROR", error: String(e).slice(0, 300) });
    }
  });
  const tin = runs.reduce((a, r) => a + (r.inputTokens ?? 0), 0);
  const tout = runs.reduce((a, r) => a + (r.outputTokens ?? 0), 0);
  console.log(`${runs.filter((r) => r.provider === "anthropic").length} Claude calls, ${tin} input + ${tout} output tokens`);
}

main();
