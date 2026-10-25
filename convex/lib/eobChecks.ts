// Fixed rules that compare a bill with the insurance statement (EOB) for the same visit.
// No model is involved here: the model only read the EOB. Rules 1 to 7 follow docs/EOB.md,
// in the same order. eval/eob/eobchecks.py mirrors checkEob; keep the two in sync.

import type { ParsedBill } from "./bill";
import { checkBill, type Evidence, type Finding, potentialSavings } from "./checks";
import { CO_DENIAL, type EobLine, isoDate, type ParsedEob } from "./eob";
import { normalizeCode, type HospitalRef } from "./hospital";
import { type Lang, money, pick } from "./lang";

const cents = (x: number) => Math.round(x * 100);
const r2 = (x: number) => cents(x) / 100;
/** "More than" in docs/EOB.md: more by at least $1.00, compared in cents. */
const more = (a: number, b: number) => cents(a) - cents(b) >= 100;

/** What the bill asks the patient to pay now. */
export function billDue(bill: ParsedBill): number | null {
  if (bill.amountDue != null) return bill.amountDue;
  if (bill.totalCharges == null) return null;
  return bill.totalCharges - (bill.insurancePaid ?? 0) - (bill.adjustments ?? 0) - (bill.patientPaid ?? 0);
}

/** What the EOB says the patient owes in total, or null if it doesn't say. */
export function eobOwes(eob: ParsedEob): number | null {
  if (eob.totalPatientOwes != null) return eob.totalPatientOwes;
  const vals = eob.lines.map((l) => l.patientOwes).filter((x): x is number => x != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

// Words many unrelated hospitals share, so they can't show two names are the same place.
const STOP_WORDS = new Set([
  "hospital", "medical", "center", "health", "the",
  "memorial", "community", "general", "francisco", "regional", "university", "saint",
]);

/** Name words of 4+ letters, without the generic ones every hospital has. */
function nameWords(s: string | null | undefined): Set<string> {
  const plain = (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return new Set((plain.match(/[a-z]+/g) ?? []).filter((w) => w.length >= 4 && !STOP_WORDS.has(w)));
}

const DAY = 86_400_000;
function day(raw: string | null | undefined): number | null {
  // Bill dates are copied as printed (e.g. 03/01/2025), so normalize them first.
  const s = isoDate(raw);
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const t = Date.parse(s.slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(t) ? t : null;
}

const plainWords = (s: string | null | undefined): string[] =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z]+/g) ?? [];
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

/** A person's last name, from "Pat Doe" or "DOE, PAT". Null when it can't tell. */
function lastName(s: string | null | undefined): string | null {
  const comma = (s ?? "").includes(",");
  const words = plainWords(comma ? s!.split(",")[0] : s).filter((w) => !SUFFIXES.has(w));
  if (!words.length || (!comma && words.length < 2)) return null;
  return words[words.length - 1];
}

/** Why the EOB looks like it is for a different visit, or null if it matches. */
function mismatchReason(bill: ParsedBill, eob: ParsedEob, otherNames: string[]): "dates" | "provider" | "patient" | null {
  const billDays = [bill.serviceDate, ...bill.lines.map((l) => l.date)].map(day).filter((d): d is number => d != null);
  let from = day(eob.serviceDateFrom);
  let to = day(eob.serviceDateTo);
  from ??= to;
  to ??= from;
  if (billDays.length && from != null && to != null) {
    const slack = 3 * DAY;
    if (from > Math.max(...billDays) + slack || to < Math.min(...billDays) - slack) return "dates";
  }
  const names = [bill.hospitalName, ...otherNames].filter((n): n is string => !!n);
  if (eob.providerName && names.length) {
    const eobWords = nameWords(eob.providerName);
    const billWords = names.map(nameWords).filter((ws) => ws.size > 0);
    // Only generic words on one side (e.g. "General Hospital"): we can't tell, so don't flag it.
    const shared = !eobWords.size || !billWords.length || billWords.some((ws) => [...ws].some((w) => eobWords.has(w)));
    if (!shared) return "provider";
  }
  // Different patient: the last names clearly differ (neither name has the other's last name in it).
  const member = lastName(eob.memberName);
  const patient = lastName(bill.patientName);
  if (member && patient && !plainWords(bill.patientName).includes(member) && !plainWords(eob.memberName).includes(patient)) return "patient";
  return null;
}

/** Emergency care: marked on the EOB, or an ER revenue code, ER visit code or "emergency" on the bill. */
export function erVisit(bill: ParsedBill, eob: ParsedEob): boolean {
  if (eob.emergency === true) return true;
  return bill.lines.some((l) => {
    const rc = (l.revCode ?? "").replace(/\D/g, "");
    if (rc && Number(rc) >= 450 && Number(rc) <= 459) return true;
    const c = normalizeCode(l.code);
    if (c && /^\d+$/.test(c) && Number(c) >= 99281 && Number(c) <= 99285) return true;
    return /emergency/i.test(l.description ?? "");
  });
}

/** Medi-Cal and Medicare have their own appeal steps (not DMHC). */
function publicPlan(eob: ParsedEob): boolean {
  return /medi-?\s?cal|medicare|medicaid/i.test(`${eob.planType ?? ""} ${eob.payer ?? ""}`);
}

/** Bill lines whose code or revenue code matches one of these EOB codes. */
function billLinesFor(bill: ParsedBill, codes: Set<string>): number[] {
  const out: number[] = [];
  bill.lines.forEach((l, i) => {
    const c = normalizeCode(l.code);
    const rc = normalizeCode(l.revCode);
    if ((c && codes.has(c)) || (rc && codes.has(rc))) out.push(i);
  });
  return out;
}

/**
 * Compare a bill with its insurance statement. `otherNames` are more names for the hospital
 * (e.g. the matched hospital's official name) used only by the "different visit" check.
 */
export function checkEob(bill: ParsedBill, eob: ParsedEob, lang: Lang = "en", otherNames: string[] = []): Finding[] {
  const t = pick(lang);
  const out: Finding[] = [];
  const payer = eob.payer ?? t("your insurance", "su seguro");
  const eobSrc = eob.claimNumber
    ? t(`EOB from ${payer}, claim ${eob.claimNumber}`, `EOB de ${payer}, reclamo ${eob.claimNumber}`)
    : t(`EOB from ${payer}`, `EOB de ${payer}`);
  const billSrc = bill.accountNumber
    ? t(`Your bill, account ${bill.accountNumber}`, `Su factura, cuenta ${bill.accountNumber}`)
    : t("Your bill", "Su factura");

  // 1. Wrong statement: stop. Wrong statement, wrong conclusions.
  const why = mismatchReason(bill, eob, otherNames);
  if (why) {
    const eobDates = [eob.serviceDateFrom, eob.serviceDateTo].filter(Boolean);
    const range = eobDates.length ? [...new Set(eobDates)].join(t(" to ", " a ")) : t("not printed", "no aparece");
    return [
      {
        id: "eob-mismatch",
        kind: "EOB_MISMATCH",
        lines: [],
        amount: 0,
        title: t("This insurance statement may be for a different visit", "Este estado del seguro puede ser de otra visita"),
        detail:
          why === "dates"
            ? t(
                "The dates on the insurance statement don't match the dates on your bill. Please check that you added the statement for this visit. We didn't compare it with your bill.",
                "Las fechas del estado del seguro no coinciden con las de su factura. Revise que agregó el estado de esta visita. No lo comparamos con su factura.",
              )
            : why === "patient"
              ? t(
                  "The member name on the insurance statement doesn't match the patient on your bill. Please check that you added the statement for this visit. We didn't compare it with your bill.",
                  "El nombre del miembro en el estado del seguro no coincide con el paciente de su factura. Revise que agregó el estado de esta visita. No lo comparamos con su factura.",
                )
              : t(
                  "The provider on the insurance statement doesn't look like the hospital on your bill. Please check that you added the statement for this visit. We didn't compare it with your bill.",
                  "El proveedor del estado del seguro no parece ser el hospital de su factura. Revise que agregó el estado de esta visita. No lo comparamos con su factura.",
                ),
        evidence:
          why === "dates"
            ? [
                { label: t("Dates on the insurance statement", "Fechas en el estado del seguro"), value: range, source: eobSrc },
                { label: t("Date of service on your bill", "Fecha del servicio en su factura"), value: bill.serviceDate ?? bill.lines.find((l) => l.date)?.date ?? t("not printed", "no aparece"), source: billSrc },
              ]
            : why === "patient"
              ? [
                  { label: t("Member on the insurance statement", "Miembro en el estado del seguro"), value: eob.memberName ?? "", source: eobSrc },
                  { label: t("Patient on your bill", "Paciente en su factura"), value: bill.patientName ?? "", source: billSrc },
                ]
              : [
                  { label: t("Provider on the insurance statement", "Proveedor en el estado del seguro"), value: eob.providerName ?? "", source: eobSrc },
                  { label: t("Hospital on your bill", "Hospital en su factura"), value: bill.hospitalName ?? t("not printed", "no aparece"), source: billSrc },
                ],
        confidence: "check",
      },
    ];
  }

  // 2. The insurer hasn't finished the claim: stop.
  if (eob.claimStatus === "pending") {
    return [
      {
        id: "eob-pending",
        kind: "CLAIM_PENDING",
        lines: [],
        amount: 0,
        title: t("Your insurance hasn't finished this claim", "Su seguro todavía no termina este reclamo"),
        detail: t(
          `${payer} is still processing this claim. Don't pay the hospital until it finishes. Ask the hospital to hold the bill and not send it to collections until then.`,
          `${payer} todavía está procesando este reclamo. No le pague al hospital hasta que termine. Pida al hospital que detenga la factura y no la mande a cobranzas mientras tanto.`,
        ),
        evidence: [{ label: t("Claim status", "Estado del reclamo"), value: t("Pending", "Pendiente"), source: eobSrc }],
        confidence: "high",
      },
    ];
  }

  const due = billDue(bill);
  const owes = eobOwes(eob);
  const still = owes != null ? Math.max(0, owes - (bill.patientPaid ?? 0)) : null;
  const over = due != null && still != null && more(due, still);
  const planPaid = eob.totalPlanPaid;
  const notApplied = planPaid != null && planPaid > 0 && (bill.insurancePaid ?? 0) === 0;
  // Rule 5's amount: what the bill asks for above what the EOB says (the bill may already net
  // the plan's payment without listing it). Without the EOB's number, up to what the plan paid.
  const notAppliedAmount = notApplied
    ? r2(Math.max(0, due != null ? (still != null ? due - still : Math.min(planPaid!, due)) : planPaid!))
    : 0;

  const owesEvidence = (): Evidence[] => [
    { label: t("Your insurance says you owe", "Su seguro dice que usted debe"), value: money(owes!), source: eobSrc },
    ...((bill.patientPaid ?? 0) > 0
      ? [{ label: t("You already paid", "Usted ya pagó"), value: money(bill.patientPaid), source: billSrc }]
      : []),
    { label: t("The hospital is asking for", "El hospital le cobra"), value: money(due!), source: billSrc },
  ];
  const notAppliedEvidence = (): Evidence => ({
    label: t("Insurance payment", "Pago del seguro"),
    value: t(
      `Your plan paid ${money(planPaid!)}, and the bill shows no insurance payment`,
      `Su plan pagó ${money(planPaid!)}, y la factura no muestra ningún pago del seguro`,
    ),
    source: eobSrc,
  });

  // 3. Out-of-network emergency care billed above in-network cost sharing (No Surprises Act).
  if (over && eob.network === "out" && erVisit(bill, eob)) {
    const amount = r2(due! - still!);
    out.push({
      id: "eob-surprise",
      kind: "SURPRISE_BILL",
      lines: [],
      amount,
      title: t("This looks like a surprise bill for emergency care", "Esto parece una factura sorpresa por atención de emergencia"),
      detail: t(
        `Your insurance says you owe ${money(still!)}. The hospital is asking for ${money(due!)}. For emergency care, a hospital that is out of your network can't bill you more than your in-network cost sharing. That is the federal No Surprises Act (Public Health Service Act section 2799B-1, 42 U.S.C. 300gg-131). Ask the hospital to correct the bill to the amount on your insurance statement. For help, call the federal No Surprises Help Desk at 1-800-985-3059.`,
        `Su seguro dice que usted debe ${money(still!)}. El hospital le cobra ${money(due!)}. En una emergencia, un hospital fuera de su red no le puede cobrar más de lo que pagaría dentro de la red. Así lo dice la ley federal contra facturas sorpresa, No Surprises Act (Ley del Servicio de Salud Pública, sección 2799B-1, 42 U.S.C. 300gg-131). Pida al hospital que corrija la factura al monto de su estado del seguro. Para ayuda, llame a la línea federal No Surprises Help Desk al 1-800-985-3059.`,
      ),
      evidence: [
        ...owesEvidence(),
        { label: t("Network", "Red"), value: t("Out of network", "Fuera de la red"), source: eobSrc },
        { label: t("Type of care", "Tipo de atención"), value: t("Emergency", "Emergencia"), source: eob.emergency ? eobSrc : billSrc },
        ...(notApplied ? [notAppliedEvidence()] : []),
      ],
      confidence: "high",
    });
  } else if (over) {
    // 4. The bill asks for more than the EOB says the patient owes.
    const amount = r2(due! - still!);
    const tail =
      eob.network === "in"
        ? t(
            " The hospital is in your plan's network. In-network providers agree not to bill you above the plan's allowed amount. Ask the hospital to correct the bill to the amount on your insurance statement.",
            " El hospital está en la red de su plan. Los proveedores de la red aceptan no cobrarle más que el monto permitido por el plan. Pida al hospital que corrija la factura al monto de su estado del seguro.",
          )
        : t(
            " Ask the hospital to explain the difference, and not to send the bill to collections while you ask.",
            " Pida al hospital que le explique la diferencia, y que no mande la factura a cobranzas mientras pregunta.",
          );
    out.push({
      id: "eob-owes-more",
      kind: "OWES_MORE_THAN_EOB",
      lines: [],
      amount,
      title: t("The hospital asks for more than your insurance says you owe", "El hospital cobra más de lo que su seguro dice que usted debe"),
      detail:
        t(
          `Your insurance says you owe ${money(still!)}. The hospital is asking for ${money(due!)}.`,
          `Su seguro dice que usted debe ${money(still!)}. El hospital le cobra ${money(due!)}.`,
        ) +
        (notApplied
          ? t(
              ` Your plan paid ${money(planPaid!)}, but the bill doesn't show that payment.`,
              ` Su plan pagó ${money(planPaid!)}, pero la factura no muestra ese pago.`,
            )
          : "") +
        tail,
      evidence: [
        ...owesEvidence(),
        ...(eob.network === "in" ? [{ label: t("Network", "Red"), value: t("In network", "Dentro de la red"), source: eobSrc }] : []),
        ...(notApplied ? [notAppliedEvidence()] : []),
      ],
      confidence: "high",
    });
  } else if (notApplied && notAppliedAmount > 0) {
    // 5. The plan paid, but the bill doesn't show it. Only when 3 and 4 didn't fire,
    // so the same dollars never count twice.
    const amount = notAppliedAmount;
    out.push({
      id: "eob-not-applied",
      kind: "INSURANCE_NOT_APPLIED",
      lines: [],
      amount,
      title: t("Your insurance payment isn't on the bill", "El pago de su seguro no aparece en la factura"),
      detail: t(
        `Your plan paid ${money(planPaid!)} for this visit, but the bill shows no insurance payment. Ask the hospital to apply the payment and send you a corrected bill.`,
        `Su plan pagó ${money(planPaid!)} por esta visita, pero la factura no muestra ningún pago del seguro. Pida al hospital que aplique el pago y le mande una factura corregida.`,
      ),
      evidence: [
        { label: t("Your plan paid", "Su plan pagó"), value: money(planPaid!), source: eobSrc },
        { label: t("Insurance payment on the bill", "Pago del seguro en la factura"), value: money(bill.insurancePaid ?? 0), source: billSrc },
      ],
      confidence: "high",
    });
  }

  // 6. Bill lines the EOB doesn't list: maybe never sent to insurance.
  const eobCodes = new Set(eob.lines.map((l) => normalizeCode(l.code)).filter((c): c is string => !!c));
  if (eobCodes.size) {
    bill.lines.forEach((l, i) => {
      const c = normalizeCode(l.code);
      if (!c) return;
      const rc = normalizeCode(l.revCode);
      if (eobCodes.has(c) || (rc && eobCodes.has(rc))) return;
      out.push({
        id: `eob-not-on-${i}`,
        kind: "NOT_ON_EOB",
        lines: [i],
        amount: 0,
        title: t(`${l.description} isn't on your insurance statement`, `${l.description} no aparece en su estado del seguro`),
        detail: t(
          `Line ${i + 1} of your bill (code ${c}) isn't on the insurance statement. Ask the hospital whether this charge was sent to your insurance.`,
          `La línea ${i + 1} de su factura (código ${c}) no aparece en el estado del seguro. Pregunte al hospital si mandó este cargo a su seguro.`,
        ),
        evidence: [
          { label: t("On your bill", "En su factura"), value: `${c} · ${money(l.charge)}`, source: billSrc },
          { label: t("On the insurance statement", "En el estado del seguro"), value: t("Not listed", "No aparece"), source: eobSrc },
        ],
        confidence: "check",
      });
    });
  }

  // 7. The plan denied or didn't cover lines: the patient can appeal to the insurer.
  const denied = eob.lines.filter((l) => (l.notCovered ?? 0) > 0);
  if (denied.length || eob.claimStatus === "denied" || eob.claimStatus === "partly_denied") {
    // Per line, only the part the patient is asked to pay: an out-of-network "not covered"
    // amount above what the patient owes is already in the surprise bill / owes more gap.
    let amount = r2(denied.reduce((a, l) => a + Math.min(l.notCovered ?? 0, l.patientOwes ?? Infinity), 0));
    if (eob.claimStatus === "denied" && !denied.length) amount = r2(eob.totalPatientOwes ?? 0);
    // With the money finding above, never count more than the bill asks for in total.
    if (due != null) amount = r2(Math.max(0, Math.min(amount, due - out.reduce((a, f) => a + f.amount, 0))));
    const codes = new Set(denied.map((l) => normalizeCode(l.code)).filter((c): c is string => !!c));
    // No line amounts: show only lines with a denial (CO-) code, never a copay or deductible remark.
    const shown: EobLine[] = denied.length ? denied : eob.lines.filter((l) => l.remark && CO_DENIAL.test(l.remark)).slice(0, 10);
    const lineEvidence: Evidence[] = shown.map((l) => ({
      label: l.description,
      value: [money(l.notCovered ?? l.billed ?? 0), l.remark].filter(Boolean).join(" · "),
      source: eobSrc,
    }));
    const whole = eob.claimStatus === "denied";
    const appeal = publicPlan(eob)
      ? t(
          " Follow the appeal steps on your statement.",
          " Siga los pasos para apelar que vienen en su estado del seguro.",
        )
      : t(
          " In California, after the plan's own appeal (or right away if it's urgent), you can ask the state for an Independent Medical Review. For HMOs and most plans, that's the DMHC: 1-888-466-2219, healthhelp.ca.gov. For some PPO policies, it's the Department of Insurance: 1-800-927-4357.",
          " En California, después de la apelación con su plan (o de inmediato si es urgente), puede pedir al estado una Revisión Médica Independiente. Para HMO y la mayoría de los planes, es el DMHC: 1-888-466-2219, healthhelp.ca.gov. Para algunas pólizas PPO, es el Departamento de Seguros: 1-800-927-4357.",
        );
    out.push({
      id: "eob-denied",
      kind: "DENIED_BY_PLAN",
      lines: billLinesFor(bill, codes),
      amount,
      title: whole
        ? t("Your insurance denied this claim", "Su seguro negó este reclamo")
        : t("Your insurance denied part of this visit", "Su seguro negó parte de esta visita"),
      detail:
        (whole
          ? t(`${payer} denied this claim.`, `${payer} negó este reclamo.`)
          : !denied.length
            ? t(`${payer} denied part of this claim.`, `${payer} negó parte de este reclamo.`)
            : t(
              `${payer} didn't cover ${denied.length === 1 ? "1 service" : `${denied.length} services`}${amount ? ` (${money(amount)})` : ""}.`,
              `${payer} no cubrió ${denied.length === 1 ? "1 servicio" : `${denied.length} servicios`}${amount ? ` (${money(amount)})` : ""}.`,
            )) +
        t(" You can appeal to your insurance and ask them to pay.", " Usted puede apelar a su seguro y pedir que paguen.") +
        (eob.appealDeadline ? t(` Appeal deadline: ${eob.appealDeadline}.`, ` Plazo para apelar: ${eob.appealDeadline}.`) : "") +
        appeal,
      evidence: [
        ...lineEvidence,
        ...(eob.appealDeadline ? [{ label: t("Appeal deadline", "Plazo para apelar"), value: eob.appealDeadline, source: eobSrc }] : []),
        ...(eob.appealAddress ? [{ label: t("Send appeals to", "Mande la apelación a"), value: eob.appealAddress, source: eobSrc }] : []),
      ],
      confidence: "high",
    });
  }

  return out;
}

/**
 * Whether the case's EOB shows the patient is insured: there is one, it was read, and it is
 * for this visit (no EOB_MISMATCH). Then the household answer "insured" must be yes.
 */
export function eobShowsInsured(bill: ParsedBill, hospital: HospitalRef | null, eob: ParsedEob | null | undefined): boolean {
  if (!eob || eob.isEob === false) return false;
  return !checkEob(bill, eob, "en", hospital?.name ? [hospital.name] : []).some((f) => f.kind === "EOB_MISMATCH");
}

/** Kinds whose amount resets what the patient owes to the EOB's number. */
const RESETS = new Set(["SURPRISE_BILL", "OWES_MORE_THAN_EOB", "INSURANCE_NOT_APPLIED"]);

/**
 * Every finding for a case: the bill checks, plus the EOB checks when there is one.
 * Each dollar counts once in potentialSavings:
 * - With a usable EOB the patient is insured, so the self-pay cash price check is off.
 * - When an EOB finding resets what the patient owes (rules 3 to 5), the bill's own line
 *   amounts are part of that gap, so they show $0 and say so.
 * - A bill line the plan denied is counted in the appeal finding, not twice.
 */
export function allFindings(bill: ParsedBill, hospital: HospitalRef | null, eob: ParsedEob | null | undefined, lang: Lang = "en"): Finding[] {
  if (!eob || eob.isEob === false) return checkBill(bill, hospital, lang);
  const t = pick(lang);
  const fromEob = checkEob(bill, eob, lang, hospital?.name ? [hospital.name] : []);
  if (fromEob.some((f) => f.kind === "EOB_MISMATCH")) return [...checkBill(bill, hospital, lang), ...fromEob];
  const insured = bill.insurancePayer ? bill : { ...bill, insurancePayer: eob.payer ?? "insurance" };
  const fromBill = checkBill(insured, hospital, lang);
  const resets = fromEob.some((f) => RESETS.has(f.kind));
  const denied = new Set(fromEob.find((f) => f.kind === "DENIED_BY_PLAN")?.lines ?? []);
  for (const f of fromBill) {
    if (f.amount <= 0) continue;
    if (resets) {
      f.amount = 0;
      f.detail += t(
        " Your insurance statement sets what you owe, so this amount is already counted in the insurance finding.",
        " Su estado del seguro fija lo que usted debe, así que este monto ya está contado en el hallazgo del seguro.",
      );
    } else if (f.lines.some((i) => denied.has(i))) {
      f.amount = 0;
      f.detail += t(
        " Your insurance denied this service, so its amount is counted in the appeal.",
        " Su seguro negó este servicio, así que su monto está contado en la apelación.",
      );
    }
  }
  // The bill findings can't save more than the patient still owes per the EOB (and the bill),
  // less what the EOB findings already count. Scale them down to fit when they'd go over.
  const owes = eobOwes(eob);
  const due = billDue(bill);
  const still = owes != null ? Math.max(0, owes - (bill.patientPaid ?? 0)) : null;
  const ceilings = [still, due].filter((x): x is number => x != null);
  if (!resets && ceilings.length) {
    const ceiling = Math.min(...ceilings);
    const room = Math.max(0, ceiling - potentialSavings(fromEob));
    const total = potentialSavings(fromBill);
    if (total > room) {
      const k = room / total;
      const why =
        still != null && ceiling === still
          ? t(
              ` Your insurance statement says you owe ${money(ceiling)}, so all findings together count at most that much.`,
              ` Su estado del seguro dice que usted debe ${money(ceiling)}, así que todos los hallazgos juntos cuentan como máximo ese monto.`,
            )
          : t(
              ` The bill asks for ${money(ceiling)}, so all findings together count at most that much.`,
              ` La factura le cobra ${money(ceiling)}, así que todos los hallazgos juntos cuentan como máximo ese monto.`,
            );
      for (const f of fromBill) {
        if (f.amount <= 0) continue;
        f.amount = Math.floor(f.amount * k * 100 + 1e-6) / 100; // round down, so the total never goes over
        f.detail += why;
      }
    }
  }
  return [...fromBill, ...fromEob];
}
