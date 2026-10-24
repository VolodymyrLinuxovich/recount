// Shape of public/audit/findings.json, produced by the statewide policy audit.

import { type Lang, locale, translate } from "../i18n/strings";

export type Verdict = "conflict" | "likely" | "ask";
export type DocType = "charity_care" | "discount_payment" | "debt_collection" | "application" | "application_discount";

export interface Rule {
  id: string;
  title: string;
  cite: string;
  url: string;
  lawQuote: string;
}

export interface AuditFinding {
  rule: string;
  verdict: Verdict;
  quote: string;
  context: string;
  page: number | null;
  docType: DocType;
  docUrl: string;
  effectiveDate: string | null;
  explanation: string;
}

export interface Hospital {
  key: string;
  name: string;
  city: string | null;
  county: string | null;
  lat: number | null;
  lon: number | null;
  detailUrl: string;
  /** False when none of the hospital's documents could be read. */
  checked?: boolean;
  docs: Partial<Record<DocType, { url: string; effectiveDate: string | null }>>;
  findings: AuditFinding[];
}

export interface Audit {
  generatedAt: string;
  hospitalsTotal: number;
  hospitalsChecked: number;
  rules: Rule[];
  hospitals: Hospital[];
}

export type Worst = Verdict | "none";

const RANK: Record<Worst, number> = { conflict: 3, likely: 2, ask: 1, none: 0 };

export function worst(h: Hospital): Worst {
  let w: Worst = "none";
  for (const f of h.findings) if (RANK[f.verdict] > RANK[w]) w = f.verdict;
  return w;
}

export const isFlagged = (h: Hospital) => h.findings.some((f) => f.verdict === "conflict" || f.verdict === "likely");

export const verdictLabel = (w: Worst, lang: Lang) => translate(lang, `verdict.${w}`);

export const docLabel = (doc: string, lang: Lang) => translate(lang, "doc.label", { doc });

export function longDate(iso: string | null | undefined, lang: Lang) {
  if (!iso) return translate(lang, "date.notStated");
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale(lang), { month: "short", day: "numeric", year: "numeric" });
}

/** "Fresno, Fresno County" / "Fresno, Condado de Fresno". */
export function place(h: Hospital, lang: Lang) {
  return [h.city, h.county && translate(lang, "place.county", { county: h.county })].filter(Boolean).join(", ");
}

// The bill flow links here with its own short hospital key; map those to audit keys.
const ALIASES: Record<string, string[]> = {
  zsfg: ["priscilla-chan-mark-zuckerberg-san-francisco-general-hospital-trauma-center"],
  ucsf: ["ucsf-medical-center"],
  cpmc: ["california-pacific-medical-center-van-ness-campus", "cpmc_vanness"],
  saintfrancis: ["st-francis-memorial-hospital", "stfrancis_hyde"],
};

export function resolveKey(hospitals: Hospital[], key: string | null): string | null {
  if (!key) return null;
  if (hospitals.some((h) => h.key === key)) return key;
  for (const k of ALIASES[key] ?? []) if (hospitals.some((h) => h.key === k)) return k;
  return null;
}

// State data spells names in capitals. Show them in normal case, keeping acronyms.
const ACRONYMS = new Set(["AHMC", "APH", "BHC", "CA", "CHOC", "CPMC", "HCA", "II", "III", "IV", "KPC", "LAC", "LLC", "MC", "PIH", "UC", "UCI", "UCLA", "UCSD", "UCSF", "USC", "VA"]);
const SMALL = new Set(["and", "at", "for", "of", "the", "in", "on"]);

function caseWord(w: string, first: boolean): string {
  if (!w) return w;
  const bare = w.replace(/[^A-Za-z]/g, "");
  if (ACRONYMS.has(bare.toUpperCase()) || bare === "L" && w.includes(".")) return w.toUpperCase();
  const lower = w.toLowerCase();
  if (!first && SMALL.has(lower)) return lower;
  return lower.replace(/^([^a-z]*)([a-z])/, (_, p: string, c: string) => p + c.toUpperCase());
}

export function displayName(name: string): string {
  if (name !== name.toUpperCase()) return name; // already mixed case
  return name
    .split(/\s+/)
    .map((w, i) =>
      w
        .split(/([-+/])/)
        .map((part) => (/^[-+/]$/.test(part) ? part : caseWord(part, i === 0)))
        .join(""),
    )
    .join(" ")
    .replace(/'S\b/g, "'s");
}
