const common = {
  viewBox: "0 0 32 32",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  className: "onb-icon",
};

/** A page with lines: the bill. */
export function IconBill() {
  return (
    <svg {...common}>
      <path d="M8 4h12l5 5v19H8z" />
      <path d="M20 4v5h5M12 14h9M12 18h9M12 22h6" />
    </svg>
  );
}

/** A page with a check mark: checked against prices and law. */
export function IconCheck() {
  return (
    <svg {...common}>
      <circle cx="16" cy="16" r="11" />
      <path d="m11 16.5 3.5 3.5 6.5-7" />
    </svg>
  );
}

/** An envelope: letters you send. */
export function IconLetter() {
  return (
    <svg {...common}>
      <rect x="4" y="8" width="24" height="17" rx="2" />
      <path d="m5 10 11 8 11-8" />
    </svg>
  );
}

/** A home: household income. */
export function IconHome() {
  return (
    <svg {...common}>
      <path d="M5 15 16 6l11 9M8 13v13h16V13M14 26v-7h4v7" />
    </svg>
  );
}

/** A card: insurance. */
export function IconCard() {
  return (
    <svg {...common}>
      <rect x="4" y="8" width="24" height="16" rx="2" />
      <path d="M4 13h24M8 19h6" />
    </svg>
  );
}

/** A bill lying flat on a table in good light, with all four corners marked. */
export function PhotoTips({ label }: { label: string }) {
  return (
    <svg className="onb-photo" viewBox="0 0 320 200" role="img" aria-label={label}>
      <rect x="0" y="0" width="320" height="200" rx="14" className="onb-photo-table" />
      <g className="onb-photo-sun" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="276" cy="40" r="11" />
        <path d="M276 18v-6M276 68v-6M254 40h-6M304 40h-6M260 24l-4-4M296 60l-4-4M260 56l-4 4M296 20l-4 4" />
      </g>
      <rect x="104" y="30" width="112" height="146" rx="3" className="onb-photo-sheet" />
      <g className="onb-photo-lines" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M120 52h50M120 72h80M120 88h80M120 104h80M120 120h80M120 136h60M170 158h30" />
      </g>
      <g className="onb-photo-corners" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M92 40V18h22M206 18h22v22M228 166v22h-22M114 188H92v-22" />
      </g>
    </svg>
  );
}
