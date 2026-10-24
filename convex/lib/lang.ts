// Patient-facing language. Letters to the hospital always stay in English; everything the
// patient reads can be English or Spanish.

export type Lang = "en" | "es";

export const isLang = (x: unknown): x is Lang => x === "en" || x === "es";

/** pick(lang)(english, spanish) returns the string for the patient's language. */
export const pick = (lang: Lang) => (en: string, es: string) => (lang === "es" ? es : en);

export const money = (x: number) => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
