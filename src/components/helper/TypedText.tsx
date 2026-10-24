"use client";

import { useEffect, useRef, useState } from "react";
import { LightText } from "./LightText";

// Lupa's reply appears a few words at a time, like a chat app typing, instead of all at once.
// The backend may send the whole reply in one go (with the safety check on) or in bursts; either
// way the text is revealed at a steady pace and catches up faster when it falls far behind.

const BASE_CPS = 55; // characters per second at the calm pace
const CATCH_UP_SECONDS = 4; // never lag more than about this long behind the full text

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function TypedText({ text, animate, onGrow }: { text: string; animate: boolean; onGrow?: () => void }) {
  const [still] = useState(() => !animate || (typeof window !== "undefined" && reducedMotion()));
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    if (still) return;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (now: number) => {
      const full = textRef.current.length;
      const behind = full - shownRef.current;
      if (behind > 0) {
        const cps = Math.max(BASE_CPS, behind / CATCH_UP_SECONDS);
        carry += ((now - last) / 1000) * cps;
        const step = Math.floor(carry);
        if (step > 0) {
          carry -= step;
          let next = Math.min(full, shownRef.current + step);
          // End on a word boundary so half-words don't flash.
          const space = textRef.current.indexOf(" ", next);
          if (space !== -1 && space - next < 8) next = space;
          shownRef.current = next;
          setShown(next);
          onGrow?.();
        }
      } else {
        carry = 0;
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [still, onGrow]);

  const done = still || shown >= text.length;
  return (
    <>
      {/* Screen readers get the whole reply once, not every step of the typing. */}
      {!done && <span className="visually-hidden">{text}</span>}
      <div aria-hidden={done ? undefined : true}>
        <LightText text={done ? text : text.slice(0, shown)} />
      </div>
    </>
  );
}
