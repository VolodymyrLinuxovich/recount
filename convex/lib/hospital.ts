// Reference data about one hospital, as returned by our Apify Actor
// (or a saved snapshot of an earlier Actor run when the live run isn't available).

export interface PriceRow {
  description: string | null;
  grossCharge: number | null;
  discountedCash: number | null;
  min: number | null;
  max: number | null;
  setting?: string | null;
  /** Lowest rate the hospital accepts from a government program (Medi-Cal/Medicare) for this service. */
  govRate?: number | null;
  govPayer?: string | null;
}

export interface HospitalRef {
  key: string;
  name: string;
  source: "apify-live" | "snapshot";
  fetchedAt: string;
  mrf: {
    url: string;
    lastUpdated: string | null;
    prices: Record<string, PriceRow>;
  } | null;
  fap: {
    url: string | null;
    freeCareMaxFplPct: number | null;
    discountMaxFplPct: number | null;
    quotes: string[];
    phone: string | null;
    applicationUrl: string | null;
    /** The hospital's policy sets no upper income limit for discounts. */
    discountNoCap?: boolean;
    /** Effective date of the policy document the limits came from. */
    effectiveDate?: string | null;
    /** How the limits were read: "rules" (pattern extractor) or "claude" (checked against a verbatim quote). */
    method?: "rules" | "claude" | "manual";
  } | null;
  /** True for hospitals we only know from the state's policy filings (no price file). */
  policyOnly?: boolean;
  warnings: string[];
}

export function normalizeCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length >= 4 ? c : null;
}
