"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const RM = "(prefers-reduced-motion: reduce)";

export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(RM);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(RM).matches,
    () => false,
  );
}

/** Flips to true once the element is a quarter into the viewport. */
export function useInView<T extends Element>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      // Count it as seen once ~48px of it is on screen, so nothing sits blank at the bottom of the first view.
      { threshold: Math.min(threshold, 0.01), rootMargin: threshold > 0.3 ? "0px 0px -20% 0px" : "0px 0px -48px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

/** Eased count from 0 to target once `run` is true. */
export function useCountUp(target: number, run: boolean, ms = 1400, delay = 0) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run || reduced) return;
    let raf = 0;
    let start = 0;
    const t = window.setTimeout(() => {
      const tick = (now: number) => {
        if (!start) start = now;
        const p = Math.min(1, (now - start) / ms);
        setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [run, reduced, target, ms, delay]);
  return reduced ? target : value;
}
