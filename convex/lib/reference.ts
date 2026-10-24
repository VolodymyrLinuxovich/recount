// Reference data. Every number here comes from a sourced file (see pipeline/README.md).

import type { FplTable } from "./eligibility";
import type { HospitalRef } from "./hospital";
import zsfg from "./snapshots/zsfg.json";
import ucsf from "./snapshots/ucsf.json";
import cpmc from "./snapshots/cpmc.json";
import saintfrancis from "./snapshots/saintfrancis.json";

// 2026 HHS poverty guidelines, 48 contiguous states + DC (Federal Register, 2026-01-15).
export const FPL: FplTable = {
  year: 2026,
  source: "https://www.govinfo.gov/content/pkg/FR-2026-01-15/pdf/2026-00755.pdf",
  base: 15960,
  perAdditional: 5680,
};

/** Hospitals we know how to look up, matched by name on the bill. */
export const KNOWN_HOSPITALS: { key: string; name: string; url: string; match: RegExp; hcai: string[]; live: boolean }[] = [
  { key: "zsfg", name: "Zuckerberg San Francisco General", url: "https://zuckerbergsanfranciscogeneral.org", match: /zuckerberg|sf general|san francisco general|zsfg/i, hcai: ["priscilla-chan-mark-zuckerberg-san-francisco-general-hospital-trauma-center", "zsfg"], live: true },
  { key: "ucsf", name: "UCSF Medical Center", url: "https://www.ucsfhealth.org", match: /ucsf (helen diller )?medical center|ucsf.*(parnassus|mission bay)|university of california,? san francisco medical/i, hcai: ["ucsf-medical-center", "ucsf"], live: true },
  { key: "cpmc", name: "CPMC Van Ness Campus (Sutter)", url: "https://www.sutterhealth.org", match: /cpmc.*van ness|california pacific medical center.*van ness|van ness campus/i, hcai: ["california-pacific-medical-center-van-ness-campus", "cpmc_vanness"], live: true },
  { key: "saintfrancis", name: "Saint Francis Memorial Hospital", url: "https://www.ucsfhealth.org", match: /(saint|st\.?) francis memorial|hyde street/i, hcai: ["st-francis-memorial-hospital", "stfrancis_hyde"], live: false },
];

/** Price-file extracts made by pipeline/build_snapshots.py, used when a live Actor run isn't possible. */
export const SNAPSHOTS: Record<string, HospitalRef> = {
  zsfg: zsfg as unknown as HospitalRef,
  ucsf: ucsf as unknown as HospitalRef,
  cpmc: cpmc as unknown as HospitalRef,
  saintfrancis: saintfrancis as unknown as HospitalRef,
};

import audit from "./auditFindings.json";

export interface PolicyFinding {
  rule: string;
  verdict: "conflict" | "likely" | "ask";
  quote: string;
  page: number | null;
  docType: string;
  docUrl: string | null;
  effectiveDate: string | null;
  explanation: string;
}

/** Problems our statewide audit found in this hospital's own policies (see audit/). */
export function policyFindingsFor(key: string): PolicyFinding[] {
  const h = KNOWN_HOSPITALS.find((x) => x.key === key);
  const all = (audit as { hospitals: Record<string, PolicyFinding[]> }).hospitals;
  for (const k of h?.hcai ?? [key]) if (all[k]) return all[k];
  return [];
}
