// Lupa, Recount's assistant: a refined lens avatar, no face. Idle is still;
// "think" sweeps a glint across the glass and pulses the ring slowly (see landing.css).

import { useId } from "react";

export type LupaMood = "idle" | "think";

type Props = { mood?: LupaMood; size?: number; className?: string };

export function Lupa({ mood = "idle", size = 40, className = "" }: Props) {
  const clip = `ld-lupa-${useId().replace(/:/g, "")}`;
  return (
    <span className={`ld-lupa ld-lupa--${mood} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 48 48" width={size} height={size}>
        <defs>
          <clipPath id={clip}>
            <circle cx="21" cy="21" r="12.5" />
          </clipPath>
        </defs>
        <path className="ld-lupa-handle" d="M30.5 30.5 L38 38" strokeWidth="5" strokeLinecap="round" />
        <circle className="ld-lupa-glass" cx="21" cy="21" r="12.5" />
        <g clipPath={`url(#${clip})`}>
          <rect className="ld-lupa-glint" x="2" y="-6" width="6" height="60" transform="rotate(35 21 21)" />
        </g>
        <circle className="ld-lupa-ring" cx="21" cy="21" r="12.5" strokeWidth="3.5" fill="none" />
        <path className="ld-lupa-spark" d="M21 15.5 L22.4 19.6 L26.5 21 L22.4 22.4 L21 26.5 L19.6 22.4 L15.5 21 L19.6 19.6 Z" />
      </svg>
    </span>
  );
}
