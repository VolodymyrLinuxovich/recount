import "./helper.css";

export type MascotState = "idle" | "thinking" | "happy" | "wave";

/**
 * Lupa, Recount's helper: a small magnifying glass with a calm face.
 * "Lupa" is Spanish for magnifying glass, and it reads every line of the bill.
 *
 * Drawn on a 64×64 grid with thick, simple shapes so it holds up at 32px.
 * Colors come from the app tokens (--ink, --sheet, --accent), so it follows dark mode.
 * Motion is kept quiet on purpose (a slow blink, an opacity pulse while thinking),
 * all in CSS, and it stops under prefers-reduced-motion.
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
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`lupa lupa--${state}${size <= 40 ? " lupa--small" : ""}${className ? ` ${className}` : ""}`}
      focusable="false"
      {...a11y}
    >
      {/* Handle and collar */}
      <path className="lupa-handle" d="M43 43 L54.5 54.5" />
      <path className="lupa-collar" d="M39.6 39.6 L44 44" />

      {/* Lens */}
      <circle className="lupa-lens" cx="27" cy="27" r="19" />
      <circle className="lupa-tint" cx="27" cy="27" r="16.5" />
      <path className="lupa-glint" d="M14.2 23.2 A13.5 13.5 0 0 1 21.6 14.6" />

      {/* A small raised hand, only for the greeting. It stays still. */}
      {state === "wave" && (
        <g className="lupa-arm">
          <path className="lupa-line lupa-arm-line" d="M9.2 31.5 C5.4 29.6 3.6 25.8 4 20.6" />
          <ellipse className="lupa-hand" cx="7.2" cy="17.6" rx="1.5" ry="1.15" transform="rotate(-30 7.2 17.6)" />
          <ellipse className="lupa-hand" cx="4" cy="16.6" rx="3" ry="3.8" />
        </g>
      )}

      {/* Face */}
      <g className="lupa-face">
        <ellipse className="lupa-cheek" cx="16.8" cy="32.2" rx="2.9" ry="1.8" />
        <ellipse className="lupa-cheek" cx="37.2" cy="32.2" rx="2.9" ry="1.8" />
        {state === "happy" ? (
          <>
            <path className="lupa-line" d="M18.4 27.4 Q21 24 23.6 27.4" />
            <path className="lupa-line" d="M30.4 27.4 Q33 24 35.6 27.4" />
            <path className="lupa-line" d="M20.8 32.4 Q27 38.6 33.2 32.4" />
          </>
        ) : (
          <>
            <g className={state === "thinking" ? "lupa-eyes lupa-eyes--up" : "lupa-eyes"}>
              <circle className="lupa-eye" cx="21" cy="26" r="2.6" />
              <circle className="lupa-eye" cx="33" cy="26" r="2.6" />
            </g>
            {state === "thinking" ? (
              <path className="lupa-line" d="M24.2 34.4 Q27 35.4 29.8 34.4" />
            ) : (
              <path className="lupa-line" d="M21.8 32.6 Q27 37 32.2 32.6" />
            )}
          </>
        )}
      </g>

      {/* Thinking dots, above the lens */}
      {state === "thinking" && (
        <g className="lupa-dots">
          <circle cx="44" cy="9" r="2.4" />
          <circle cx="51" cy="9" r="2.4" />
          <circle cx="58" cy="9" r="2.4" />
        </g>
      )}
    </svg>
  );
}
