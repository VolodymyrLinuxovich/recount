/**
 * The Recount mark (brand/mark-bare.svg): a paper bill with a torn bottom and a pen check.
 * Drawn in the page's own colors, so it follows dark mode and high visibility:
 * paper is --sheet, lines are the text color, and the check is --pen.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="22 12 56 76" aria-hidden="true" focusable="false">
      <path
        d="M28 16 H72 V78 L66.5 83 L61 78 L55.5 83 L50 78 L44.5 83 L39 78 L33.5 83 L28 78 Z"
        fill="var(--sheet)"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <rect x="35" y="27" width="22" height="4.2" rx="2.1" fill="currentColor" opacity="0.85" />
      <rect x="35" y="37" width="30" height="4.2" rx="2.1" fill="currentColor" opacity="0.4" />
      <rect x="35" y="47" width="26" height="4.2" rx="2.1" fill="currentColor" opacity="0.4" />
      <path
        d="M36 62 L45.5 71 L69 45"
        fill="none"
        stroke="var(--pen)"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
