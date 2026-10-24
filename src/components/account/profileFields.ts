// The account profile in the letter's shape (Details), and back. The server keeps the date of birth
// as YYYY-MM-DD; letters use MM/DD/YYYY.
import { type Details, EMPTY_DETAILS, normalDob } from "../letterFill";

export type ServerProfile = {
  name: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  dob: string | null;
} | null;

export function isoToDob(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[2]}/${m[3]}/${m[1]}` : (iso ?? "");
}

export function dobToIso(dob: string): string {
  const n = normalDob(dob);
  if (!n) return dob.trim();
  const [mo, d, y] = n.split("/");
  return `${y}-${mo}-${d}`;
}

export function fromServer(p: ServerProfile): Details {
  if (!p) return { ...EMPTY_DETAILS };
  return {
    name: p.name ?? "",
    street: p.street ?? "",
    city: p.city ?? "",
    zip: p.zip ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    dob: isoToDob(p.dob),
  };
}

/** What profile.set takes. Empty strings clear a field. */
export function toServer(d: Details) {
  const zip = d.zip.trim();
  return {
    name: d.name.trim(),
    street: d.street.trim(),
    city: d.city.trim(),
    // 941101234 → 94110-1234, the form the server checks for.
    zip: /^\d{9}$/.test(zip) ? `${zip.slice(0, 5)}-${zip.slice(5)}` : zip,
    phone: d.phone.trim(),
    email: d.email.trim(),
    dob: d.dob.trim() ? dobToIso(d.dob) : "",
  };
}
