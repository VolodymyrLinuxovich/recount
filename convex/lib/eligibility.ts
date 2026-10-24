// California hospital financial assistance eligibility, as plain rules.
// The model never decides eligibility; this file does, and every result lists the rule it used.

import type { HospitalRef } from "./hospital";

export interface FplTable {
  year: number;
  source: string;
  base: number; // household of 1
  perAdditional: number;
}

export interface Household {
  size: number;
  annualIncome: number;
  insured: boolean;
  /** Out-of-pocket medical costs at this hospital in the last 12 months (incl. this bill), insured patients only. */
  outOfPocket12mo?: number;
}

export type Tier = "FREE" | "DISCOUNT" | "NOT_ELIGIBLE" | "NEEDS_INFO";

export interface Basis {
  rule: string;
  text: string;
  source?: string;
}

export interface Eligibility {
  povertyLine: number;
  fplPct: number;
  tier: Tier;
  headline: string;
  owedEstimate: number | null; // null when it depends on a rate we don't have
  basis: Basis[];
  medicalLikely: boolean; // income low enough that Medi-Cal is worth checking
}

const HSC_127405 = "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=127405.";
const HSC_127400 = "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=127400.";

export function povertyLine(fpl: FplTable, size: number): number {
  const n = Math.max(1, Math.floor(size));
  return fpl.base + fpl.perAdditional * (n - 1);
}

export function assess(h: Household, fpl: FplTable, ref: HospitalRef | null, amountDue: number | null): Eligibility {
  const line = povertyLine(fpl, h.size);
  const fplPct = Math.round((h.annualIncome / line) * 1000) / 10;
  const basis: Basis[] = [
    {
      rule: "Poverty line",
      text: `${fpl.year} federal poverty guideline for a household of ${h.size}: $${line.toLocaleString()}. Your income is ${fplPct}% of it.`,
      source: fpl.source,
    },
  ];

  // Who the state law covers: uninsured patients, or insured patients with high medical costs.
  let highCosts = false;
  if (h.insured) {
    if (h.outOfPocket12mo == null) {
      return {
        povertyLine: line,
        fplPct,
        tier: "NEEDS_INFO",
        headline: "We need your out-of-pocket costs from the last 12 months",
        owedEstimate: null,
        basis,
        medicalLikely: false,
      };
    }
    highCosts = h.outOfPocket12mo > 0.1 * h.annualIncome;
    basis.push({
      rule: "High medical costs",
      text: highCosts
        ? `You paid or owe $${h.outOfPocket12mo.toLocaleString()} out of pocket, more than 10% of your income. California treats that as high medical costs.`
        : `You paid or owe $${h.outOfPocket12mo.toLocaleString()} out of pocket, which is not more than 10% of your income, so the high-cost rule doesn't apply.`,
      source: HSC_127400,
    });
    if (!highCosts) {
      return {
        povertyLine: line,
        fplPct,
        tier: "NOT_ELIGIBLE",
        headline: "Insured without high medical costs: the state program doesn't apply",
        owedEstimate: null,
        basis,
        medicalLikely: false,
      };
    }
  }

  const fap = ref?.fap ?? null;
  const freeMax = fap?.freeCareMaxFplPct ?? null;
  // State law sets the floor for discounted care at 400% of the poverty line; a hospital can go higher.
  const discountMax = Math.max(400, fap?.discountMaxFplPct ?? 400);
  const medicalLikely = !h.insured && fplPct <= 138;

  if (freeMax != null && fplPct <= freeMax) {
    basis.push({
      rule: `${ref!.name} free care`,
      text: `The hospital's own policy gives free care up to ${freeMax}% of the poverty line. You're at ${fplPct}%.`,
      source: fap?.url ?? undefined,
    });
    return {
      povertyLine: line,
      fplPct,
      tier: "FREE",
      headline: "You likely qualify for free care",
      owedEstimate: 0,
      basis,
      medicalLikely,
    };
  }

  if (fplPct <= discountMax) {
    basis.push({
      rule: "California discount payment",
      text: `Hospitals must offer discounted payment to ${h.insured ? "patients with high medical costs" : "uninsured patients"} with income at or below ${discountMax}% of the poverty line, and can't charge them more than a government payer would pay.`,
      source: HSC_127405,
    });
    if (freeMax == null) {
      basis.push({ rule: "Hospital policy", text: "We couldn't read this hospital's free-care cutoff, so we only show the state floor. You may still qualify for free care." });
    }
    return {
      povertyLine: line,
      fplPct,
      tier: "DISCOUNT",
      headline: "You likely qualify for a discount",
      owedEstimate: null,
      basis,
      medicalLikely,
    };
  }

  basis.push({
    rule: "California discount payment",
    text: `Your income is above ${discountMax}% of the poverty line, the cutoff we found. Hospitals may still offer help, so it's worth asking.`,
    source: HSC_127405,
  });
  return {
    povertyLine: line,
    fplPct,
    tier: "NOT_ELIGIBLE",
    headline: "Above the income cutoff we found",
    owedEstimate: amountDue,
    basis,
    medicalLikely: false,
  };
}
