import { describe, expect, it } from "vitest";
import en from "../src/components/i18n/en.json";
import es from "../src/components/i18n/es.json";
import { format, placeholders } from "../src/components/i18n/format";
import { translate } from "../src/components/i18n/strings";

const EN: Record<string, string> = en;
const ES: Record<string, string> = es;

describe("dictionaries", () => {
  it("es.json has exactly the keys of en.json", () => {
    expect(Object.keys(ES).filter((k) => !(k in EN))).toEqual([]);
    expect(Object.keys(EN).filter((k) => !(k in ES))).toEqual([]);
  });

  it("each Spanish message uses the same placeholders as the English one", () => {
    const mismatched = Object.keys(EN).filter((k) => placeholders(EN[k]).join() !== placeholders(ES[k] ?? "").join());
    expect(mismatched).toEqual([]);
  });

  it("every message parses", () => {
    for (const [lang, dict] of [["en", EN], ["es", ES]] as const)
      for (const [k, m] of Object.entries(dict)) expect(() => format(lang, m, {}), `${lang} ${k}`).not.toThrow();
  });
});

describe("format", () => {
  it("fills names, plurals and selects", () => {
    expect(format("en", "Hi {name}", { name: "Ana" })).toBe("Hi Ana");
    const things = "{n, plural, =0 {nothing} one {# thing} other {# things}}";
    expect([0, 1, 2, 5].map((n) => format("en", things, { n }))).toEqual(["nothing", "1 thing", "2 things", "5 things"]);
    const pick = "{pdf, select, true {file} other {photo}}";
    expect([true, false].map((pdf) => format("en", pick, { pdf }))).toEqual(["file", "photo"]);
    expect(format("en", "{name, select, null {the hospital} other {{name}}}", { name: null })).toBe("the hospital");
  });

  it("uses the language's plural rules, falling back to other", () => {
    expect(format("es", "{n, plural, one {# cosa} other {# cosas}}", { n: 1000000 })).toBe("1000000 cosas");
  });
});

describe("composed messages", () => {
  it("builds the hospital summary from its parts", () => {
    expect(translate("en", "hosp.summary", { conflict: 1, likely: 2, ask: 1 })).toBe(
      "1 part of its policies goes against California law. 2 more likely do. 1 more is worth asking about.",
    );
    expect(translate("en", "policy.foot", { added: true, firm: 2, total: 2 })).toBe("We’ve added these to your letter. ");
  });
});
