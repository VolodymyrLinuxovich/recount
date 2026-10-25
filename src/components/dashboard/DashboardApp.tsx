"use client";

import { useQuery } from "convex/react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { useT } from "../i18n/I18nProvider";
import { locale } from "../i18n/strings";
import { VALIDATION } from "./facts";
import { LineChart, type Series } from "./LineChart";
import { useInView } from "../landing/hooks";

type Summary = NonNullable<ReturnType<typeof useSummary>>;
type Agent = Summary["agents"][number];
type T = ReturnType<typeof useT>["t"];

const WINDOWS = [
  { hours: 6, key: "dash.h6", bin: 15 },
  { hours: 24, key: "dash.h24", bin: 60 },
  { hours: 168, key: "dash.d7", bin: 360 },
] as const;

const GROUPS = [
  { key: "claude", agents: ["read", "column", "letters", "chat", "topic", "complaint"], color: "var(--series-1)" },
  { key: "apify", agents: ["apify"], color: "var(--series-2)" },
  { key: "azure", agents: ["docintel", "search", "safety"], color: "var(--series-3)" },
  { key: "checks", agents: ["read-check", "letters-check"], color: "var(--series-4)" },
] as const;

const KNOWN_AGENTS = ["read", "docintel", "column", "letters", "chat", "topic", "search", "safety", "apify", "read-check", "letters-check"];
const TOOLS = ["get_agent_metrics", "get_agent_timeseries", "get_recent_agent_runs", "get_validation_results"] as const;
const MCP_URL = "https://recount-nu.vercel.app/api/mcp";

function useSummary(hours: number) {
  return useQuery(api.dashboard.summary, { hours });
}

function agentName(a: string, t: T) {
  return KNOWN_AGENTS.includes(a) ? t(`dash.a.${a}` as Parameters<T>[0]) : a;
}

function secs(ms: number | null) {
  if (ms == null) return "–";
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

function pctText(x: number | null) {
  return x == null ? "–" : `${Math.round(x * 1000) / 10}%`;
}

/** The current time, ticking every second. 0 until the page runs in the browser. */
function useNow(ms = 1000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [ms]);
  return now;
}

/** Merge several agents' stats into one (run-weighted). */
function merge(list: Agent[]) {
  const runs = list.reduce((s, a) => s + a.runs, 0);
  const ok = list.reduce((s, a) => s + a.ok, 0);
  const timed = list.filter((a) => a.p50ms != null);
  const tw = timed.reduce((s, a) => s + a.runs, 0);
  return {
    runs,
    okRate: runs ? ok / runs : null,
    p50ms: tw ? timed.reduce((s, a) => s + (a.p50ms ?? 0) * a.runs, 0) / tw : null,
    score: (() => {
      const sc = list.filter((a) => a.score != null);
      const n = sc.reduce((s, a) => s + a.runs, 0);
      return n ? sc.reduce((s, a) => s + (a.score ?? 0) * a.runs, 0) / n : null;
    })(),
    fallbacks: list.reduce((s, a) => s + a.fallbacks, 0),
  };
}

const rise = (n: number) => ({ "--i": n }) as CSSProperties;

/**
 * A muted, looping screencast that plays only while it is on screen. MP4 (H.264) comes first
 * because every browser plays it, including Safari on iPhone and Mac; WebM is the backup. The
 * poster shows at once, the video starts loading right away, and playback starts a little
 * before it scrolls into view. If no source plays, the poster image stays.
 */
function Screencast({ name, label }: { name: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.15, rootMargin: "200px 0px" },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [failed]);
  if (failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="part-video" src={`/dashboard/${name}.png`} alt={label} />;
  }
  return (
    <video ref={ref} className="part-video" poster={`/dashboard/${name}.png`} aria-label={label} muted loop playsInline autoPlay preload="auto">
      <source src={`/dashboard/${name}.mp4`} type="video/mp4" />
      <source src={`/dashboard/${name}.webm`} type="video/webm" onError={() => setFailed(true)} />
    </video>
  );
}

