"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n/I18nProvider";
import { CaMap } from "./CaMap";
import { type Audit, type Hospital, type Rule, displayName, isFlagged, longDate, place, resolveKey, ruleTitle, worst } from "./data";
import { HospitalView } from "./HospitalView";
import { useCountUp, useInView } from "./motion";
import type { PlainKey } from "../i18n/strings";

/** The six rules, listed under "What we checked". */
const WHAT: PlainKey[] = ["audit.what1", "audit.what2", "audit.what3", "audit.what4", "audit.what5", "audit.what6"];

/** One plain line per rule, by rule id. */
const WHY: Record<string, PlainKey> = {
  DEADLINE: "why.DEADLINE",
  ASSETS: "why.ASSETS",
  INCOME_PROOF: "why.INCOME_PROOF",
  CREDIT_REPORTING: "why.CREDIT_REPORTING",
  LIENS: "why.LIENS",
  MEDICAL_FIRST: "why.MEDICAL_FIRST",
};

const i = (n: number) => ({ "--i": n }) as CSSProperties;

async function loadAudit(): Promise<{ audit: Audit; sample: boolean }> {
  const real = await fetch("/audit/findings.json", { cache: "no-cache" }).catch(() => null);
  if (real?.ok && real.headers.get("content-type")?.includes("json")) return { audit: await real.json(), sample: false };
  const res = await fetch("/audit/findings.sample.json", { cache: "no-cache" });
  return { audit: await res.json(), sample: true };
}

/** Words to search by: lowercase, no punctuation, "st" read as "saint", "&" as "and". */
function searchWords(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w === "st" ? "saint" : w));
}

