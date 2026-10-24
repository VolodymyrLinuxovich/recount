// Match the hospital printed on a bill against every California hospital on file with HCAI
// (convex/lib/hospitalIndex.json, built by pipeline/build_hospital_index.py).
// When the match isn't clear, the patient picks from the closest few; we never guess silently.

import type { HospitalRef } from "./hospital";
import index from "./hospitalIndex.json";

export interface IndexedHospital {
  key: string;
  name: string;
  names: string[];
  match: string[];
  city: string | null;
  county: string | null;
  address: string | null;
  detailUrl: string | null;
  fap: {
    url: string | null;
    effectiveDate: string | null;
    applicationUrl: string | null;
    freeCareMaxFplPct: number | null;
    discountMaxFplPct: number | null;
    discountNoCap: boolean;
    freeQuote: string | null;
    discountQuote: string | null;
    phone: string | null;
    readable: boolean;
  };
}

export const HOSPITALS = (index as { hospitals: IndexedHospital[] }).hospitals;
export const byKey = (key: string) => HOSPITALS.find((h) => h.key === key) ?? null;

// Same word list as the pipeline: words every hospital shares carry no signal.
const STOP = new Set(["the", "of", "and", "inc", "llc", "hospital", "hospitals", "medical", "center", "centre", "health",
  "healthcare", "care", "campus", "regional", "community", "california", "ca"]);

export function tokens(s: string): string[] {
  return (s.toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w));
}

export interface Candidate {
  key: string;
  name: string;
  city: string | null;
  score: number;
}

function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  // Weighted toward "how much of the printed name we found" so short bill names still match.
  return (both / A.size) * 0.6 + (both / new Set([...A, ...B]).size) * 0.4;
}

export interface MatchResult {
  confident: Candidate | null;
  candidates: Candidate[];
}

export function matchHospital(name: string | null, address: string | null): MatchResult {
  const q = tokens(name ?? "");
  const where = (address ?? "").toLowerCase();
  if (!q.length && !where) return { confident: null, candidates: [] };
  const scored: Candidate[] = HOSPITALS.map((h) => {
    let s = Math.max(0, ...h.match.map((m) => similarity(q, m.split(" "))));
    if (h.city && where.includes(h.city.toLowerCase())) s += 0.15;
    if (h.address && where && where.includes(h.address.toLowerCase().split(",")[0].slice(0, 12))) s += 0.2;
    return { key: h.key, name: h.name, city: h.city, score: Math.round(s * 100) / 100 };
  })
    .filter((c) => c.score >= 0.3)
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  const clear = best && best.score >= 0.75 && (!second || best.score - second.score >= 0.15);
  return { confident: clear ? best : null, candidates: scored.slice(0, 5) };
}

/** Policy facts for a hospital we have no price file for. Prices are not checked; we say so. */
export function refFromIndex(h: IndexedHospital): HospitalRef {
  return {
    key: h.key,
    name: h.name,
    source: "snapshot",
    fetchedAt: h.fap.effectiveDate ?? "",
    mrf: null,
    fap: {
      url: h.fap.url,
      freeCareMaxFplPct: h.fap.freeCareMaxFplPct,
      discountMaxFplPct: h.fap.discountNoCap ? 1000 : h.fap.discountMaxFplPct,
      quotes: [h.fap.freeQuote, h.fap.discountQuote].filter((q): q is string => Boolean(q)),
      phone: h.fap.phone,
      applicationUrl: h.fap.applicationUrl,
    },
    warnings: [],
  };
}
