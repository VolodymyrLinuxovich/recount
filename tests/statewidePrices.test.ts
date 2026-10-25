import { describe, expect, it } from "vitest";
import data from "../convex/lib/statewidePrices.json";
import verified from "../pipeline/out/price_files.json";
import spotChecks from "../pipeline/out/price_spot_checks.json";
import snapshotCheck from "../pipeline/out/snapshot_check.json";
import { HOSPITALS, hasStatewidePrices, priceGap, pricedRefFromIndex } from "../convex/lib/statewide";
import { checkBill } from "../convex/lib/checks";

const priced = Object.keys((data as { hospitals: Record<string, unknown> }).hospitals);

describe("statewide prices from the Apify batch", () => {
  it("only covers hospitals in the HCAI index", () => {
    const keys = new Set(HOSPITALS.map((h) => h.key));
    for (const k of priced) expect(keys.has(k)).toBe(true);
  });

  it("keeps cash prices at or below the list price", () => {
    for (const k of priced) {
      const ref = pricedRefFromIndex(HOSPITALS.find((h) => h.key === k)!);
      for (const row of Object.values(ref.mrf!.prices)) {
        expect(row.grossCharge).toBeGreaterThan(0);
        if (row.discountedCash != null) expect(row.discountedCash).toBeLessThanOrEqual(row.grossCharge! * 1.01);
      }
    }
  });

  it("adds prices to the policy facts and leaves unpriced hospitals policy-only", () => {
    const withPrices = HOSPITALS.find((h) => hasStatewidePrices(h.key))!;
    const without = HOSPITALS.find((h) => !hasStatewidePrices(h.key))!;
    const a = pricedRefFromIndex(withPrices);
    expect(a.mrf?.url).toMatch(/^https?:\/\//);
    expect(a.policyOnly).toBe(false);
    expect(a.fap?.url).toBe(withPrices.fap.url);
    const b = pricedRefFromIndex(without);
    expect(b.mrf).toBeNull();
    expect(b.policyOnly).toBe(true);
  });

  it("uses only the file verified as each hospital's own", () => {
    const files = verified as { chosen: Record<string, { url: string; verifiedBy: string }> };
    const hospitals = (data as { hospitals: Record<string, { url: string; verifiedBy: string }> }).hospitals;
    for (const [k, h] of Object.entries(hospitals)) {
      expect(files.chosen[k]?.url, k).toBe(h.url);
      expect(["license", "name"]).toContain(h.verifiedBy);
    }
    // One hospital's file is never used for another, unless the file itself lists both locations.
    const byUrl = new Map<string, string[]>();
    for (const [k, h] of Object.entries(hospitals)) byUrl.set(h.url, [...(byUrl.get(h.url) ?? []), k]);
    for (const [, keys] of byUrl) if (keys.length > 1) for (const k of keys) expect(files.chosen[k].verifiedBy, k).toBe("license");
  });

  it("gives every hospital without prices a plain reason", () => {
    const skipped = (data as { skipped: Record<string, { reason: string }> }).skipped;
    const hand = new Set(["priscilla-chan-mark-zuckerberg-san-francisco-general-hospital-trauma-center", "ucsf-medical-center",
      "california-pacific-medical-center-van-ness-campus", "st-francis-memorial-hospital"]);
    for (const h of HOSPITALS) {
      if (hand.has(h.key)) continue;
      if (hasStatewidePrices(h.key)) {
        expect(priceGap(h.key)).toBeNull();
        expect(skipped[h.key]).toBeUndefined();
      } else {
        expect(["notFound", "notNamed", "unreadable", "noCodes"]).toContain(skipped[h.key]?.reason);
        expect(pricedRefFromIndex(h).priceGap).toBe(skipped[h.key].reason);
      }
    }
  });

  it("reads the hand-checked SF files the same way (pipeline/check_against_snapshots.py)", () => {
    const c = snapshotCheck as { compared: number; same: number; lower: number; snapshots: Record<string, unknown> };
    expect(Object.keys(c.snapshots).length).toBe(4);
    expect(c.compared).toBeGreaterThanOrEqual(75);
    expect(c.lower).toBe(0);
    expect(c.same / c.compared).toBeGreaterThan(0.95);
  });

  it("matches a second, independent reader of the same files (spot checks)", () => {
    const spot = spotChecks as { hospitals: Record<string, { url: string; codes: Record<string, { app: number; secondReader: number | null }> }> };
    const hospitals = (data as { hospitals: Record<string, { url: string; prices: Record<string, { grossCharge: number }> }> }).hospitals;
    expect(Object.keys(spot.hospitals).length).toBeGreaterThanOrEqual(10);
    for (const [k, s] of Object.entries(spot.hospitals)) {
      const h = hospitals[k];
      expect(h?.url, k).toBe(s.url);
      for (const [code, c] of Object.entries(s.codes)) {
        expect(h.prices[code].grossCharge, `${k} ${code}`).toBe(c.app);
        // The app's price is never below the highest matching row the second reader found.
        if (c.secondReader != null) expect(c.app, `${k} ${code}`).toBeGreaterThanOrEqual(c.secondReader);
      }
    }
  });

  it("flags a charge above the published list price", () => {
    const h = HOSPITALS.find((x) => hasStatewidePrices(x.key))!;
    const ref = pricedRefFromIndex(h);
    const [code, row] = Object.entries(ref.mrf!.prices)[0];
    const bill = {
      hospitalName: h.name, hospitalAddress: null, patientName: null, patientAddress: null, accountNumber: null,
      serviceDate: null, statementDate: null, insurance: null, totalCharges: row.grossCharge! * 2, adjustments: null,
      payments: null, amountDue: row.grossCharge! * 2, unreadable: [],
      lines: [{ date: null, code, description: "test", qty: 1, charge: row.grossCharge! * 2, chargePrinted: null }],
    };
    const findings = checkBill(bill as never, ref, "en");
    expect(findings.some((f) => f.amount > 0)).toBe(true);
  });
});
