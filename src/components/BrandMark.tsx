/**
 * The Recount mark (brand/mark-light.svg and brand/mark-dark.svg): Lupa's lens, whose rim is a
 * "count it again" return arrow, held over a bill whose total is struck through.
 * Drawn from tokens so one SVG follows light, dark and high visibility (globals.css .brand-mark):
 * rim --m-rim, glass --m-glass, bill lines currentColor, strike --m-strike, handle --m-handle.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `brand-mark ${className}` : "brand-mark"}
      viewBox="3 3 58 58"
      aria-hidden="true"
      focusable="false"
    >
      <path className="brand-mark-handle" d="M41 41 L55 55" strokeWidth="9" strokeLinecap="round" />
      <circle className="brand-mark-glass" cx="27" cy="27" r="19" />
      <g className="brand-mark-lines" strokeLinecap="round" strokeWidth="3.2">
        <path d="M18 20.5 H36" />
        <path d="M18 27 H31" />
        <path d="M18 33.5 H36" />
      </g>
      <path className="brand-mark-strike" d="M15.5 37.5 L38.5 29.5" strokeWidth="3.6" strokeLinecap="round" />
      <path
        className="brand-mark-rim"
        d="M39.2 12.45 A19 19 0 1 1 20.5 9.15"
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path className="brand-mark-arrow" d="M27 7 L21.6 15.2 L17.4 4.2 Z" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}
