#!/usr/bin/env node
// Preflight: checks the live app end to end, the way a judge's phone uses it.
// Run before a demo:   node scripts/preflight.mjs
// Other targets:       SITE=http://localhost:3000 CONVEX_URL=https://<deployment>.convex.cloud node scripts/preflight.mjs
// Skip the AI chat:    NO_CHAT=1 node scripts/preflight.mjs
// Browser walk:        runs when Playwright is installed (npm i -g playwright, or PW_DIR=<folder with node_modules/playwright>).
//
// Every test case it creates is deleted at the end. It uses only public functions, no keys.
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { createRequire } from "node:module";
import path from "node:path";

const SITE = (process.env.SITE ?? "https://recount-nu.vercel.app").replace(/\/$/, "");
const CONVEX_URL = process.env.CONVEX_URL ?? "https://zealous-grouse-384.convex.cloud";
const api = anyApi;
const cx = new ConvexHttpClient(CONVEX_URL);

const results = [];
const made = [];
const t0 = Date.now();
const secs = (t) => ((Date.now() - t) / 1000).toFixed(1) + "s";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (state, name, detail = "") => {
  results.push({ state, name });
  const mark = state === "pass" ? "PASS" : state === "warn" ? "WARN" : "FAIL";
  console.log(`${mark}  ${name}${detail ? "  " + detail : ""}`);
};

async function check(name, fn) {
  const t = Date.now();
  try {
    const out = await fn();
    if (out && out.warn) say("warn", name, `${out.warn} (${secs(t)})`);
    else say("pass", name, `${out?.note ?? ""} (${secs(t)})`.trim());
    return out;
  } catch (e) {
    say("fail", name, String(e?.message ?? e).slice(0, 300));
    return null;
  }
}

async function until(fn, ok, ms, what) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (ok(last)) return last;
    await sleep(1500);
  }
  throw new Error(`timed out after ${ms / 1000}s waiting for ${what} (last status: ${last?.status ?? "none"})`);
}

const money = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- pages ----------
async function page(p, mustContain) {
  const res = await fetch(SITE + p, { redirect: "manual" });
  if (res.status >= 400) throw new Error(`${p} returned ${res.status}`);
  if (mustContain && res.status === 200) {
    const html = await res.text();
    if (!mustContain.test(html)) throw new Error(`${p} loaded but is missing ${mustContain}`);
  }
  return { note: `${res.status}` };
}

