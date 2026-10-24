"use client";

// The home page below the masthead: a centered hero, the problem in sourced numbers,
// a way into Lupa, and a final call to action.
// StartScreen owns the real behavior (file input, onboarding, uploads) and passes it in.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { setHelperOpen } from "../helper/openStore";
import { useT } from "../i18n/I18nProvider";
import type { PlainKey } from "../i18n/strings";
import { useInView, useReducedMotion } from "./hooks";
import { Lupa } from "./Lupa";
import "./landing.css";

const i = (n: number) => ({ "--i": n }) as CSSProperties;

type Actions = {
  onPhoto: () => void;
  onSample: () => void;
  busy: null | "photo" | "sample";
  photoLabel: string;
  sampleLabel: string;
};

export function Landing({ actions, error, install }: { actions: Actions; error: ReactNode; install: ReactNode }) {
  return (
    <div className="landing">
      <Hero actions={actions} error={error} />
      <Problem />
      <AskLupa />
      <FinalCta actions={actions} />
      {install && <div className="ld-wrap ld-install">{install}</div>}
    </div>
  );
}

function Reveal({
  as = "section",
  className = "",
  id,
  labelledBy,
  threshold = 0.01,
  children,
}: {
  as?: "section" | "div";
  className?: string;
  id?: string;
  labelledBy?: string;
  threshold?: number;
  children: (inView: boolean) => ReactNode;
}) {
  const [ref, inView] = useInView<HTMLDivElement>(threshold);
  const Tag = as;
  return (
    <Tag ref={ref} id={id} className={className} data-in={inView} aria-labelledby={labelledBy}>
      {children(inView)}
    </Tag>
  );
}

function Ctas({ actions, onDark = false }: { actions: Actions; onDark?: boolean }) {
  const { busy } = actions;
  return (
    <div className={`ld-ctas${onDark ? " ld-ctas--dark" : ""}`}>
      <button type="button" className="btn btn-primary ld-cta" onClick={actions.onPhoto} disabled={busy !== null}>
        <CameraIcon /> {actions.photoLabel}
      </button>
      <button type="button" className="btn ld-cta ld-cta-2" onClick={actions.onSample} disabled={busy !== null}>
        {actions.sampleLabel}
      </button>
    </div>
  );
}

/* ─────────────── Hero ─────────────── */
function Hero({ actions, error }: { actions: Actions; error: ReactNode }) {
  const { t } = useT();
  return (
    <Reveal className="ld-hero" labelledBy="start-title">
      {() => (
        <div className="ld-wrap ld-hero-in">
          <h1 id="start-title" className="ld-h1 rv" style={i(0)}>
            {t("landing.h1a")} <span>{t("landing.h1b")}</span>
          </h1>
          <p className="ld-lead rv" style={i(1)}>
            {t("landing.lead")}
          </p>
          <div className="ld-cta-wrap rv" style={i(2)}>
            <Ctas actions={actions} />
            {error}
          </div>
          <ul className="ld-trust rv" style={i(3)}>
            <li>{t("landing.trust1")}</li>
            <li>{t("landing.trust2")}</li>
          </ul>
        </div>
      )}
    </Reveal>
  );
}

/* ─────────────── Problem, in sourced numbers ─────────────── */
const STATS: { big: PlainKey; text: PlainKey; src?: { name: string; href: string } }[] = [
  {
    big: "landing.stat1Big",
    text: "landing.stat1",
    src: { name: "KFF / Peterson Health System Tracker", href: "https://www.healthsystemtracker.org/brief/the-burden-of-medical-debt-in-the-united-states/" },
  },
  {
    big: "landing.stat2Big",
    text: "landing.stat2",
    src: {
      name: "California Attorney General, 2022",
      href: "https://www.oag.ca.gov/news/press-releases/attorney-general-bonta-issues-consumer-alert-following-reports-hospitals-failing",
    },
  },
  { big: "landing.stat4Big", text: "landing.stat4" },
];

