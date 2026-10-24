// Runs the TypeScript EOB rules on the eval's shared fixtures (eval/eob/fixtures/*.json), so the
// app's rules and the eval's answer key stay the same. Each fixture is
// { bill: ParsedBill, eob: ParsedEob, expect: [{ kind, amount }] }.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ParsedBill } from "../convex/lib/bill";
import type { EobFindingKind, ParsedEob } from "../convex/lib/eob";
import { checkEob } from "../convex/lib/eobChecks";

const DIR = join(__dirname, "..", "eval", "eob", "fixtures");
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".json")).sort() : [];

type Fixture = { bill: ParsedBill; eob: ParsedEob; expect: { kind: EobFindingKind; amount: number }[] };

const key = (x: { kind: string; amount: number }) => `${x.kind} ${Math.round(x.amount * 100) / 100}`;

describe("EOB fixtures from eval/eob/fixtures", () => {
  if (!files.length) {
    it.skip(`no fixtures yet in eval/eob/fixtures (the eval writes them); skipping`, () => {});
    return;
  }
  for (const name of files) {
    it(name, () => {
      const fx = JSON.parse(readFileSync(join(DIR, name), "utf8")) as Fixture;
      const got = checkEob(fx.bill, fx.eob).map(key).sort();
      expect(got).toEqual(fx.expect.map(key).sort());
    });
  }
});
