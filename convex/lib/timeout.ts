// A signal that aborts a fetch after `ms`. In Convex's runtime AbortSignal.timeout() (and an
// unref'd timer) fire right away, which made every Azure call fail on the spot, so this uses a
// plain timer.
export function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(new Error(`timed out after ${ms} ms`)), ms);
  return c.signal;
}