function Problem() {
  const { t } = useT();
  return (
    <Reveal className="ld-problem" labelledBy="ld-problem-h">
      {() => (
        <div className="ld-wrap">
          <h2 id="ld-problem-h" className="ld-h2 rv" style={i(0)}>
            {t("landing.problemH")}
          </h2>
          <div className="ld-stats">
            {STATS.map((st, k) => (
              <article key={st.big} className="ld-stat rv" style={i(k + 1)}>
                <p className="ld-stat-big">{t(st.big)}</p>
                <p className="ld-stat-text">{t(st.text)}</p>
                {st.src ? (
                  <a className="ld-src" href={st.src.href} target="_blank" rel="noreferrer">
                    {t("landing.source")}: {st.src.name}
                  </a>
                ) : (
                  <a className="ld-src ld-src--ours" href="/audit">
                    {t("landing.seeAudit")} →
                  </a>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </Reveal>
  );
}

/* ─────────────── Ask Lupa: a short preview, and the way into the real panel ─────────────── */
const QS: PlainKey[] = ["landing.q1", "landing.q2", "landing.q3"];

function AskLupa() {
  const { t } = useT();
  return (
    <Reveal className="ld-lupa-sec" id="lupa" labelledBy="ld-lupa-h">
      {(inView) => (
        <div className="ld-wrap ld-lupa-grid">
          <div className="ld-lupa-copy rv" style={i(0)}>
            <span className="ld-lupa-mark">
              <Lupa size={40} />
            </span>
            <h2 id="ld-lupa-h" className="ld-h2">
              {t("landing.lupaH")}
            </h2>
            <p className="ld-sub">{t("landing.lupaSub")}</p>
            <button type="button" className="btn btn-primary ld-cta ld-open-chat" onClick={(e) => setHelperOpen(true, e.currentTarget)}>
              {t("landing.lupaOpen")}
            </button>
          </div>
          <ChatPreview inView={inView} />
        </div>
      )}
    </Reveal>
  );
}

type Phase = "idle" | "thinking" | "streaming" | "done";

function ChatPreview({ inView }: { inView: boolean }) {
  const { t } = useT();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState(0);
  const answer = t("landing.a1");
  const full = useRef(answer.length);
  useEffect(() => {
    full.current = answer.length;
  }, [answer]);

  useEffect(() => {
    if (!inView) return;
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        if (reduced) {
          setShown(Number.MAX_SAFE_INTEGER);
          setPhase("done");
          return;
        }
        setPhase("thinking");
        timers.push(
          window.setTimeout(() => {
            setPhase("streaming");
            let n = 0;
            const iv = window.setInterval(() => {
              n += 2;
              setShown(n);
              if (n >= full.current) {
                window.clearInterval(iv);
                setPhase("done");
              }
            }, 24);
            timers.push(iv);
          }, 1400),
        );
      }, 900),
    );
    return () =>
      timers.forEach((x) => {
        window.clearTimeout(x);
        window.clearInterval(x);
      });
  }, [inView, reduced]);

  return (
    <div className="ld-chat rc-card rv" style={i(1)}>
      <div className="ld-chat-head" aria-hidden="true">
        <Lupa size={36} mood={phase === "thinking" || phase === "streaming" ? "think" : "idle"} />
        <div>
          <p className="ld-chat-name">Lupa</p>
          <p className="ld-chat-status">{phase === "thinking" ? t("landing.lupaLooking") : t("landing.lupaRole")}</p>
        </div>
      </div>
      <div className="ld-chat-log">
        <div className="ld-msg ld-msg--lupa" aria-hidden="true">
          {t("landing.lupaGreet")}
        </div>
        <div className="ld-chips" role="group" aria-label={t("landing.lupaSuggested")}>
          {QS.map((q) => (
            <button key={q} type="button" className="ld-chip" onClick={(e) => setHelperOpen(true, e.currentTarget)}>
              {t(q)}
            </button>
          ))}
        </div>
        <div aria-hidden="true" className="ld-chat-demo">
          <div className="ld-chat-ghost">
            <div className="ld-msg ld-msg--me">{t("landing.q1")}</div>
            <div className="ld-msg ld-msg--lupa">
              {answer}
              <span className="ld-caret" />
            </div>
          </div>
          <div>
          {phase !== "idle" && <div className="ld-msg ld-msg--me">{t("landing.q1")}</div>}
          {phase === "thinking" && (
            <div className="ld-msg ld-msg--lupa ld-typing">
              <span />
              <span />
              <span />
            </div>
          )}
          {(phase === "streaming" || phase === "done") && (
            <div className="ld-msg ld-msg--lupa">
              {answer.slice(0, shown)}
              {phase === "streaming" && <span className="ld-caret" />}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Final call to action ─────────────── */
function FinalCta({ actions }: { actions: Actions }) {
  const { t } = useT();
  return (
    <Reveal className="ld-final" labelledBy="ld-final-h">
      {() => (
        <div className="ld-wrap ld-final-in rv" style={i(0)}>
          <h2 id="ld-final-h" className="ld-h2">
            {t("landing.finalH")}
          </h2>
          <p>{t("landing.finalP")}</p>
          <Ctas actions={actions} onDark />
        </div>
      )}
    </Reveal>
  );
}

/* icons */
function CameraIcon() {
  return (
    <svg className="ld-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  );
}
