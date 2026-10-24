// A made-up ER bill for the demo. The patient is fictional. Charges are Zuckerberg San
// Francisco General's own published gross charges (CMS price file, updated 2026-03-19),
// with two planted problems: the CBC is billed twice, and the chest x-ray is billed at
// $482 although the published charge is $402.
// sampleBill.json is the single source: public/sample-bill.png is rendered from it with
//   eval/.venv/bin/python -I eval/render.py convex/lib/sampleBill.json --out public/sample-bill
//
// sampleEob.json is a made-up insurance statement (EOB) for the same visit, from a fictional
// insurer, "Golden Bear Health Plan HMO". The plan got the claim with one CBC (so the second
// CBC on the bill is the hospital's double entry) and the x-ray at the billed $482 (the plan
// only allows $78 of it anyway). The plan paid $2,050 and says Alex owes $537: the $250 ER copay
// plus a $287 EKG it denied as not medically necessary. The bill shows no insurance payment and
// asks for $12,741. So the demo shows: the hospital asks for more than the EOB says (with the
// missing plan payment as evidence), and one denied line to appeal.
// public/sample-eob.png is rendered from it.

import type { ParsedBill } from "./bill";
import type { ParsedEob } from "./eob";
import sample from "./sampleBill.json";
import sampleEob from "./sampleEob.json";

export const SAMPLE_BILL: ParsedBill = sample as ParsedBill;
export const SAMPLE_EOB: ParsedEob = sampleEob as ParsedEob;
