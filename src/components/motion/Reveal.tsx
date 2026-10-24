"use client";

import { type CSSProperties, type ElementType, type ReactNode, useEffect, useRef } from "react";

/**
 * Scroll reveal. Anything with the .reveal class fades up once it is in view
 * (globals.css); this adds .is-in when that happens. --i staggers siblings (60ms each).
 * The page is only hidden-until-seen when the layout's head script has set html.js-reveal,
 * and never under prefers-reduced-motion, so without JS everything is simply shown.
 */
export function useReveal<T extends Element>(threshold = 0.15) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}

export function Reveal({
  as: Tag = "div",
  i,
  className,
  style,
  children,
}: {
  as?: ElementType;
  /** Position in a staggered group (0, 1, 2...). */
  i?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const ref = useReveal<HTMLElement>();
  const s = i === undefined ? style : ({ ...style, "--i": i } as CSSProperties);
  return (
    <Tag ref={ref} className={className ? `reveal ${className}` : "reveal"} style={s}>
      {children}
    </Tag>
  );
}
