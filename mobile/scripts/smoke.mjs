// Smoke test: runs the same backend calls the app makes, against Convex prod.
// Usage: node scripts/smoke.mjs [en|es]
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const URL = process.env.CONVEX_URL || "https://zealous-grouse-384.convex.cloud";
const SAMPLE = "https://recount-nu.vercel.app/sample-bill.png";
const lang = process.argv[2] === "es" ? "es" : "en";
const api = anyApi;
const client = new ConvexHttpClient(URL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(id, token, want, timeoutMs = 240_000) {
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < timeoutMs) {
    const c = await client.query(api.cases.get, { id, token });
    if (!c) throw new Error("case not found");
    const sig = c.status + " " + c.steps.map((s) => `${s.key}:${s.state}`).join(",");
    if (sig !== last) console.log(`  [${((Date.now() - t0) / 1000).toFixed(0)}s] ${sig}`);
    last = sig;
    if (c.status === "error") throw new Error("case error: " + c.error);
    if (want.includes(c.status)) return c;
    await sleep(1500);
  }
  throw new Error("timeout waiting for " + want);
}

const img = await fetch(SAMPLE);
const blob = await img.blob();
const uploadUrl = await client.mutation(api.cases.generateUploadUrl, {});
const up = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/png" }, body: blob });
const { storageId } = await up.json();
console.log("uploaded", storageId, blob.size, "bytes");

const { id, token } = await client.mutation(api.cases.start, { sample: true, fileId: storageId, fileType: "image/png", lang });
console.log("started", id);

let c = await waitFor(id, token, ["needs_household", "confirm_hospital"]);
if (c.status === "confirm_hospital") {
  console.log("candidates", c.hospitalCandidates);
  await client.mutation(api.cases.confirmHospital, { id, token, key: c.hospitalCandidates?.[0]?.key ?? null });
  c = await waitFor(id, token, ["needs_household"]);
}
console.log("hospital:", c.hospital?.name, "| bill total", c.bill?.totalCharges, "due", c.bill?.amountDue, "phone", c.bill?.billingPhone);
for (const f of c.findings ?? []) console.log("  finding", f.kind, f.amount, "-", f.title);
for (const p of c.policyFindings ?? []) console.log("  policy", p.verdict, p.rule);
console.log("  unreadable", c.bill?.unreadable);

const hits = await client.query(api.cases.searchHospitals, { q: "zuckerberg" });
console.log("search zuckerberg ->", hits.map((h) => h.name).join("; "));

await client.mutation(api.cases.submitHousehold, { id, token, size: 3, annualIncome: 42000, insured: false });
c = await waitFor(id, token, ["ready"]);
console.log("eligibility:", c.eligibility.tier, c.eligibility.fplPct + "%", "-", c.eligibility.headline);
for (const l of c.letters) console.log("  letter", l.kind, "|", l.subject, "| patient copy:", !!l.bodyPatient, "|", l.body.length, "chars");

await client.mutation(api.cases.approve, { id, token, letters: c.letters.map(({ kind, title, subject, body, subjectPatient, bodyPatient }) => ({ kind, title, subject, body, subjectPatient, bodyPatient })) });
c = await client.query(api.cases.get, { id, token });
console.log("after approve:", c.status);
await client.mutation(api.cases.unapprove, { id, token });
c = await client.query(api.cases.get, { id, token });
console.log("after unapprove:", c.status);
await client.mutation(api.cases.remove, { id, token });
c = await client.query(api.cases.get, { id, token });
console.log("after remove:", c);
console.log("SMOKE OK", lang);
