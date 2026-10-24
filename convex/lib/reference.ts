// Reference data. Values here come from sourced files in data/ (see data/README.md).
// PROVISIONAL until the sourced files land: FPL below is the 2025 HHS guideline.

import type { FplTable } from "./eligibility";
import type { HospitalRef } from "./hospital";

export const FPL: FplTable = {
  year: 2025,
  source: "https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines",
  base: 15650,
  perAdditional: 5500,
};

/** Hospitals we know how to look up, matched by name on the bill. */
export const KNOWN_HOSPITALS: { key: string; name: string; url: string; match: RegExp }[] = [
  { key: "zsfg", name: "Zuckerberg San Francisco General", url: "https://zuckerbergsanfranciscogeneral.org", match: /zuckerberg|sf general|san francisco general|zsfg/i },
  { key: "ucsf", name: "UCSF Medical Center", url: "https://www.ucsfhealth.org", match: /ucsf/i },
  { key: "cpmc", name: "CPMC Van Ness Campus (Sutter)", url: "https://www.sutterhealth.org", match: /cpmc|california pacific|sutter/i },
  { key: "saintfrancis", name: "Saint Francis Memorial Hospital", url: "https://www.dignityhealth.org", match: /saint francis|st\.? francis/i },
];

/** Saved Actor runs, used when a live run isn't possible. Filled from data/hospitals/*.json. */
export const SNAPSHOTS: Record<string, HospitalRef> = {};