function Part({ n, id, stats }: { n: number; id: "p1" | "p2" | "p3"; stats: { label: string; value: string }[] }) {
  const { t } = useT();
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  const video = { p1: "vector-search", p2: "agents", p3: "convex" }[id];
  const title = t(`dash.${id}.title` as Parameters<T>[0]);
  return (
    <div ref={ref} className="part" data-in={inView} aria-labelledby={`dash-${id}`}>
      <div className="part-copy dash-rise" style={rise(0)}>
        <span className="part-n" aria-hidden="true">
          {n}
        </span>
        <h3 id={`dash-${id}`}>{title}</h3>
        <p>{t(`dash.${id}.short` as Parameters<T>[0])}</p>
        <dl className="part-stats">
          {stats.map((st) => (
            <div key={st.label}>
              <dd>{st.value}</dd>
              <dt>{st.label}</dt>
            </div>
          ))}
        </dl>
      </div>
      <figure className="part-frame dash-rise" style={rise(1)}>
        <div className="part-bar" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <Screencast name={video} label={title} />
      </figure>
    </div>
  );
}

function Copy({ text }: { text: string }) {
  const { t } = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn dash-copy"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          },
          () => {},
        );
      }}
    >
      {done ? t("dash.copied") : t("dash.copy")}
    </button>
  );
}