// ---------- a sample case, start to complaint ----------
async function sampleCase({ lang, insured }) {
  const label = insured ? "sample bill with insurance statement" : "sample bill, no insurance";
  const { id, token } = await cx.mutation(api.cases.start, { sample: true, lang });
  made.push({ id, token });
  const get = () => cx.query(api.cases.get, { id, token });

  if (insured) {
    await check(`${label}: insurance statement read`, async () => {
      await cx.mutation(api.cases.addSampleEob, { id, token });
      const c = await until(get, (c) => c?.eobStatus === "done" || c?.eobStatus === "error", 90_000, "the statement");
      if (c.eobStatus !== "done") throw new Error(`statement status ${c.eobStatus}: ${c.eobError ?? ""}`);
      return { note: "read" };
    });
  }

  const c1 = await check(`${label}: bill read and checked`, async () => {
    const c = await until(get, (c) => ["needs_household", "confirm_hospital", "error"].includes(c?.status), 90_000, "the bill to be read");
    if (c.status === "error") throw new Error("case ended in error");
    const f = c.findings ?? [];
    const amounts = f.map((x) => x.amount).sort((a, b) => a - b);
    const hasDup = f.some((x) => Math.abs(x.amount - 269) < 0.01);
    const hasPrice = f.some((x) => Math.abs(x.amount - 80) < 0.01);
    if (!hasDup || !hasPrice) throw new Error(`expected $269 duplicate and $80 over list price, got ${amounts.map(money).join(", ") || "no findings"}`);
    const read = (c.agentRuns ?? []).filter((r) => r.task === "read");
    if (c.status === "confirm_hospital") return { warn: "stopped to confirm the hospital" };
    if (c.billSource && c.billSource !== "claude") return { warn: `bill came from ${c.billSource}, not a live read` };
    if (read.length && !read.some((r) => r.ok)) return { warn: "the AI read failed and a fallback was used" };
    return { note: `findings ${amounts.map(money).join(" + ")}` };
  });
  if (!c1) return { id, token };

  await check(`${label}: answer and letters`, async () => {
    await cx.mutation(api.cases.submitHousehold, { id, token, size: 1, annualIncome: 20000, insured });
    const c = await until(get, (c) => ["ready", "error"].includes(c?.status), 120_000, "the letters");
    if (c.status === "error") throw new Error("case ended in error");
    const kinds = (c.letters ?? []).map((l) => l.kind);
    const owe = c.eligibility?.owedEstimate;
    if (!insured && owe !== 0) throw new Error(`expected "likely owes $0" for 1 person at $20,000, got ${owe}`);
    if (!insured && kinds.includes("appeal")) throw new Error("an uninsured patient got an insurance appeal letter");
    if (insured && !kinds.some((k) => /appeal/.test(k))) throw new Error(`expected an insurance appeal letter, got ${kinds.join(", ")}`);
    if (!kinds.includes("assistance")) throw new Error(`no financial assistance letter (got ${kinds.join(", ")})`);
    for (const l of c.letters) if (/\[[^\]]*\]/.test(l.subject)) throw new Error(`blank left in a letter subject: ${l.subject}`);
    const note = `owes ${owe == null ? "?" : money(owe)}, letters: ${kinds.join(", ")}`;
    if (c.letterFlags?.length) return { warn: `${note}; amounts flagged for checking: ${c.letterFlags.map(money).join(", ")}` };
    if (c.lettersSource !== "claude") return { warn: `${note}; letters came from the template, not Claude` };
    return { note };
  });

  await check(`${label}: approve and follow-up complaint`, async () => {
    const c = await get();
    if (c?.status !== "ready") throw new Error("not ready to approve");
    const letters = c.letters.map(({ kind, title, subject, body, subjectPatient, bodyPatient }) => ({ kind, title, subject, body, ...(subjectPatient ? { subjectPatient } : {}), ...(bodyPatient ? { bodyPatient } : {}) }));
    await cx.mutation(api.cases.approve, { id, token, letters });
    const later = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    await cx.mutation(api.followUp.setCheckIn, { id, token, on: later });
    await cx.mutation(api.followUp.startComplaint, { id, token, outcome: "no_reply", sentOn: new Date().toISOString().slice(0, 10) });
    const done = await until(get, (c) => c?.followUp?.letter && c.followUp.status !== "drafting", 90_000, "the complaint");
    const l = done.followUp.letter;
    if (!/Hospital Bill Complaint Program/.test(l.body)) throw new Error("complaint isn't addressed to the state program");
    if (lang === "es" && !l.bodyPatient) return { warn: "no Spanish copy of the complaint" };
    if (done.followUp.source !== "claude") return { warn: "complaint came from the template, not Claude" };
    return { note: "drafted" };
  });
  return { id, token };
}

// ---------- browser walk ----------
function loadPlaywright() {
  const tries = [process.env.PW_DIR, process.cwd(), path.dirname(new URL(import.meta.url).pathname)].filter(Boolean);
  for (const d of tries) {
    try {
      return createRequire(path.join(d, "noop.js"))("playwright");
    } catch {}
  }
  return null;
}

