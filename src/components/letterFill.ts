// The patient's own details, typed once and put into the [brackets] of the English letters.
import type { Letter } from "./types";

export interface Details {
  name: string;
  street: string;
  /** City and state, like "Los Angeles, CA". */
  city: string;
  zip: string;
  phone: string;
  email: string;
  dob: string;
}

export type Slot = keyof Details | "address" | "date";

export const EMPTY_DETAILS: Details = { name: "", street: "", city: "", zip: "", phone: "", email: "", dob: "" };

/** Details from storage (this bill's or the saved profile), keeping only known text fields. */
export function cleanDetails(data: unknown): Partial<Details> | null {
  if (!data || typeof data !== "object") return null;
  const out: Partial<Details> = {};
  for (const k of Object.keys(EMPTY_DETAILS) as (keyof Details)[]) {
    const v = (data as Record<string, unknown>)[k];
    if (typeof v === "string") out[k] = v;
  }
  // Older saves kept the ZIP at the end of "City, state, ZIP".
  const m = !out.zip && out.city ? /^(.*?)[,\s]+(\d{5}(?:-\d{4})?)\s*$/.exec(out.city) : null;
  if (m) {
    out.city = m[1];
    out.zip = m[2];
  }
  return out;
}

/** What the details screen needs before the letters can go on. */
export const REQUIRED: (keyof Details)[] = ["name", "street", "city", "zip", "phone"];

export const phoneDigits = (s: string) => {
  const d = s.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
};
export const phoneOk = (s: string) => phoneDigits(s).length === 10;
/**
 * A date of birth as MM/DD/YYYY, the way a US billing office reads it, or null if it isn't a real date.
 * "/", "-" or "." all work. When the first number can't be a month (23/04/1958), it's read as day/month,
 * the way most Spanish speakers write it.
 */
