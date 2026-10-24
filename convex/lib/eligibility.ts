// California hospital financial assistance eligibility, as plain rules.
// The model never decides eligibility; this file does, and every result lists the rule it used.

import type { HospitalRef } from "./hospital";
import { type Lang, pick } from "./lang";

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
  /** The family's out-of-pocket medical costs in the last 12 months, anywhere (incl. this bill). Insured patients only. */
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

const usd = (x: number) => `$${x.toLocaleString("en-US")}`;

export function assess(h: Household, fpl: FplTable, ref: HospitalRef | null, amountDue: number | null, lang: Lang = "en"): Eligibility {
  const t = pick(lang);
  const line = povertyLine(fpl, h.size);
  const fplPct = Math.round((h.annualIncome / line) * 1000) / 10;
  const people = h.size === 1 ? t("1 person", "1 persona") : t(`${h.size} people`, `${h.size} personas`);
  const basis: Basis[] = [
    {
      rule: t("Poverty line", "Nivel federal de pobreza"),
      text: t(
        `${fpl.year} federal poverty guideline for a household of ${people}: ${usd(line)}. Your income is ${fplPct}% of it.`,
        `Nivel federal de pobreza de ${fpl.year} para un hogar de ${people}: ${usd(line)}. Su ingreso es el ${fplPct}% de esa cantidad.`,
      ),
      source: fpl.source,
    },
  ];
  const result = (tier: Tier, headline: string, owedEstimate: number | null, medicalLikely: boolean): Eligibility => ({
    povertyLine: line,
    fplPct,
    tier,
    headline,
    owedEstimate,
    basis,
    medicalLikely,
  });

  // Who the state law covers: uninsured patients, or insured patients with high medical costs.
  if (h.insured) {
    if (h.outOfPocket12mo == null) {
      return result("NEEDS_INFO", t("We need your family's medical costs from the last 12 months", "Necesitamos los gastos médicos de su familia de los últimos 12 meses"), null, false);
    }
    const highCosts = h.outOfPocket12mo > 0.1 * h.annualIncome;
    const oop = usd(h.outOfPocket12mo);
    basis.push({
      rule: t("High medical costs", "Gastos médicos altos"),
      text: highCosts
        ? t(
            `Your family's medical costs in the last 12 months (${oop}, not paid by insurance) are more than 10% of your income. California treats that as high medical costs.`,
            `Los gastos médicos de su familia en los últimos 12 meses (${oop}, no pagados por el seguro) son más del 10% de su ingreso. California lo considera gastos médicos altos.`,
          )
        : t(
            `Your family's medical costs in the last 12 months (${oop}, not paid by insurance) are not more than 10% of your income, so the high-cost rule doesn't apply.`,
            `Los gastos médicos de su familia en los últimos 12 meses (${oop}, no pagados por el seguro) no son más del 10% de su ingreso, así que la regla de gastos altos no aplica.`,
          ),
      source: HSC_127400,
    });
    if (!highCosts) {
      return result("NOT_ELIGIBLE", t("With insurance and medical costs under 10% of income, the state program doesn't cover this bill. You can still ask the hospital.", "Con seguro y gastos médicos de menos del 10% de su ingreso, el programa estatal no cubre esta factura. Aún puede preguntarle al hospital."), null, false);
    }
  }

  const fap = ref?.fap ?? null;
  const freeMax = fap?.freeCareMaxFplPct ?? null;
  // State law sets the floor for discounted care at 400% of the poverty line; a hospital can go higher.
  const discountMax = Math.max(400, fap?.discountMaxFplPct ?? 400);
  const medicalLikely = !h.insured && fplPct <= 138;

  if (freeMax != null && fplPct <= freeMax) {
    basis.push({
      rule: t(`${ref!.name} free care`, `Atención gratuita de ${ref!.name}`),
      text: t(
        `The hospital's own policy gives free care up to ${freeMax}% of the poverty line. You're at ${fplPct}%.`,
        `La propia política del hospital da atención gratuita hasta el ${freeMax}% del nivel federal de pobreza. Usted está en ${fplPct}%.`,
      ),
      source: fap?.url ?? undefined,
    });
    return result("FREE", t("You likely qualify for free care", "Probablemente califica para atención gratuita"), 0, medicalLikely);
  }

  if (fplPct <= discountMax) {
    basis.push({
      rule: t("California discount payment", "Pago con descuento de California"),
      text: h.insured
        ? t(
            `Hospitals must offer discounted payment to patients with high medical costs with income at or below ${discountMax}% of the poverty line, and can't charge them more than a government payer would pay.`,
            `Los hospitales deben ofrecer pago con descuento a pacientes con gastos médicos altos con ingresos de hasta el ${discountMax}% del nivel federal de pobreza, y no pueden cobrarles más de lo que pagaría un programa del gobierno.`,
          )
        : t(
            `Hospitals must offer discounted payment to uninsured patients with income at or below ${discountMax}% of the poverty line, and can't charge them more than a government payer would pay.`,
            `Los hospitales deben ofrecer pago con descuento a pacientes sin seguro con ingresos de hasta el ${discountMax}% del nivel federal de pobreza, y no pueden cobrarles más de lo que pagaría un programa del gobierno.`,
          ),
      source: HSC_127405,
    });
    if (freeMax == null) {
      basis.push({
        rule: t("Hospital policy", "Política del hospital"),
        text: t(
          "We couldn't read this hospital's free-care cutoff, so we only show the state floor. You may still qualify for free care.",
          "No pudimos leer el límite de atención gratuita de este hospital, así que solo mostramos el mínimo estatal. Aún podría calificar para atención gratuita.",
        ),
      });
    }
    return result("DISCOUNT", t("You likely qualify for a discount", "Probablemente califica para un descuento"), null, medicalLikely);
  }

  basis.push({
    rule: t("California discount payment", "Pago con descuento de California"),
    text: t(
      `Your income is above ${discountMax}% of the poverty line, the cutoff we found. Hospitals may still offer help, so it's worth asking.`,
      `Su ingreso está por encima del ${discountMax}% del nivel federal de pobreza, el límite que encontramos. Los hospitales aún pueden ofrecer ayuda, así que vale la pena preguntar.`,
    ),
    source: HSC_127405,
  });
  return result("NOT_ELIGIBLE", t("Above the income cutoff we found", "Por encima del límite de ingresos que encontramos"), amountDue, false);
}
