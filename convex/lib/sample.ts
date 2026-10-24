// A made-up ER bill for the demo. The patient is fictional. Charges are Zuckerberg San
// Francisco General's own published gross charges (CMS price file, updated 2026-03-19),
// with two planted problems: the CBC is billed twice, and the chest x-ray is billed at
// $482 although the published charge is $402.
// sampleBill.json is the single source: public/sample-bill.png is rendered from it with
//   eval/.venv/bin/python -I eval/render.py convex/lib/sampleBill.json --out public/sample-bill

import type { ParsedBill } from "./bill";
import sample from "./sampleBill.json";

export const SAMPLE_BILL: ParsedBill = sample as ParsedBill;
