// Red-pen marks drawn over the recounted bill. Each path is slightly uneven on purpose.

export function PenCircle({ delay = 0 }: { delay?: number }) {
  return (
    <svg className="pen pen-circle" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden>
      <path
        d="M10 30 C6 12, 50 3, 82 7 C99 10, 101 34, 80 42 C58 50, 14 48, 5 33 C1 24, 18 9, 46 6"
        pathLength={1}
        style={{ animationDelay: `${delay}ms` }}
      />
    </svg>
  );
}

export function PenStrike({ delay = 0 }: { delay?: number }) {
  return (
    <svg className="pen pen-strike" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden>
      <path d="M1 6 C20 4, 45 7, 70 4.5 S95 5, 99 4" pathLength={1} style={{ animationDelay: `${delay}ms` }} />
    </svg>
  );
}

export function PenUnderline({ delay = 0 }: { delay?: number }) {
  return (
    <svg className="pen pen-under" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden>
      <path d="M2 5 C30 8, 60 3, 98 6 M8 10 C40 8, 70 11, 92 9" pathLength={1} style={{ animationDelay: `${delay}ms` }} />
    </svg>
  );
}
