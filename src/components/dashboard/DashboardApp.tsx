"use client";

import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { useT } from "../i18n/I18nProvider";
import { locale } from "../i18n/strings";
import { VALIDATION } from "./facts";
import { LineChart, type Series } from "./LineChart";

type Summary = NonNullable<ReturnType<typeof useSummary>>;
type Agent = Summary["agents"][number];
type T = ReturnType<typeof useT>["t"];

const WINDOWS = [
  { hours: 6, key: "dash.h6", bin: 15 },
  { hours: 24, key: "dash.h24", bin: 60 },
  { hours: 168, key: "dash.d7", bin: 360 },
] as const;

const GROUPS = [
  { key: "claude", agents: ["read", "column", "letters", "chat", "complaint"], color: "var(--series-1)" },
  { key: "apify", agents: ["apify"], color: "var(--series-2)" },
  { key: "search", agents: ["search"], color: "var(--series-3)" },
  { key: "checks", agents: ["read-check", "letters-check"], color: "var(--series-4)" },
] as const;

const KNOWN_AGENTS = ["read", "column", "letters", "chat", "search", "apify", "read-check", "letters-check"];
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

function Flow({ steps, label }: { steps: string[]; label: string }) {
  return (
    <ol className="flow" aria-label={label} style={{ ["--n" as string]: steps.length }}>
      {steps.map((s, i) => (
        <li key={s} className="flow-step" style={{ ["--i" as string]: i }}>
          <span className="flow-num" aria-hidden="true">
            {i + 1}
          </span>
          <span className="flow-text">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Pillar({
  n,
  id,
  stats,
  steps,
}: {
  n: number;
  id: "p1" | "p2" | "p3";
  stats: { label: string; value: string; sub?: string }[];
  steps: string[];
}) {
  const { t } = useT();
  const [tab, setTab] = useState<"how" | "video">("how");
  const [videoFailed, setVideoFailed] = useState(false);
  const video = { p1: "vector-search", p2: "agents", p3: "convex" }[id];
  const title = t(`dash.${id}.title` as Parameters<T>[0]);
  return (
    <article className="pillar">
      <header className="pillar-head">
        <span className="pillar-n" aria-hidden="true">
          {n}
        </span>
        <h3>{title}</h3>
      </header>
      <p className="pillar-body">{t(`dash.${id}.body` as Parameters<T>[0])}</p>
      <div className="pillar-tabs" role="tablist" aria-label={title}>
        <button type="button" role="tab" aria-selected={tab === "how"} onClick={() => setTab("how")}>
          {t("dash.tabHow")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "video"} onClick={() => setTab("video")}>
          {t("dash.tabVideo")}
        </button>
      </div>
      <div className="pillar-stage" role="tabpanel">
        {tab === "how" ? (
          <Flow steps={steps} label={title} />
        ) : videoFailed ? (
          <p className="pillar-missing">{t("dash.videoMissing")}</p>
        ) : (
          <video
            key={video}
            className="pillar-video"
            src={`/dashboard/${video}.webm`}
            poster={`/dashboard/${video}.png`}
            muted
            loop
            playsInline
            autoPlay
            controls
            onError={() => setVideoFailed(true)}
          />
        )}
      </div>
      <dl className="pillar-stats">
        {stats.map((s) => (
          <div key={s.label}>
            <dt>{s.label}</dt>
            <dd>
              {s.value}
              {s.sub && <small>{s.sub}</small>}
            </dd>
          </div>
        ))}
      </dl>
    </article>
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
  const now = useNow();
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [seen, setSeen] = useState<unknown>(null);
  if (data && data !== seen && now) {
    setSeen(data);
    setLoadedAt(now);
  }

  const nf = useMemo(() => new Intl.NumberFormat(locale(lang)), [lang]);
  const tFmt = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale(lang), win.hours > 48 ? { weekday: "short", hour: "numeric" } : { hour: "numeric", minute: "2-digit" });
    return (x: number) => f.format(new Date(x));
  }, [lang, win.hours]);

  const ago = (() => {
    if (!loadedAt) return "";
    const s = Math.max(0, Math.round((now - loadedAt) / 1000));
    if (s < 5) return t("dash.justNow");
    if (s < 60) return t("dash.secondsAgo", { n: s });
    return t("dash.minutesAgo", { n: Math.round(s / 60) });
  })();

  const by = (names: readonly string[]) => merge((data?.agents ?? []).filter((a) => names.includes(a.agent)));
  const claude = by(GROUPS[0].agents);
  const apify = by(["apify"]);
  const search = by(["search"]);

  // Re-bin the 15-minute series into the window's step, per group.
  const charts = useMemo(() => {
    if (!data) return null;
    const binMs = win.bin * 60_000;
    const t1 = Math.ceil(data.now / binMs) * binMs;
    const t0 = t1 - win.hours * 3600_000;
    const mk = (metric: "ok" | "time") =>
      GROUPS.filter((g) => metric === "ok" || g.key !== "checks").map((g): Series => {
        const bins = new Map<number, { runs: number; ok: number; tw: number; tsum: number }>();
        for (const p of data.series) {
          if (!(g.agents as readonly string[]).includes(p.agent) || p.t < t0) continue;
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
          .map(([b, c]) => ({ t: b + binMs / 2, n: c.runs, v: metric === "ok" ? (c.runs ? (c.ok / c.runs) * 100 : null) : c.tw ? c.tsum / c.tw / 1000 : null }));
        return { key: g.key, label: t(`dash.g.${g.key}` as Parameters<T>[0]), color: g.color, points };
      });
    const ok = mk("ok");
    const time = mk("time");
    const maxT = Math.max(5, ...time.flatMap((s) => s.points.map((p) => p.v ?? 0)));
    return { t0, t1, ok, time, timeMax: Math.ceil(maxT / 5) * 5 };
  }, [data, win, t]);

  const binText = win.bin < 60 ? `${win.bin} min` : `${win.bin / 60} h`;
  const vsCode = JSON.stringify({ servers: { recount: { type: "http", url: MCP_URL } } }, null, 2);
  const claudeCmd = `claude mcp add --transport http recount ${MCP_URL}`;

  return (
    <div className="dash">
      <header className="dash-hero">
        <p className="eyebrow">{t("dash.eyebrow")}</p>
        <h1>{t("dash.title")}</h1>
        <p className="dash-lede">{t("dash.lede")}</p>
        <div className="dash-bar">
          <p className="dash-live" aria-live="polite">
            <span className="dash-dot" aria-hidden="true" />
            {t("dash.live")}
            {loadedAt && <span className="dash-ago"> · {t("dash.updated", { ago })}</span>}
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
          <section className="dash-kpis" aria-label={t("dash.title")}>
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
            <h2>{t("dash.pillarsTitle")}</h2>
            <div className="pillars">
              <Pillar
                n={1}
                id="p1"
                steps={[t("dash.p1.s1"), t("dash.p1.s2"), t("dash.p1.s3"), t("dash.p1.s4"), t("dash.p1.s5")]}
                stats={[
                  { label: t("dash.p1.statRuns"), value: nf.format(search.runs) },
                  { label: t("dash.p1.statHit"), value: pctText(search.score) },
                  { label: t("dash.p1.statTime"), value: secs(search.p50ms) },
                ]}
              />
              <Pillar
                n={2}
                id="p2"
                steps={[t("dash.p2.s1"), t("dash.p2.s2"), t("dash.p2.s3"), t("dash.p2.s4"), t("dash.p2.s5")]}
                stats={[
                  { label: t("dash.p2.statModel"), value: nf.format(claude.runs), sub: t("dash.okShort", { pct: pctText(claude.okRate) }) },
                  { label: t("dash.p2.statApify"), value: nf.format(apify.runs), sub: t("dash.okShort", { pct: pctText(apify.okRate) }) },
                  { label: t("dash.p2.statFallback"), value: nf.format(claude.fallbacks) },
                ]}
              />
              <Pillar
                n={3}
                id="p3"
                steps={[t("dash.p3.s1"), t("dash.p3.s2"), t("dash.p3.s3"), t("dash.p3.s4")]}
                stats={[
                  { label: t("dash.p3.statSteps"), value: nf.format(data.convex.steps) },
                  { label: t("dash.p3.statBills"), value: nf.format(data.convex.cases) },
                  { label: t("dash.p3.statChat"), value: nf.format(data.convex.chat) },
                ]}
              />
            </div>
          </section>

          {charts && (
            <section className="dash-section">
              <h2>{t("dash.chartsTitle")}</h2>
              <p className="dash-sub">{t("dash.chartsLede", { bin: binText })}</p>
              <div className="dash-charts">
                <figure className="dash-chart">
                  <figcaption>{t("dash.chartOk")}</figcaption>
                  <LineChart series={charts.ok} t0={charts.t0} t1={charts.t1} yMax={100} yFmt={(v) => `${Math.round(v)}%`} tFmt={tFmt} runsLabel={t("dash.colRuns")} empty={t("dash.chartEmpty")} />
                </figure>
                <figure className="dash-chart">
                  <figcaption>{t("dash.chartTime")}</figcaption>
                  <LineChart series={charts.time} t0={charts.t0} t1={charts.t1} yMax={charts.timeMax} yFmt={(v) => `${Math.round(v * 10) / 10}`} tFmt={tFmt} runsLabel={t("dash.colRuns")} empty={t("dash.chartEmpty")} />
                </figure>
              </div>
              <details className="dash-table">
                <summary>{t("dash.table")}</summary>
                <div className="dash-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t("dash.colTime")}</th>
                        {charts.ok.map((s) => (
                          <th key={s.key} scope="col">
                            {s.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...new Set(charts.ok.flatMap((s) => s.points.map((p) => p.t)))]
                        .sort((a, b) => b - a)
                        .map((tt) => (
                          <tr key={tt}>
                            <th scope="row">{tFmt(tt)}</th>
                            {charts.ok.map((s) => {
                              const p = s.points.find((q) => q.t === tt);
                              const tp = charts.time.find((q) => q.key === s.key)?.points.find((q) => q.t === tt);
                              return (
                                <td key={s.key}>
                                  {p ? `${Math.round(p.v ?? 0)}% · ${p.n} ${t("dash.colRuns")}${tp?.v != null ? ` · ${tp.v.toFixed(1)} s` : ""}` : "–"}
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

          <section className="dash-section dash-two">
            <div>
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
                      <th scope="col">{t("dash.colScore")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.agents.map((a) => (
                      <tr key={a.agent}>
                        <th scope="row">
                          {agentName(a.agent, t)}
                          {a.models.length > 0 && <small>{a.models.join(", ")}</small>}
                        </th>
                        <td>{nf.format(a.runs)}</td>
                        <td>{pctText(a.okRate)}</td>
                        <td>{secs(a.p50ms)}</td>
                        <td>{secs(a.p90ms)}</td>
                        <td>{pctText(a.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h2>{t("dash.feedTitle")}</h2>
              <ol className="dash-feed">
                {data.recent.map((r, i) => (
                  <li key={`${r.at}-${r.agent}-${i}`}>
                    <span className={r.ok ? "feed-ok" : "feed-bad"}>{r.ok ? "✓" : "✕"}</span>
                    <span className="feed-what">
                      {agentName(r.agent, t)}
                      <small>
                        {new Intl.DateTimeFormat(locale(lang), { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(r.at))}
                        {r.ms > 0 ? ` · ${secs(r.ms)}` : ""} · {r.ok ? t("dash.feedOk") : t("dash.feedFail")}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </>
      )}

      <section className="dash-section">
        <h2>{t("dash.checksTitle")}</h2>
        <p className="dash-sub">{t("dash.checksLede")}</p>
        <ul className="dash-checks">
          {VALIDATION.map((v) => (
            <li key={v.id}>
              <span className="check-k">{t(`dash.v.${v.id}` as Parameters<T>[0])}</span>
              <strong>{t(`dash.vr.${v.id}` as Parameters<T>[0])}</strong>
              <small>{t("dash.source", { src: v.source })}</small>
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
