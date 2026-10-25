"use client";

import { type PointerEvent, useEffect, useRef, useState } from "react";

// A small SVG line chart: one y axis, thin 2px lines, markers on each point, a legend above,
// direct labels at each line's end, and a crosshair tooltip on hover.

export interface Series {
  key: string;
  label: string;
  /** CSS color, a var(--series-n) token. */
  color: string;
  points: { t: number; v: number | null; n: number }[];
}

const H = 220;
const PAD = { top: 12, right: 112, bottom: 28, left: 44 };

export function LineChart({
  series,
  t0,
  t1,
  yMax,
  yFmt,
  tFmt,
  runsLabel,
  empty,
}: {
  series: Series[];
  t0: number;
  t1: number;
  yMax: number;
  yFmt: (v: number) => string;
  tFmt: (t: number) => string;
  runsLabel: string;
  empty: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = w < 520;
  const pad = { ...PAD, right: narrow ? 12 : PAD.right };
  const iw = w - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;
  const x = (t: number) => pad.left + ((t - t0) / Math.max(1, t1 - t0)) * iw;
  const y = (v: number) => pad.top + ih - (Math.min(v, yMax) / yMax) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const times = [...new Set(series.flatMap((s) => s.points.filter((p) => p.v != null).map((p) => p.t)))].sort((a, b) => a - b);
  const hasData = times.length > 0;
  const xTicks = [0, 1 / 3, 2 / 3, 1].map((f) => t0 + f * (t1 - t0));

  function onMove(e: PointerEvent<SVGSVGElement>) {
    if (!times.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * w;
    let best = times[0];
    for (const t of times) if (Math.abs(x(t) - px) < Math.abs(x(best) - px)) best = t;
    setHover(best);
  }

  // End labels: one per line, pushed apart so lines that end at the same value stay readable.
  const ends = series
    .map((s) => {
      const pts = s.points.filter((p) => p.v != null);
      const last = pts[pts.length - 1];
      return last ? { key: s.key, label: s.label, x: x(last.t), y: y(last.v!) } : null;
    })
    .filter((e): e is { key: string; label: string; x: number; y: number } => e !== null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  const endX = Math.max(0, ...ends.map((e) => e.x)) + 8;

  const hx = hover != null ? x(hover) : 0;
  const rows = hover != null ? series.map((s) => ({ s, p: s.points.find((p) => p.t === hover && p.v != null) })).filter((r) => r.p) : [];

  return (
    <div className="lc" ref={wrap}>
      <ul className="lc-legend">
        {series.map((s) => (
          <li key={s.key}>
            <span className="lc-swatch" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="lc-plot">
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.left} x2={w - pad.right} y1={y(v)} y2={y(v)} className="lc-grid" />
              <text x={pad.left - 8} y={y(v)} className="lc-tick" textAnchor="end" dominantBaseline="middle">
                {yFmt(v)}
              </text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text key={t} x={x(t)} y={H - 8} className="lc-tick" textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}>
              {tFmt(t)}
            </text>
          ))}
          {!hasData && (
            <text x={pad.left + iw / 2} y={pad.top + ih / 2} className="lc-empty" textAnchor="middle">
              {empty}
            </text>
          )}
          {series.map((s) => {
            const pts = s.points.filter((p) => p.v != null) as { t: number; v: number; n: number }[];
            if (!pts.length) return null;
            const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
            return (
              <g key={s.key}>
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p) => (
                  <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={pts.length > 40 ? 2 : 3.5} fill={s.color} className="lc-dot" />
                ))}

              </g>
            );
          })}
          {!narrow &&
            ends.map((e) => (
              <text key={e.key} x={endX} y={e.y} className="lc-label" dominantBaseline="middle">
                {e.label}
              </text>
            ))}
          {hover != null && <line x1={hx} x2={hx} y1={pad.top} y2={pad.top + ih} className="lc-cross" />}
        </svg>
        {hover != null && rows.length > 0 && (
          <div className="lc-tip" style={{ left: `${(hx / w) * 100}%` }} role="status">
            <strong>{tFmt(hover)}</strong>
            {rows.map(({ s, p }) => (
              <span key={s.key}>
                <i style={{ background: s.color }} aria-hidden="true" />
                {s.label}: {yFmt(p!.v!)} <em>({p!.n} {runsLabel})</em>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
