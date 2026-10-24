// The patient's saved profile: their details, typed once and offered again on the next bill.
// Kept in this browser for now. When accounts come, only this module changes.
import { cleanDetails, type Details } from "./letterFill";

const KEY = "recount.profile";

export function readProfile(): Partial<Details> | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? cleanDetails(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveProfile(d: Details) {
  try {
    if (Object.values(d).some((v) => v.trim())) window.localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // Storage is blocked; the details are still in this bill's letters.
  }
}

export function clearProfile() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
