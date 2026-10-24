// Every piece of UI text lives in en.json and es.json, with the same keys.
// Messages that need numbers or names use the small template syntax in format.ts:
// {name}, {n, plural, one {…} other {…}} and {flag, select, true {…} other {…}}.
// tests/i18n.test.ts checks that es.json has every key of en.json with the same placeholders.
//
// Text that comes from the backend (step labels, findings, eligibility basis,
// letters, audit quotes and rule titles) is not here and stays as sent.

import en from "./en.json";
import es from "./es.json";
import { format, type Vars } from "./format";

export type Lang = "en" | "es";
export type { Vars } from "./format";

export const locale = (lang: Lang) => (lang === "es" ? "es-US" : "en-US");

type JsonKey = keyof typeof en;
const DICTS: Record<Lang, Record<JsonKey, string>> = { en, es };

const msg = (lang: Lang, key: JsonKey, vars?: Vars) => format(lang, DICTS[lang][key], vars);
const count = (v: Vars | undefined, name: string) => Number(v?.[name] ?? 0);

// The two messages whose sentence is built from several JSON entries.
const COMPOSED = {
  "policy.foot": (lang: Lang, v?: Vars) =>
    msg(lang, count(v, "firm") === count(v, "total") ? "policy.foot.all" : "policy.foot.some", v),
  "hosp.summary": (lang: Lang, v?: Vars) => {
    const askTail = count(v, "ask") ? msg(lang, "hosp.summary.askMore", v) : "";
    if (count(v, "conflict")) {
      const likelyTail = count(v, "likely") ? msg(lang, "hosp.summary.likelyMore", v) : "";
      return msg(lang, "hosp.summary.conflict", v) + likelyTail + askTail;
    }
    if (count(v, "likely")) return msg(lang, "hosp.summary.likely", v) + askTail;
    return msg(lang, "hosp.summary.ask", v);
  },
};

export type Key = JsonKey | keyof typeof COMPOSED;
/** Any key; kept for call sites that only show text without variables. */
export type PlainKey = Key;
export type T = (key: Key, vars?: Vars) => string;

/** Look up a UI string outside React (helpers that take `lang`). Components use useT(). */
export function translate(lang: Lang, key: Key, vars?: Vars): string {
  return key in COMPOSED ? COMPOSED[key as keyof typeof COMPOSED](lang, vars) : msg(lang, key as JsonKey, vars);
}

/** "a and b" / "a, b y c" in the reader's language. */
export function joinList(lang: Lang, items: string[]) {
  return new Intl.ListFormat(locale(lang), { style: "long", type: "conjunction" }).format(items);
}
