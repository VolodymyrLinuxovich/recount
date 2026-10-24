"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n/I18nProvider";
import { CaMap } from "./CaMap";
import { type Audit, displayName, isFlagged, longDate, place, resolveKey, worst } from "./data";
import { HospitalView } from "./HospitalView";

async function loadAudit(): Promise<{ audit: Audit; sample: boolean }> {
  const real = await fetch("/audit/findings.json", { cache: "no-cache" }).catch(() => null);
  if (real?.ok && real.headers.get("content-type")?.includes("json")) return { audit: await real.json(), sample: false };
  const res = await fetch("/audit/findings.sample.json", { cache: "no-cache" });
  return { audit: await res.json(), sample: true };
}

const keyFromHash = () => {
  const m = typeof window !== "undefined" ? window.location.hash.match(/^#h=(.+)$/) : null;
  return m ? decodeURIComponent(m[1]) : null;
};

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

  const select = (key: string) => {
    setSelected(key);
    setQ("");
    history.replaceState(null, "", `#h=${encodeURIComponent(key)}`);
    requestAnimationFrame(() => viewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const matches = useMemo(() => {
    if (!data || q.trim().length < 2) return [];
    const needle = q.trim().toLowerCase();
    return data.audit.hospitals
      .filter((h) => `${h.name} ${h.city ?? ""} ${h.county ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [data, q]);

  if (failed) return <p className="error-note">{t("audit.loadFailed")}</p>;
  if (!data) return <p className="quiet">{t("audit.loading")}</p>;

  const { audit, sample } = data;
  // Describe exactly the set of hospitals in the file, never more.
  const statewide = audit.hospitalsChecked >= 300;
  const counties = new Set(audit.hospitals.map((h) => h.county).filter(Boolean));
  const sfOnly = !statewide && counties.size === 1 && counties.has("San Francisco");
  const scopeHeadline = statewide
    ? t("audit.scopeAll", { checked: audit.hospitalsChecked, total: audit.hospitalsTotal })
    : sfOnly
      ? t("audit.scopeSf")
      : t("audit.scopeSome", { n: audit.hospitalsChecked });

  const confirmed = audit.hospitals.filter((h) => h.findings.some((f) => f.verdict === "conflict")).length;
  const likelyOnly = audit.hospitals.filter(isFlagged).length - confirmed;
  const selectedKey = resolveKey(audit.hospitals, selected);
  const hospital = audit.hospitals.find((h) => h.key === selectedKey) ?? null;

  const severity = (h: (typeof audit.hospitals)[number]) =>
    h.findings.reduce((a, f) => a + (f.verdict === "conflict" ? 3 : f.verdict === "likely" ? 2 : 1), 0);
  // The map only helps when we know where the hospitals are.
  const showMap = audit.hospitals.filter((h) => h.lat != null && h.lon != null).length >= 3;
  const mostFlagged = showMap
    ? audit.hospitals.filter(isFlagged).sort((a, b) => severity(b) - severity(a)).slice(0, 5)
    : [...audit.hospitals].sort((a, b) => severity(b) - severity(a));

  const ruleRows = audit.rules
    .map((r) => {
      const c = { conflict: 0, likely: 0, ask: 0 };
      for (const h of audit.hospitals) {
        const fs = h.findings.filter((f) => f.rule === r.id);
        if (fs.some((f) => f.verdict === "conflict")) c.conflict++;
        else if (fs.some((f) => f.verdict === "likely")) c.likely++;
        else if (fs.some((f) => f.verdict === "ask")) c.ask++;
      }
      return { r, c, total: c.conflict + c.likely + c.ask };
    })
    .sort((a, b) => b.c.conflict + b.c.likely - (a.c.conflict + a.c.likely));
  const maxRow = Math.max(1, ...ruleRows.map((x) => x.total));

  return (
    <div className="audit stack-lg">
      {sample && (
        <p className="sample-banner" role="note">
          {t("audit.sample")}
        </p>
      )}

      <header>
        <p className="eyebrow">{t("audit.eyebrow", { date: longDate(audit.generatedAt, lang) })}</p>
        <h1 className="h-answer audit-headline">
          {scopeHeadline}{" "}
          {confirmed > 0 ? (
            <>
              <span className="audit-n">{confirmed}</span>
              {t("audit.conflictTail", { n: confirmed })}
              {likelyOnly > 0 && t("audit.likelyMore", { n: likelyOnly })}
            </>
          ) : (
            <>
              <span className="audit-n">{likelyOnly}</span>
              {t("audit.likelyTail", { n: likelyOnly })}
            </>
          )}
        </h1>
        <p className="lede">
          {t("audit.lede", {
            checked: audit.hospitalsChecked,
            sf: sfOnly,
            listed: audit.hospitalsTotal > audit.hospitalsChecked ? audit.hospitalsTotal : null,
          })}
        </p>
      </header>

      <section aria-labelledby="map-h" className="wide">
        <h2 id="map-h" className="visually-hidden">
          {t("audit.map")}
        </h2>
        <div className={showMap ? "map-and-search" : "search-only"}>
          {showMap && <CaMap hospitals={audit.hospitals} selected={selectedKey} onSelect={select} />}
          <div className="finder">
            <label className="h-section" htmlFor="find">
              {t("audit.find")}
            </label>
            <input
              id="find"
              className="find-input"
              type="search"
              placeholder={t("audit.findPlaceholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
            />
            {q.trim().length >= 2 && (
              <ul className="find-results" aria-live="polite">
                {matches.length === 0 && <li className="quiet">{t("audit.noMatch")}</li>}
                {matches.map((h) => (
                  <li key={h.key}>
                    <button onClick={() => select(h.key)}>
                      <i className={`dot-key dot-${worst(h)}`} aria-hidden />
                      <span>
                        <span className="find-name">{displayName(h.name)}</span>
                        <span className="find-place">{place(h, lang)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {showMap && <p className="quiet find-hint">{t("audit.tapDot")}</p>}
            {q.trim().length < 2 && mostFlagged.length > 0 && (
              <div className="most">
                <div className="versus-label">{showMap ? t("audit.mostFlags") : t("audit.checkedList")}</div>
                <ul className="find-results">
                  {mostFlagged.map((h) => (
                    <li key={h.key}>
                      <button onClick={() => select(h.key)} aria-current={h.key === selectedKey || undefined}>
                        <i className={`dot-key dot-${worst(h)}`} aria-hidden />
                        <span>
                          <span className="find-name">{displayName(h.name)}</span>
                          <span className="find-place">
                            {[place(h, lang), h.findings.length ? t("audit.flags", { n: h.findings.length }) : t("audit.noConflicts")]
                            .filter(Boolean)
                            .join(" · ")}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      <div ref={viewRef} className="wide hospital-anchor">
        {hospital ? <HospitalView h={hospital} rules={audit.rules} /> : null}
      </div>

      <section aria-labelledby="rules-h" className="wide">
        <h2 id="rules-h" className="h-section">
          {t("audit.rulesH")}
        </h2>
        <p className="quiet">{t("audit.rulesSub")}</p>
        <ul className="rule-rows">
          {ruleRows.map(({ r, c, total }) => (
            <li key={r.id}>
              <div className="rule-row-head">
                <span className="rule-title">{r.title}</span>
                <span className="rule-count">
                  {c.conflict + c.likely}
                  {c.ask > 0 && <span className="quiet">{t("audit.toAsk", { n: c.ask })}</span>}
                </span>
              </div>
              <div className="rule-bar" aria-hidden>
                <span className="bar-conflict" style={{ width: `${(c.conflict / maxRow) * 100}%` }} />
                <span className="bar-likely" style={{ width: `${(c.likely / maxRow) * 100}%` }} />
                <span className="bar-ask" style={{ width: `${(c.ask / maxRow) * 100}%` }} />
              </div>
              <div className="rule-cite">
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.cite}
                </a>
                {total > 0 && (
                  <span className="quiet">
                    {t("audit.ruleCounts", { conflict: c.conflict, likely: c.likely })}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="method-h" className="method">
        <h2 id="method-h" className="h-small">
          {t("audit.methodH")}
        </h2>
        <p>{t("audit.method1")}</p>
        <p>{t("audit.method2")}</p>
        <p className="quiet">
          {audit.hospitalsChecked >= audit.hospitalsTotal
            ? t("audit.checkedAll", { n: audit.hospitalsChecked })
            : t("audit.checkedSome", { checked: audit.hospitalsChecked, total: audit.hospitalsTotal })}
          {t("audit.dataFrom", { date: longDate(audit.generatedAt, lang) })}
        </p>
      </section>
    </div>
  );
}