async function browserWalk(pw) {
  const b = await pw.chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome", headless: true }).catch(() => pw.chromium.launch({ headless: true }));
  try {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await check("browser: sample bill reaches the findings on a phone", async () => {
      await p.goto(SITE + "/", { waitUntil: "load" });
      await p.getByText(/Try a sample bill/i).first().click();
      const start = p.getByRole("button", { name: /Start the sample/i });
      await start.waitFor({ timeout: 15_000 });
      await start.click();
      const end = Date.now() + 60_000;
      while (Date.now() < end && !/s=found/.test(p.url())) await p.waitForTimeout(500);
      if (!/s=found/.test(p.url())) throw new Error(`still on "${(await p.locator("h1").first().innerText().catch(() => "?")).slice(0, 60)}" after 60s`);
      // Clean up the case this walk made.
      const m = p.url().match(/\/case\/([^#?]+)#t=([^&]+)/);
      if (m) made.push({ id: m[1], token: decodeURIComponent(m[2]) });
      if (errs.length) return { warn: `page errors: ${errs.join(" | ")}` };
      return { note: "found screen shown" };
    });
    await check("browser: audit search finds PIH Health Whittier", async () => {
      await p.goto(SITE + "/audit", { waitUntil: "load" });
      const find = p.locator(".find-input");
      await find.waitFor({ timeout: 15_000 });
      await find.fill("PIH Health Whittier");
      await p.locator(".find-results").filter({ hasText: /PIH Health Whittier/ }).first().waitFor({ timeout: 10_000 });
      return { note: "listed" };
    });
  } finally {
    await b.close();
  }
}

// ---------- run ----------
console.log(`Preflight: ${SITE}  backend ${CONVEX_URL}\n`);

await check("page: home", () => page("/", /Recount/));
await check("page: audit", () => page("/audit", /470|463/));
await check("page: dashboard", () => page("/dashboard"));
await check("page: privacy", () => page("/privacy"));
await check("page: account", () => page("/account"));
await check("page: /app download link", () => page("/app"));
await check("Google sign-in is on", async () => {
  const p = await cx.query(api.auth.providers, {});
  if (!p?.google) throw new Error("the Google button is hidden: AUTH_GOOGLE_ID or AUTH_GOOGLE_SECRET is missing on this deployment");
  return { note: "on" };
});
await check("hospital search: PIH Health Whittier", async () => {
  const r = await cx.query(api.cases.searchHospitals, { q: "PIH Health Whittier" });
  if (!JSON.stringify(r ?? []).includes("PIH Health Whittier")) throw new Error("not found");
  return { note: `${r.length} result(s)` };
});
await check("dashboard data", async () => {
  const s = await cx.query(api.dashboard.summary, {});
  if (!s) throw new Error("no data");
  return { note: "returned" };
});

await Promise.all([sampleCase({ lang: "en", insured: false }), sampleCase({ lang: "es", insured: true })]);

if (!process.env.NO_CHAT) {
  await check("Lupa chat answers", async () => {
    const sessionId = "preflight-" + Math.random().toString(36).slice(2);
    await cx.mutation(api.chat.send, { sessionId, lang: "en", content: "What is charity care?" });
    const msgs = await until(
      () => cx.query(api.chat.list, { sessionId }).then((m) => ({ m, status: "chat" })),
      ({ m }) => m.some((x) => x.role === "assistant" && !x.pending && x.content),
      60_000,
      "a reply",
    );
    const reply = msgs.m.find((x) => x.role === "assistant").content;
    return { note: `"${reply.slice(0, 60).replace(/\s+/g, " ")}..."` };
  });
}

const pw = loadPlaywright();
if (pw) await browserWalk(pw);
else say("warn", "browser walk skipped", "Playwright not found (set PW_DIR)");

for (const { id, token } of made) await cx.mutation(api.cases.remove, { id, token }).catch(() => {});

const fails = results.filter((r) => r.state === "fail").length;
const warns = results.filter((r) => r.state === "warn").length;
console.log(`\n${results.length - fails - warns} pass, ${warns} warn, ${fails} fail  (${secs(t0)}; ${made.length} test cases deleted)`);
process.exit(fails ? 1 : 0);
