// A tiny message formatter for the JSON dictionaries. It understands:
//   {name}                                         the value as text
//   {n, plural, =0 {…} one {…} other {…}}          exact =N first, then the language's plural category, then other; # is n
//   {flag, select, true {…} null {…} other {…}}    the value as text (null or missing is "null"), else other
// Branches can nest. There is no quoting: the dictionaries never use literal braces or # in text.

export type Vars = Record<string, string | number | boolean | null | undefined>;

const rules = new Map<string, Intl.PluralRules>();
function category(lang: string, n: number) {
  let r = rules.get(lang);
  if (!r) rules.set(lang, (r = new Intl.PluralRules(lang)));
  return r.select(n);
}

/** Index just past the "}" that closes the "{" at `open`. */
function closing(msg: string, open: number) {
  let depth = 0;
  for (let i = open; i < msg.length; i++) {
    if (msg[i] === "{") depth++;
    else if (msg[i] === "}" && --depth === 0) return i + 1;
  }
  throw new Error(`Unclosed { in message: ${msg}`);
}

/** The branches of a plural or select body, e.g. "=0 {a} other {b}". */
function branches(body: string) {
  const out = new Map<string, string>();
  let i = 0;
  while (i < body.length) {
    while (body[i] === " ") i++;
    if (i >= body.length) break;
    const open = body.indexOf("{", i);
    const end = closing(body, open);
    out.set(body.slice(i, open).trim(), body.slice(open + 1, end - 1));
    i = end;
  }
  return out;
}

function arg(lang: string, inner: string, vars: Vars, hash: number | null): string {
  const first = inner.indexOf(",");
  if (first < 0) return String(vars[inner.trim()]);
  const name = inner.slice(0, first).trim();
  const second = inner.indexOf(",", first + 1);
  const type = inner.slice(first + 1, second).trim();
  const options = branches(inner.slice(second + 1));
  const value = vars[name];
  if (type === "plural") {
    const n = Number(value);
    const branch = options.get(`=${n}`) ?? options.get(category(lang, n)) ?? options.get("other") ?? "";
    return format(lang, branch, vars, n);
  }
  if (type === "select") {
    const branch = options.get(value == null ? "null" : String(value)) ?? options.get("other") ?? "";
    return format(lang, branch, vars, hash);
  }
  throw new Error(`Unknown format type "${type}"`);
}

/** Fill in a message. `hash` is the number # stands for inside a plural branch. */
export function format(lang: string, msg: string, vars: Vars = {}, hash: number | null = null): string {
  let out = "";
  let i = 0;
  while (i < msg.length) {
    const c = msg[i];
    if (c === "{") {
      const end = closing(msg, i);
      out += arg(lang, msg.slice(i + 1, end - 1), vars, hash);
      i = end;
    } else if (c === "#" && hash !== null) {
      out += String(hash);
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** The variable names a message uses, for checking that translations match. */
export function placeholders(msg: string): string[] {
  const names = new Set<string>();
  const walk = (m: string) => {
    let i = 0;
    while (i < m.length) {
      if (m[i] !== "{") {
        i++;
        continue;
      }
      const end = closing(m, i);
      const inner = m.slice(i + 1, end - 1);
      const first = inner.indexOf(",");
      if (first < 0) names.add(inner.trim());
      else {
        names.add(inner.slice(0, first).trim());
        for (const b of branches(inner.slice(inner.indexOf(",", first + 1) + 1)).values()) walk(b);
      }
      i = end;
    }
  };
  walk(msg);
  return [...names].sort();
}
