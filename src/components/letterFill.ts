// The patient's own details, typed once and put into the [brackets] of the English letters.
import type { Letter } from "./types";

export interface Details {
  name: string;
  street: string;
  city: string;
  phone: string;
  email: string;
  dob: string;
}

export type Slot = keyof Details | "address" | "date";

export const EMPTY_DETAILS: Details = { name: "", street: "", city: "", phone: "", email: "", dob: "" };

const key = (id: string) => `recount.details.${id}`;

export function readDetails(id: string): Partial<Details> | null {
  try {
    const raw = window.localStorage.getItem(key(id));
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const out: Partial<Details> = {};
    for (const k of Object.keys(EMPTY_DETAILS) as (keyof Details)[]) {
      const v = (data as Record<string, unknown>)[k];
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

export function saveDetails(id: string, d: Details) {
  try {
    if (Object.values(d).some((v) => v.trim())) window.localStorage.setItem(key(id), JSON.stringify(d));
    else window.localStorage.removeItem(key(id));
  } catch {
    // Storage is blocked; the details stay on screen for this visit.
  }
}

const BRACKET = /\[([^\]\n]{1,80})\]/g;

/** Which of the patient's details a bracket asks for, or null when it's something else (an amount, the hospital's address…). */
export function slotOf(label: string): Slot | null {
  const x = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']s\b/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Someone else's details are not the patient's.
  if (/\b(hospital|billing|office|facility|department|provider|insurer|insurance|agency|collector|clinic|doctor|physician)\b/.test(x)) return null;
  if (/\b(e ?mail|correo electronico)\b/.test(x)) return "email";
  if (/\b(date of birth|dob|birth ?date|birthday|fecha de nacimiento)\b/.test(x)) return "dob";
  if (/\b(phone|telephone|cell|mobile|telefono|celular)\b/.test(x)) return "phone";
  const addr = /\b(address|street|direccion|calle)\b/.test(x);
  const city = /\b(city|state|zip|zip code|postal|ciudad|estado|codigo postal)\b/.test(x);
  if (addr && city) return "address";
  if (addr) return "street";
  if (city) return "city";
  if (/^(today )?date$|^today$|^fecha( de hoy)?$/.test(x)) return "date";
  if (/^(your |patient |the patient |printed |full |your full |your printed |patient full )*name$/.test(x)) return "name";
  if (/^(su )?nombre( completo| del paciente)?$/.test(x)) return "name";
  return null;
}

function valueFor(slot: Slot, d: Details, today: string): string {
  switch (slot) {
    case "address":
      return d.street.trim() && d.city.trim() ? `${d.street.trim()}, ${d.city.trim()}` : "";
    case "date":
      return today;
    default:
      return d[slot].trim();
  }
}

const usToday = () => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/** Put the patient's details into the matching [brackets]. Brackets with nothing to put in stay. */
export function fillText(text: string, d: Details, today = usToday()): string {
  return text.replace(BRACKET, (whole, label: string) => {
    const slot = slotOf(label);
    if (!slot) return whole;
    return valueFor(slot, d, today) || whole;
  });
}

export function fillLetter(l: Letter, d: Details): Letter {
  const today = usToday();
  return {
    ...l,
    subject: fillText(l.subject, d, today),
    body: fillText(l.body, d, today),
    // The Spanish copy shows the same details, so it reads like the letter that is sent.
    ...(l.subjectPatient != null ? { subjectPatient: fillText(l.subjectPatient, d, today) } : {}),
    ...(l.bodyPatient != null ? { bodyPatient: fillText(l.bodyPatient, d, today) } : {}),
  };
}

/** The brackets still in the letter: the detail it asks for (if one of ours) and its text. */
export function leftovers(l: Letter): { slot: Slot | null; label: string }[] {
  const seen = new Set<string>();
  const out: { slot: Slot | null; label: string }[] = [];
  for (const m of `${l.subject}\n${l.body}`.matchAll(BRACKET)) {
    // A signature is written by hand on the paper, so it isn't something to fill in here.
    if (/signature|firma/i.test(m[1])) continue;
    const slot = slotOf(m[1]);
    const id = slot ?? m[1].toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ slot, label: m[0] });
  }
  return out;
}