export function normalDob(s: string): string | null {
  const m = /^\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})\s*$/.exec(s);
  if (!m) return null;
  let [mo, d] = [Number(m[1]), Number(m[2])];
  const y = Number(m[3]);
  if (mo > 12 && d <= 12) [mo, d] = [d, mo];
  const date = new Date(y, mo - 1, d);
  const real = date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
  if (!real || y < 1900 || date > new Date()) return null;
  return `${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

export const zipOk = (s: string) => /^\d{5}(-?\d{4})?$/.test(s.trim());

/** Each field's problem: missing (required and empty), bad (typed but not right), or null. */
export function checkDetails(d: Details): Partial<Record<keyof Details, "missing" | "bad">> {
  const out: Partial<Record<keyof Details, "missing" | "bad">> = {};
  for (const k of REQUIRED) if (!d[k].trim()) out[k] = "missing";
  if (d.phone.trim() && !phoneOk(d.phone)) out.phone = "bad";
  if (d.zip.trim() && !zipOk(d.zip)) out.zip = "bad";
  if (d.dob.trim() && !normalDob(d.dob)) out.dob = "bad";
  if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) out.email = "bad";
  return out;
}

const key = (id: string) => `recount.details.${id}`;

export function readDetails(id: string): Partial<Details> | null {
  try {
    const raw = window.localStorage.getItem(key(id));
    if (!raw) return null;
    return cleanDetails(JSON.parse(raw));
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
  if (/^(your )?(zip|zip code|postal code|codigo postal)$/.test(x)) return "zip";
  const addr = /\b(address|street|direccion|calle)\b/.test(x);
  const city = /\b(city|state|zip|zip code|postal|ciudad|estado|codigo postal)\b/.test(x);
  if (addr && city) return "address";
  // "[Street]" is just the street; a plain "[Your address]" is the whole address.
  if (addr) return /\b(street|calle)\b/.test(x) ? "street" : "address";
  if (city) return "city";
  if (/^(today )?date$|^today$|^fecha( de hoy)?$/.test(x)) return "date";
  if (/^(your |patient |the patient |printed |full |your full |your printed |patient full )*name$/.test(x)) return "name";
  if (/^(su )?nombre( completo| del paciente)?$/.test(x)) return "name";
  return null;
}

const cityLine = (d: Details) => [d.city.trim().replace(/,\s*$/, ""), d.zip.trim()].filter(Boolean).join(" ");

function valueFor(slot: Slot, d: Details, today: string): string {
  switch (slot) {
    case "address":
      return [d.street.trim(), cityLine(d)].filter(Boolean).join(", ");
    case "city":
      return cityLine(d);
    case "date":
      return today;
    default:
      return d[slot].trim();
  }
}

const usToday = () => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const esToday = () => new Date().toLocaleDateString("es-US", { month: "long", day: "numeric", year: "numeric" });

const OPTIONAL: Slot[] = ["email", "dob"];
const DROP = "\u0000";

/** Put the patient's details into the matching [brackets]. Brackets with nothing to put in stay,
 * except optional ones (email, date of birth): their line is left out of the letter. */
export function fillText(text: string, d: Details, today = usToday()): string {
  // "[Address]" next to its own "[City, State ZIP]" line is only the street, or the city shows twice.
  const slots = new Set([...text.matchAll(BRACKET)].map((m) => slotOf(m[1])));
  const cityApart = slots.has("city");
  const zipApart = slots.has("zip");
  const filled = text.replace(BRACKET, (whole, label: string) => {
    // The writer sometimes leaves "[Your name: Alex Rivera]": the value is already there, so use it.
    const kv = label.match(/^([^:]{2,40}):\s*(\S.*)$/);
    if (kv && !/\b(insert|enter|fill|type|your|add|escriba|ingrese|su)\b/i.test(kv[2])) return kv[2].trim();
    let slot = slotOf(label);
    if (!slot) return whole;
    if (slot === "address" && cityApart) slot = "street";
    const v = slot === "city" && zipApart ? d.city.trim() : valueFor(slot, d, today);
    if (v) return v;
    return OPTIONAL.includes(slot) ? DROP : whole;
  });
  if (!filled.includes(DROP)) return filled;
  return filled
    .split("\n")
    .filter((line) => {
      if (!line.includes(DROP)) return true;
      const rest = line.replaceAll(DROP, "").trim();
      return rest !== "" && !/^[^.!?]{0,40}:$/.test(rest);
    })
    .map((line) => line.replaceAll(DROP, "").replace(/\s+([,.])/g, "$1"))
    .join("\n");
}

export function fillLetter<L extends Pick<Letter, "subject" | "body" | "subjectPatient" | "bodyPatient">>(l: L, d: Details): L {
  const today = usToday();
  return {
    ...l,
    subject: fillText(l.subject, d, today),
    body: fillText(l.body, d, today),
    // The Spanish copy shows the same details, so it reads like the letter that is sent.
    ...(l.subjectPatient != null ? { subjectPatient: fillText(l.subjectPatient, d, esToday()) } : {}),
    ...(l.bodyPatient != null ? { bodyPatient: fillText(l.bodyPatient, d, esToday()) } : {}),
  };
}

/** The brackets still in the letter: the detail it asks for (if one of ours) and its text. */
export function leftovers(l: Pick<Letter, "subject" | "body">): { slot: Slot | null; label: string }[] {
  const seen = new Set<string>();
  const out: { slot: Slot | null; label: string }[] = [];
  for (const m of `${l.subject}\n${l.body}`.matchAll(BRACKET)) {
    // A signature is written by hand on the paper, so it isn't something to fill in here.
    if (/signature|firma|sign here/i.test(m[1])) continue;
    const slot = slotOf(m[1]);
    // Optional details (email, date of birth) are never "missing".
    if (slot && OPTIONAL.includes(slot)) continue;
    const id = slot ?? m[1].toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ slot, label: m[0] });
  }
  return out;
}
