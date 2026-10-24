"use client";

import { useT } from "../i18n/I18nProvider";
import { type Hospital, type Worst, displayName, verdictLabel, worst } from "./data";

// A simplified outline of California as [lon, lat] points, drawn like a sketch on paper.
const OUTLINE: [number, number][] = [
  [-124.21, 42.0], [-120.0, 42.0], [-120.0, 39.0], [-114.63, 35.0], [-114.57, 34.3], [-114.43, 34.08],
  [-114.72, 33.4], [-114.52, 33.03], [-114.72, 32.72], [-117.12, 32.53], [-117.25, 32.7], [-117.3, 33.1],
  [-117.6, 33.4], [-118.0, 33.7], [-118.4, 33.75], [-118.5, 34.0], [-118.8, 34.02], [-119.2, 34.15],
  [-119.7, 34.4], [-120.45, 34.45], [-120.6, 34.6], [-120.65, 35.15], [-120.9, 35.45], [-121.3, 35.7],
  [-121.9, 36.3], [-121.95, 36.6], [-121.8, 36.8], [-122.0, 36.97], [-122.4, 37.2], [-122.5, 37.5],
  [-122.52, 37.78], [-122.8, 38.0], [-123.0, 38.3], [-123.7, 38.95], [-123.8, 39.4], [-123.85, 39.8],
  [-124.1, 40.1], [-124.4, 40.4], [-124.2, 40.8], [-124.1, 41.1], [-124.2, 41.75], [-124.21, 42.0],
];

const LON0 = -124.6;
const LAT_TOP = 42.2;
const K = Math.cos((37 * Math.PI) / 180);
const SCALE = 40; // svg units per degree of latitude
const project = (lon: number, lat: number): [number, number] => [(lon - LON0) * K * SCALE, (LAT_TOP - lat) * SCALE];

const W = Math.ceil((-113.9 - LON0) * K * SCALE);
const H = Math.ceil((LAT_TOP - 32.3) * SCALE);
const PATH = OUTLINE.map(([lon, lat], i) => {
  const [x, y] = project(lon, lat);
  return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
}).join(" ") + "Z";

const ORDER: Worst[] = ["none", "ask", "likely", "conflict"];

export function CaMap({
  hospitals,
  selected,
  onSelect,
}: {
  hospitals: Hospital[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const { t, lang } = useT();
  const placed = hospitals
    .filter((h) => h.lat != null && h.lon != null)
    .map((h) => ({ h, w: worst(h), xy: project(h.lon!, h.lat!) }))
    // Worst verdicts are drawn last so they sit on top.
    .sort((a, b) => ORDER.indexOf(a.w) - ORDER.indexOf(b.w));
  const sel = placed.find((p) => p.h.key === selected);

  return (
    <figure className="ca-map">
      <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} role="group" aria-label={t("map.aria")}>
        <path d={PATH} className="ca-outline" />
        {placed.map(({ h, w, xy: [x, y] }) => (
          <g
            key={h.key}
            className={`dot dot-${w}`}
            role="button"
            tabIndex={0}
            aria-label={`${displayName(h.name)}: ${verdictLabel(w, lang)}`}
            onClick={() => onSelect(h.key)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(h.key))}
          >
            <circle cx={x} cy={y} r={11} className="dot-hit" />
            <circle cx={x} cy={y} r={w === "none" ? 3.2 : w === "conflict" ? 6 : 4.6} className="dot-mark" />
          </g>
        ))}
        {sel && (
          <path
            className="dot-ring"
            transform={`translate(${sel.xy[0]} ${sel.xy[1]})`}
            d="M-11 3 C-13 -8, 2 -14, 10 -8 C16 -2, 10 11, -1 12 C-9 12, -14 4, -9 -5"
          />
        )}
      </svg>
      <figcaption className="map-legend">
        <span><i className="dot-key dot-conflict" /> {t("map.conflict")}</span>
        <span><i className="dot-key dot-likely" /> {t("map.likely")}</span>
        <span><i className="dot-key dot-ask" /> {t("map.ask")}</span>
        <span><i className="dot-key dot-none" /> {t("map.none")}</span>
      </figcaption>
    </figure>
  );
}
