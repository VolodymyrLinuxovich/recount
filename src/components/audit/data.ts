// Shape of public/audit/findings.json, produced by the statewide policy audit.

export type Verdict = "conflict" | "likely" | "ask";
export type DocType = "charity_care" | "discount_payment" | "debt_collection" | "application";

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

export const VERDICT_LABEL: Record<Worst, string> = {
  conflict: "conflicts with the law",
  likely: "likely conflicts",
  ask: "worth asking about",
  none: "no conflicts found",
};

export const DOC_LABEL: Record<DocType, string> = {
  charity_care: "Charity care policy",
  discount_payment: "Discount payment policy",
  debt_collection: "Debt collection policy",
  application: "Application form",
};

export function longDate(iso: string | null | undefined) {
  if (!iso) return "date not stated";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function place(h: Hospital) {
  return [h.city, h.county && `${h.county} County`].filter(Boolean).join(", ");
}
