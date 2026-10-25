// Fixed results behind the dashboard's "checks" section and the MCP tool get_validation_results.
// Each has the file or script it comes from, so anyone can re-run it.

export const VALIDATION = [
  {
    id: "planted-errors",
    result: "24 of 24 planted billing errors caught, 0 false alarms on clean bills",
    what: "Synthetic San Francisco ER bills priced from each hospital's real published charges, with known errors planted, checked by the rules in code.",
    source: "eval/ (generate.py, score.py), convex/lib/checks.ts",
  },
  {
    id: "batch-prices",
    result: "73 of 75 prices matched our hand-checked prices exactly; the other 2 were higher, never lower",
    what: "Prices our Apify Actor read in the statewide run, compared with prices we verified by hand for the same hospitals and codes.",
    source: "pipeline/build_statewide_prices.py, convex/lib/statewidePrices.json",
  },
  {
    id: "price-coverage",
    result: "Line-by-line price checks for 240 of 470 California hospitals",
    what: "236 hospitals from one statewide run of our Apify Actor (only files that name the hospital), plus 4 San Francisco hospitals checked by hand.",
    source: "convex/lib/statewidePrices.json, convex/lib/snapshots/",
  },
  {
    id: "policy-audit",
    result: "470 hospital policies read; 2,333 documents; 997 candidate sentences reviewed twice where flagged",
    what: "Every California hospital's charity care and collection policies on file with the state (HCAI), checked against the 2025 law changes. The same 997 sentences are what Lupa's vector search finds.",
    source: "audit/ (crawl.py, extract.py, verify.py, index_search.py)",
  },
] as const;

export const STACK = {
  search: { index: "recount-policies", passages: 997, hospitals: 442, embedding: "text-embedding-3-small", engine: "Azure AI Search (vector + keyword)" },
  actor: { id: "NXiKTRZKK6p6qCSXk", name: "hospital-price-and-charity-finder", store: "https://apify.com/enterprising_arboretum_iq2/hospital-price-and-charity-finder" },
  convex: { deployment: "zealous-grouse-384" },
} as const;
