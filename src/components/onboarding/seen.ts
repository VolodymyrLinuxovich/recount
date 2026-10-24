const KEY = "recount.onboarded";

type Path = "photo" | "sample";

/**
 * "1" once the full photo intro was seen or skipped; "sample" once only the
 * one-screen sample intro was seen. The photo path still shows its tips then.
 */
export function hasOnboarded(path: Path): boolean {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "1" || (path === "sample" && v === "sample");
  } catch {
    return false;
  }
}

export function markOnboarded(path: Path) {
  try {
    if (path === "photo") window.localStorage.setItem(KEY, "1");
    else if (window.localStorage.getItem(KEY) !== "1") window.localStorage.setItem(KEY, "sample");
  } catch {
    // Not saved; the screens show again next time, which is harmless.
  }
}
