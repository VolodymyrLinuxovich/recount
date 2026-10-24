"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CaMap } from "./CaMap";
import { type Audit, isFlagged, longDate, place, worst } from "./data";
import { HospitalView } from "./HospitalView";

async function loadAudit(): Promise<{ audit: Audit; sample: boolean }> {
  const real = await fetch("/audit/findings.json", { cache: "no-store" }).catch(() => null);
  if (real?.ok && real.headers.get("content-type")?.includes("json")) return { audit: await real.json(), sample: false };
  const res = await fetch("/audit/findings.sample.json", { cache: "no-store" });
  return { audit: await res.json(), sample: true };
}

const keyFromHash = () => {
  const m = typeof window !== "undefined" ? window.location.hash.match(/^#h=(.+)$/) : null;
  return m ? decodeURIComponent(m[1]) : null;
};

export function AuditApp() {
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

  if (failed) return <p className="error-note">We couldn&rsquo;t load the audit data.</p>;
  if (!data) return <p className="quiet">Loading the statewide audit…</p>;

  const { audit, sample } = data;
  const flagged = audit.hospitals.filter(isFlagged).length;
  const hospital = audit.hospitals.find((h) => h.key === selected) ?? null;

  const severity = (h: (typeof audit.hospitals)[number]) =>
    h.findings.reduce((a, f) => a + (f.verdict === "conflict" ? 3 : f.verdict === "likely" ? 2 : 1), 0);
  const mostFlagged = audit.hospitals
    .filter(isFlagged)
    .sort((a, b) => severity(b) - severity(a))
    .slice(0, 5);

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
          Sample data. These hospitals are made up; the real audit results will replace them.
        </p>
      )}

      <header>
        <p className="eyebrow">Statewide audit · {longDate(audit.generatedAt)}</p>
        <h1 className="h-answer audit-headline">
          We read every California hospital&rsquo;s financial assistance policy.{" "}
          <span className="audit-n">{flagged}</span> of them conflict with state law.
        </h1>
        <p className="lede">
          We checked the current charity care, discount, and debt collection policies of {audit.hospitalsChecked} of{" "}
          {audit.hospitalsTotal} hospitals in the state&rsquo;s database against the rules in force since 2025: no deadlines to
          apply, no asset tests, simple proof of income, no credit reporting, no liens on homes, no Medi-Cal-first
          requirement. Every flag quotes the policy next to the law.
        </p>
      </header>

      <section aria-labelledby="map-h" className="wide">
        <h2 id="map-h" className="visually-hidden">
          Map
        </h2>
        <div className="map-and-search">
          <CaMap hospitals={audit.hospitals} selected={selected} onSelect={select} />
          <div className="finder">
            <label className="h-section" htmlFor="find">
              Find your hospital
            </label>
            <input
              id="find"
              className="find-input"
              type="search"
              placeholder="Name, city, or county"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
            />
            {q.trim().length >= 2 && (
              <ul className="find-results" aria-live="polite">
                {matches.length === 0 && <li className="quiet">No hospital by that name in our list.</li>}
                {matches.map((h) => (
                  <li key={h.key}>
                    <button onClick={() => select(h.key)}>
                      <i className={`dot-key dot-${worst(h)}`} aria-hidden />
                      <span>
                        <span className="find-name">{h.name}</span>
                        <span className="find-place">{place(h)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="quiet find-hint">Or tap a dot on the map.</p>
            {q.trim().length < 2 && mostFlagged.length > 0 && (
              <div className="most">
                <div className="versus-label">Most flags</div>
                <ul className="find-results">
                  {mostFlagged.map((h) => (
                    <li key={h.key}>
                      <button onClick={() => select(h.key)} aria-current={h.key === selected || undefined}>
                        <i className={`dot-key dot-${worst(h)}`} aria-hidden />
                        <span>
                          <span className="find-name">{h.name}</span>
                          <span className="find-place">
                            {place(h)} · {h.findings.length} {h.findings.length === 1 ? "flag" : "flags"}
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
          What we found, rule by rule
        </h2>
        <p className="quiet">Number of hospitals with a policy that goes against each rule.</p>
        <ul className="rule-rows">
          {ruleRows.map(({ r, c, total }) => (
            <li key={r.id}>
              <div className="rule-row-head">
                <span className="rule-title">{r.title}</span>
                <span className="rule-count">
                  {c.conflict + c.likely}
                  {c.ask > 0 && <span className="quiet"> +{c.ask} to ask</span>}
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
                    {" "}
                    · {c.conflict} conflict, {c.likely} likely
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="method-h" className="method">
        <h2 id="method-h" className="h-small">
          How we did this
        </h2>
        <p>
          We took each hospital&rsquo;s policy documents from the state&rsquo;s hospital database (HCAI) and read them in
          full. When a sentence matched one of the rules above, we flagged it and reviewed it together with the text
          around it.
        </p>
        <p>
          Flags are reviewed with the surrounding text; &lsquo;likely&rsquo; and &lsquo;worth asking&rsquo; are not legal
          conclusions. Policies change; we show each document&rsquo;s effective date.
        </p>
        <p className="quiet">
          Checked {audit.hospitalsChecked} of {audit.hospitalsTotal} hospitals. Data from {longDate(audit.generatedAt)}.
        </p>
      </section>
    </div>
  );
}