export function DashboardApp() {
  const { t, lang } = useT();
  const [win, setWin] = useState<(typeof WINDOWS)[number]>(WINDOWS[1]);
  const data = useSummary(win.hours);
  const now = useNow(15_000);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [seen, setSeen] = useState<unknown>(null);
  if (data && data !== seen && now) {
    setSeen(data);
    setLoadedAt(now);
  }

  const nf = useMemo(() => new Intl.NumberFormat(locale(lang)), [lang]);

  const updatedAt = loadedAt
    ? new Intl.DateTimeFormat(locale(lang), { hour: "numeric", minute: "2-digit" }).format(new Date(loadedAt))
    : "";

  const by = (names: readonly string[]) => merge((data?.agents ?? []).filter((a) => names.includes(a.agent)));
  const claude = by(GROUPS[0].agents);
  const apify = by(["apify"]);
  const search = by(["search"]);

  // Re-bin the 15-minute series per group. The x axis starts where the data starts, so the
  // line fills the chart instead of sitting in a corner of a mostly empty range.
  const chart = useMemo(() => {
    if (!data) return null;
    const winStart = data.now - win.hours * 3600_000;
    const inWin = data.series.filter((p) => p.t >= winStart);
    const first = inWin.length ? Math.min(...inWin.map((p) => p.t)) : winStart;
    const span = Math.max(3600_000, data.now - first);
    const binMin = [15, 30, 60, 180, 360].find((m) => span / (m * 60_000) <= 36) ?? 360;
    const binMs = binMin * 60_000;
    const t1 = Math.ceil(data.now / binMs) * binMs;
    const t0 = Math.max(Math.floor(winStart / binMs) * binMs, Math.floor(first / binMs) * binMs);
    const series = GROUPS.filter((g) => g.key !== "checks").map((g): Series => {
      const bins = new Map<number, { runs: number; ok: number; tw: number; tsum: number }>();
      for (const p of inWin) {
        if (!(g.agents as readonly string[]).includes(p.agent)) continue;
        const b = Math.floor(p.t / binMs) * binMs;
        const cur = bins.get(b) ?? { runs: 0, ok: 0, tw: 0, tsum: 0 };
        cur.runs += p.runs;
        cur.ok += p.ok;
        if (p.p50ms != null && p.p50ms > 0) {
          cur.tw += p.runs;
          cur.tsum += p.p50ms * p.runs;
        }
        bins.set(b, cur);
      }
      const points = [...bins.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([b, c]) => ({ t: b + binMs / 2, n: c.runs, ok: c.runs ? (c.ok / c.runs) * 100 : null, v: c.tw ? c.tsum / c.tw / 1000 : null }));
      return { key: g.key, label: t(`dash.g.${g.key}` as Parameters<T>[0]), color: g.color, points };
    });
    const maxT = Math.max(5, ...series.flatMap((x) => x.points.map((p) => p.v ?? 0)));
    // The x axis ends at the newest point, so the lines run to the right edge instead of
    // stopping short of an empty stretch at the end of the last time bin.
    const lastT = Math.max(...series.flatMap((x) => x.points.filter((p) => p.v != null).map((p) => p.t)));
    const firstT = Math.min(...series.flatMap((x) => x.points.filter((p) => p.v != null).map((p) => p.t)));
    const end = Number.isFinite(lastT) ? lastT : t1;
    const start = Number.isFinite(firstT) && firstT < end ? firstT : t0;
    return { t0: start, t1: end > start ? end : t1, binMin, series, yMax: Math.ceil(maxT / 5) * 5 };
  }, [data, win, t]);

  const tFmt = useMemo(() => {
    const long = chart ? chart.t1 - chart.t0 > 36 * 3600_000 : false;
    const f = new Intl.DateTimeFormat(locale(lang), long ? { weekday: "short", hour: "numeric" } : { hour: "numeric", minute: "2-digit" });
    return (x: number) => f.format(new Date(x));
  }, [lang, chart]);

  const binText = !chart ? "" : chart.binMin < 60 ? `${chart.binMin} min` : `${chart.binMin / 60} h`;
  const vsCode = JSON.stringify({ servers: { recount: { type: "http", url: MCP_URL } } }, null, 2);
  const claudeCmd = `claude mcp add --transport http recount ${MCP_URL}`;

  return (
    <div className="dash">
      <header className="dash-hero">
        <h1 aria-label={t("dash.title")}>
          {t("dash.title")
            .split(" ")
            .map((w, k) => (
              <span key={k} aria-hidden="true">
                <span className="dash-word" style={rise(k)}>
                  {w}
                </span>{" "}
              </span>
            ))}
        </h1>
        <p className="dash-lede dash-in" style={rise(5)}>
          {t("dash.lede")}
        </p>
        <div className="dash-bar dash-in" style={rise(7)}>
          <p className="dash-updated" aria-live="polite">
            {updatedAt ? t("dash.updatedAt", { time: updatedAt }) : "\u00a0"}
          </p>
          <div className="dash-window" role="group" aria-label={t("dash.window")}>
            {WINDOWS.map((w) => (
              <button key={w.hours} type="button" aria-pressed={w.hours === win.hours} onClick={() => setWin(w)}>
                {t(w.key)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {!data ? (
        <p className="dash-loading">{t("dash.loading")}</p>
      ) : (
        <>
          <section className="dash-kpis dash-in" style={rise(8)} aria-label={t("dash.title")}>
            <div>
              <span>{t("dash.kpiRuns")}</span>
              <strong>{nf.format(data.total.runs)}</strong>
            </div>
            <div>
              <span>{t("dash.kpiOk")}</span>
              <strong>{pctText(data.total.okRate)}</strong>
            </div>
            <div>
              <span>{t("dash.kpiTime")}</span>
              <strong>{secs(data.total.p50ms)}</strong>
            </div>
            <div>
              <span>
                {t("dash.kpiBills")} <em>({t("dash.kpiBillsNote")})</em>
              </span>
              <strong>{nf.format(data.convex.cases)}</strong>
            </div>
          </section>

          <section className="dash-section">
            <h2>{t("dash.howTitle")}</h2>
            <div className="parts">
              <Part
                n={1}
                id="p1"
                stats={[
                  { label: t("dash.p1.statRuns"), value: nf.format(search.runs) },
                  { label: t("dash.p1.statTime"), value: secs(search.p50ms) },
                ]}
              />
              <Part
                n={2}
                id="p2"
                stats={[
                  { label: t("dash.p2.statModel"), value: nf.format(claude.runs) },
                  { label: t("dash.p2.statApify"), value: nf.format(apify.runs) },
                  { label: t("dash.colOk"), value: pctText(claude.okRate) },
                ]}
              />
              <Part
                n={3}
                id="p3"
                stats={[
                  { label: t("dash.p3.statSteps"), value: nf.format(data.convex.steps) },
                  { label: t("dash.p3.statBills"), value: nf.format(data.convex.cases) },
                ]}
              />
            </div>
          </section>

          {chart && (
            <section className="dash-section">
              <h2>{t("dash.chartsTitle")}</h2>
              <p className="dash-sub">{t("dash.chartsLede", { bin: binText })}</p>
              <figure className="dash-chart">
                <figcaption>{t("dash.chartTime")}</figcaption>
                <LineChart
                  key={`${win.hours}-${chart.t0}`}
                  series={chart.series}
                  t0={chart.t0}
                  t1={chart.t1}
                  yMax={chart.yMax}
                  height={320}
                  yFmt={(v) => `${Math.round(v * 10) / 10} s`}
                  tFmt={tFmt}
                  runsLabel={t("dash.colRuns")}
                  empty={t("dash.chartEmpty")}
                />
              </figure>
              <details className="dash-table">
                <summary>{t("dash.table")}</summary>
                <div className="dash-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t("dash.colTime")}</th>
                        {chart.series.map((x) => (
                          <th key={x.key} scope="col">
                            {x.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...new Set(chart.series.flatMap((x) => x.points.map((p) => p.t)))]
                        .sort((a, b) => b - a)
                        .map((tt) => (
                          <tr key={tt}>
                            <th scope="row">{tFmt(tt)}</th>
                            {chart.series.map((x) => {
                              const p = x.points.find((q) => q.t === tt) as ((typeof x.points)[number] & { ok?: number | null }) | undefined;
                              return (
                                <td key={x.key}>
                                  {p ? `${p.n} ${t("dash.colRuns")} · ${Math.round(p.ok ?? 0)}%${p.v != null ? ` · ${p.v.toFixed(1)} s` : ""}` : "–"}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          )}

          <section className="dash-section">
            <h2>{t("dash.agentsTitle")}</h2>
            <div className="dash-scroll">
              <table className="dash-agents">
                <thead>
                  <tr>
                    <th scope="col">{t("dash.colAgent")}</th>
                    <th scope="col">{t("dash.colRuns")}</th>
                    <th scope="col">{t("dash.colOk")}</th>
                    <th scope="col">{t("dash.colP50")}</th>
                    <th scope="col">{t("dash.colP90")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents
                    .filter((a) => a.p50ms != null)
                    .map((a) => (
                      <tr key={a.agent}>
                        <th scope="row">
                          {agentName(a.agent, t)}
                          {a.models.length > 0 && (
                            <small>{a.models.map((m) => ((a.backupModels ?? []).includes(m) ? t("dash.backupModel", { model: m }) : m)).join(", ")}</small>
                          )}
                        </th>
                        <td>{nf.format(a.runs)}</td>
                        <td>{pctText(a.okRate)}</td>
                        <td>{secs(a.p50ms)}</td>
                        <td>{secs(a.p90ms)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="dash-section">
        <h2>{t("dash.checksTitle")}</h2>
        <p className="dash-sub">{t("dash.checksLede")}</p>
        <ul className="dash-checks">
          {VALIDATION.map((v) => (
            <li key={v.id} title={t("dash.source", { src: v.source })}>
              <strong>{v.big}</strong>
              <span>{t(`dash.vk.${v.id}` as Parameters<T>[0])}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="dash-section dash-mcp">
        <h2>{t("dash.mcpTitle")}</h2>
        <p className="dash-sub">{t("dash.mcpLede")}</p>
        <div className="mcp-row">
          <span className="mcp-k">{t("dash.mcpUrl")}</span>
          <code>{MCP_URL}</code>
          <Copy text={MCP_URL} />
        </div>
        <div className="mcp-grid">
          <div>
            <div className="mcp-head">
              <span className="mcp-k">{t("dash.mcpVscode")}</span>
              <Copy text={vsCode} />
            </div>
            <pre>{vsCode}</pre>
          </div>
          <div>
            <div className="mcp-head">
              <span className="mcp-k">{t("dash.mcpClaude")}</span>
              <Copy text={claudeCmd} />
            </div>
            <pre>{claudeCmd}</pre>
            <span className="mcp-k mcp-tools-k">{t("dash.mcpTools")}</span>
            <ul className="mcp-tools">
              {TOOLS.map((name) => (
                <li key={name}>
                  <code>{name}</code> {t(`dash.t.${name}` as Parameters<T>[0])}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