const keyFromHash = () => {
  const m = typeof window !== "undefined" ? window.location.hash.match(/^#h=(.+)$/) : null;
  return m ? decodeURIComponent(m[1]) : null;
};

function ArrowLeft() {
  return (
    <svg className="a-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg className="a-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** A big figure that counts up once it scrolls into view. Screen readers get the number at once. */
function Figure({ n, label, sub, tone, run, k }: { n: number; label: string; sub?: string; tone: "brand" | "flag" | "lilac"; run: boolean; k: number }) {
  const shown = useCountUp(n, run, 1200, 150 + k * 120);
  return (
    <div className={`a-fig a-fig--${tone} rv`} style={i(k + 1)}>
      <p className="a-fig-n" aria-hidden="true">
        {shown}
      </p>
      <p className="a-fig-label">
        <span className="visually-hidden">{n} </span>
        {label}
      </p>
      {sub && <p className="a-fig-sub">{sub}</p>}
    </div>
  );
}

type RuleStat = { r: Rule; conflict: number; likely: number; total: number };

function RuleCard({ s, max, run, k }: { s: RuleStat; max: number; run: boolean; k: number }) {
  const { t, lang } = useT();
  const shown = useCountUp(s.total, run, 1100, 200 + k * 140);
  const why = WHY[s.r.id];
  return (
    <li className="a-rule-card rv" style={i(k + 1)}>
      <p className="a-rule-n">
        <span aria-hidden="true">{shown}</span>
        <span className="visually-hidden">{s.total}</span> <span className="a-rule-unit">{t("audit.ruleHosp", { n: s.total })}</span>
      </p>
      <h3 className="a-rule-title">{ruleTitle(s.r, s.r.id, lang)}</h3>
      <div
        className="a-bar"
        aria-hidden="true"
        style={{ "--c": `${(s.conflict / max) * 100}%`, "--l": `${(s.likely / max) * 100}%`, "--d": `${300 + k * 140}ms` } as CSSProperties}
      >
        <span className="a-bar-c" />
        <span className="a-bar-l" />
      </div>
      <p className="a-rule-split">{t("audit.ruleSplit", { conflict: s.conflict, likely: s.likely })}</p>
      {why && <p className="a-rule-why">{t(why)}</p>}
      <a className="a-rule-cite" href={s.r.url} target="_blank" rel="noreferrer">
        {t("audit.lawLink")}
        <span className="visually-hidden"> ({s.r.cite})</span>
      </a>
    </li>
  );
}

function Hero({ audit, confirmed, likelyOnly, statewide, sfOnly }: { audit: Audit; confirmed: number; likelyOnly: number; statewide: boolean; sfOnly: boolean }) {
  const { t, lang } = useT();
  const [ref, inView] = useInView<HTMLElement>(0.2);
  const headline = statewide ? t("audit.heroAll") : sfOnly ? t("audit.heroSf") : t("audit.heroSome", { n: audit.hospitalsChecked });
  return (
    <header ref={ref} className="a-hero" data-in={inView}>
      <div className="a-hero-copy">
        <h1 className="a-h1 rv" style={i(0)}>
          {headline}
        </h1>
        <p className="a-date rv" style={i(1)}>
          {t("audit.updated", { date: longDate(audit.generatedAt, lang) })}
        </p>
      </div>
      <div className="a-hero-side">
        <div className="a-figs">
          <Figure
            k={0}
            run={inView}
            n={audit.hospitalsChecked}
            tone="brand"
            label={t("audit.figChecked")}
            sub={audit.hospitalsTotal > audit.hospitalsChecked ? t("audit.figOf", { total: audit.hospitalsTotal }) : undefined}
          />
          <Figure k={1} run={inView} n={confirmed} tone="flag" label={t("audit.figConflict", { n: confirmed })} />
          <Figure k={2} run={inView} n={likelyOnly} tone="lilac" label={t("audit.figLikely", { n: likelyOnly })} />
        </div>
        <Link href="/" className="rc-btn a-hero-cta rv" style={i(4)}>
          {t("audit.checkCta")}
          <ArrowRight />
        </Link>
      </div>
    </header>
  );
}

function Found({ stats }: { stats: RuleStat[] }) {
  const { t } = useT();
  const [ref, inView] = useInView<HTMLElement>(0.25);
  if (!stats.length) return null;
  const max = Math.max(1, ...stats.map((s) => s.total));
  return (
    <section ref={ref} className="a-found" aria-labelledby="found-h" data-in={inView}>
      <h2 id="found-h" className="a-h2 rv" style={i(0)}>
        {t("audit.foundH")}
      </h2>
      <p className="a-sub rv" style={i(0)}>
        {t("audit.foundSub")}
      </p>
      <ol className="a-rule-cards">
        {stats.map((s, k) => (
          <RuleCard key={s.r.id} s={s} max={max} run={inView} k={k} />
        ))}
      </ol>
      <details className="a-disclosure">
        <summary>{t("audit.whatH")}</summary>
        <ul className="a-what">
          {WHAT.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

export function AuditApp() {
  const { t, lang } = useT();
  const [data, setData] = useState<{ audit: Audit; sample: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAudit()
      .then((d) => {
        setData(d);
        setSelected(keyFromHash());
      })
      .catch(() => setFailed(true));
    const onHash = () => setSelected(keyFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const [announce, setAnnounce] = useState("");
  /**
   * Open a hospital. From a list (search results, most flags) focus moves to its name, since
   * the list may be gone. From the map, focus stays on the dot so the arrows keep working,
   * and a polite message says which hospital opened.
   */
  const select = (key: string, from: "map" | "list" = "list") => {
    setSelected(key);
    setQ("");
    history.replaceState(null, "", `#h=${encodeURIComponent(key)}`);
    const h = data?.audit.hospitals.find((x) => x.key === key);
    setAnnounce(from === "map" && h ? t("a11y.mapShowing", { name: displayName(h.name) }) : "");
    requestAnimationFrame(() => {
      if (from === "list") document.getElementById("hospital-h")?.focus({ preventScroll: true });
      const el = viewRef.current;
      if (!el) return;
      // On a laptop the details open beside the map: only scroll when their top is out of sight.
      const top = el.getBoundingClientRect().top;
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      if (!wide || top < 0 || top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const clear = () => {
    setSelected(null);
    setAnnounce("");
    history.replaceState(null, "", window.location.pathname + window.location.search);
    requestAnimationFrame(() => document.getElementById("find")?.focus());
  };

  const matches = useMemo(() => {
    if (!data || q.trim().length < 2) return [];
    const words = searchWords(q);
    if (!words.length) return [];
    return data.audit.hospitals
      .map((h) => {
        const name = searchWords(h.name);
        const all = [...name, ...searchWords(`${h.city ?? ""} ${h.county ?? ""}`)];
        const hit = (w: string, pool: string[]) => pool.some((x) => x.startsWith(w));
        if (!words.every((w) => hit(w, all))) return null;
        return { h, score: words.filter((w) => hit(w, name)).length };
      })
      .filter((x) => x !== null)
      .sort((a, b) => b.score - a.score || a.h.name.localeCompare(b.h.name))
      .map((x) => x.h)
      .slice(0, 8);
  }, [data, q]);

  const homeLink = (
    <Link href="/" className="a-home">
      <ArrowLeft />
      {t("audit.home")}
    </Link>
  );

  if (failed)
    return (
      <div className="audit">
        {homeLink}
        <p className="error-note">{t("audit.loadFailed")}</p>
      </div>
    );
  if (!data)
    return (
      <div className="audit">
        {homeLink}
        <p className="quiet">{t("audit.loading")}</p>
      </div>
    );

  const { audit, sample } = data;
  // Describe exactly the set of hospitals in the file, never more.
  const statewide = audit.hospitalsChecked >= 300;
  const counties = new Set(audit.hospitals.map((h) => h.county).filter(Boolean));
  const sfOnly = !statewide && counties.size === 1 && counties.has("San Francisco");

  // Per hospital, by its worst verdict.
  const confirmed = audit.hospitals.filter((h) => h.findings.some((f) => f.verdict === "conflict")).length;
  const likelyOnly = audit.hospitals.filter(isFlagged).length - confirmed;
  const selectedKey = resolveKey(audit.hospitals, selected);
  const hospital = audit.hospitals.find((h) => h.key === selectedKey) ?? null;

  // Most conflict and likely flags first, then most flags of any kind, then by name.
  const serious = (h: Hospital) => h.findings.filter((f) => f.verdict === "conflict" || f.verdict === "likely").length;
  const byFlags = (a: Hospital, b: Hospital) =>
    serious(b) - serious(a) || b.findings.length - a.findings.length || displayName(a.name).localeCompare(displayName(b.name));
  // The map only helps when we know where the hospitals are.
  const showMap = audit.hospitals.filter((h) => h.lat != null && h.lon != null).length >= 3;
  const mostFlagged = showMap ? audit.hospitals.filter(isFlagged).sort(byFlags).slice(0, 6) : [...audit.hospitals].sort(byFlags);

  // The three rules the most hospitals go against (conflict or likely), counted per hospital.
  const topRules: RuleStat[] = audit.rules
    .map((r) => {
      let conflict = 0;
      let likely = 0;
      for (const h of audit.hospitals) {
        const fs = h.findings.filter((f) => f.rule === r.id);
        if (fs.some((f) => f.verdict === "conflict")) conflict++;
        else if (fs.some((f) => f.verdict === "likely")) likely++;
      }
      return { r, conflict, likely, total: conflict + likely };
    })
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total || b.conflict - a.conflict)
    .slice(0, 3);

  const hospitalRow = (h: Hospital, current = false) => (
    <li key={h.key}>
      <button onClick={() => select(h.key)} aria-current={current || undefined}>
        <i className={`dot-key dot-${worst(h)}`} aria-hidden />
        <span className="find-text">
          <span className="find-name">{displayName(h.name)}</span>
          {place(h, lang) && <span className="find-place">{place(h, lang)}</span>}
        </span>
        {h.findings.length > 0 && <span className={`find-count find-count--${worst(h)}`}>{t("audit.flags", { n: h.findings.length })}</span>}
      </button>
    </li>
  );

  return (
    <div className="audit">
      {homeLink}

      {sample && (
        <p className="sample-banner" role="note">
          {t("audit.sample")}
        </p>
      )}

      <Hero audit={audit} confirmed={confirmed} likelyOnly={likelyOnly} statewide={statewide} sfOnly={sfOnly} />

      <section aria-labelledby="map-h" className={showMap ? "a-app" : "a-app a-app--list"}>
        <h2 id="map-h" className="visually-hidden">
          {t("audit.map")}
        </h2>
        <p className="visually-hidden map-announce" aria-live="polite">
          {announce}
        </p>
        <div className="finder rc-card">
          <label className="finder-label" htmlFor="find">
            {t("audit.find")}
          </label>
          <div className="find-box">
            <svg className="find-ico" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" />
            </svg>
            <input
              id="find"
              className="find-input"
              type="search"
              placeholder={t("audit.findPlaceholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
            />
          </div>
          {q.trim().length >= 2 && (
            <ul className="find-results" aria-live="polite">
              {matches.length === 0 && <li className="find-none">{t("audit.noMatch")}</li>}
              {matches.map((h) => hospitalRow(h))}
            </ul>
          )}
          {showMap && q.trim().length < 2 && <p className="find-hint">{t("audit.tapDot")}</p>}
        </div>

        {/* Search first in reading and Tab order; on a laptop the map sits to its left. */}
        {showMap && (
          <div className="a-map-col">
            <CaMap hospitals={audit.hospitals} selected={selectedKey} onSelect={(key) => select(key, "map")} />
          </div>
        )}

        <div ref={viewRef} className="a-panel">
          {hospital ? (
            <>
              <button type="button" className="a-back" onClick={clear}>
                <ArrowLeft />
                {t("audit.back")}
              </button>
              <HospitalView h={hospital} rules={audit.rules} />
            </>
          ) : (
            mostFlagged.length > 0 && (
              <div className="most rc-card">
                <h3 className="most-h">{showMap ? t("audit.mostFlags") : t("audit.checkedList")}</h3>
                <ul className="find-results">{mostFlagged.map((h) => hospitalRow(h, h.key === selectedKey))}</ul>
              </div>
            )
          )}
        </div>
      </section>

      <Found stats={topRules} />

      <details className="a-disclosure a-method">
        <summary>{t("audit.methodH")}</summary>
        <p>{t("audit.method1")}</p>
        <p>{t("audit.method2")}</p>
        <p className="a-method-note">
          {audit.hospitalsChecked >= audit.hospitalsTotal
            ? t("audit.checkedAll", { n: audit.hospitalsChecked })
            : t("audit.checkedSome", { checked: audit.hospitalsChecked, total: audit.hospitalsTotal })}
          {t("audit.dataFrom", { date: longDate(audit.generatedAt, lang) })}
        </p>
      </details>

      <section className="a-end" aria-labelledby="end-h">
        <h2 id="end-h" className="a-end-h">
          {t("audit.endH")}
        </h2>
        <Link href="/" className="rc-btn a-end-cta">
          {t("audit.checkCta")}
          <ArrowRight />
        </Link>
      </section>
    </div>
  );
}
