// A rule check on AI-written letters: every dollar amount in a letter must come from the facts
// the model was given (bill lines, totals, findings, eligibility numbers). An amount we can't find
// is flagged for the patient to check before they send anything.

const DOLLARS = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?/g;

/** Dollar amounts written in a text, as numbers. */
export function dollarsIn(text: string): number[] {
  return [...text.matchAll(DOLLARS)].map((m) => Number(m[1].replace(/,/g, "") + (m[2] ?? "")));
}

/** Every number in the facts, including amounts written inside text (like a finding's detail). */
export function numbersIn(facts: unknown, out: Set<number> = new Set()): Set<number> {
  if (typeof facts === "number" && Number.isFinite(facts)) {
    out.add(Math.round(facts * 100) / 100);
  } else if (typeof facts === "string") {
    for (const n of dollarsIn(facts)) out.add(n);
    for (const m of facts.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2}/g)) out.add(Number(m[0].replace(/,/g, "")));
  } else if (Array.isArray(facts)) {
    for (const x of facts) numbersIn(x, out);
  } else if (facts && typeof facts === "object") {
    for (const x of Object.values(facts)) numbersIn(x, out);
  }
  return out;
}

/** Amounts in the letters that aren't in the facts (within a cent, or the same whole dollars). */
export function inventedAmounts(texts: string[], facts: unknown): number[] {
  const known = [...numbersIn(facts)];
  const found = texts.flatMap(dollarsIn);
  const bad = found.filter((n) => !known.some((k) => Math.abs(k - n) < 0.01 || (Number.isInteger(n) && Math.round(k) === n)));
  return [...new Set(bad)];
}
