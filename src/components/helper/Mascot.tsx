"use client";

import { useId } from "react";
import "./helper.css";

export type MascotState = "idle" | "thinking" | "happy" | "wave";

/**
 * Lupa, Recount's helper: a refined lens avatar, no face.
 * "Lupa" is Spanish for magnifying glass, and it reads every line of the bill.
 *
 * Idle is still. "thinking" sweeps a glint across the glass and pulses the ring slowly.
 * "happy" and "wave" are kept for the API and draw as idle.
 * Colors come from the tokens (--rc-brand, --rc-brand-tint, --rc-brand-deep), so it follows
 * dark mode and high visibility; motion stops under prefers-reduced-motion (helper.css).
 */
export function Mascot({
  state = "idle",
  size = 64,
  label,
  className,
}: {
  state?: MascotState;
  size?: number;
  /** Accessible name. Leave empty when the mascot sits next to text that says the same. */
  label?: string;
  className?: string;
}) {
  const clip = `lupa-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const mood = state === "thinking" ? "think" : "idle";
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <svg
      viewBox="4 4 40 40"
      width={size}
      height={size}
      className={`lupa lupa--${mood}${className ? ` ${className}` : ""}`}
      focusable="false"
      {...a11y}
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="21" cy="21" r="12.5" />
        </clipPath>
      </defs>
      <path className="lupa-handle" d="M30.5 30.5 L38 38" strokeWidth="5" strokeLinecap="round" />
      <circle className="lupa-glass" cx="21" cy="21" r="12.5" />
      <g clipPath={`url(#${clip})`}>
        <rect className="lupa-glint" x="2" y="-6" width="6" height="60" transform="rotate(35 21 21)" />
      </g>
      <circle className="lupa-ring" cx="21" cy="21" r="12.5" strokeWidth="3.5" fill="none" />
      <path
        className="lupa-spark"
        d="M21 15.5 L22.4 19.6 L26.5 21 L22.4 22.4 L21 26.5 L19.6 22.4 L15.5 21 L19.6 19.6 Z"
      />
    </svg>
  );
}
