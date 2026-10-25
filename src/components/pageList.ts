// The pages of a bill being put together before it's sent: add, move, remove. Pure, so it's tested.
export { MAX_PAGES, MAX_TOTAL_BYTES } from "../../convex/lib/pages";
import { MAX_PAGES } from "../../convex/lib/pages";

/** Adds pages at the end, up to max in all. Returns the new list and how many didn't fit. */
export function addPages<T>(list: T[], more: T[], max = MAX_PAGES): { list: T[]; dropped: T[] } {
  const room = Math.max(0, max - list.length);
  return { list: [...list, ...more.slice(0, room)], dropped: more.slice(room) };
}

/** Moves page i one place up (-1) or down (+1). Out of range does nothing. */
export function movePage<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function removePage<T>(list: T[], i: number): T[] {
  return list.filter((_, k) => k !== i);
}

export const isPdf = (f: { type: string; name?: string }) => f.type === "application/pdf" || /\.pdf$/i.test(f.name ?? "");
