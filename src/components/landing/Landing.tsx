"use client";

// The home page below the masthead: a centered hero, the problem in sourced numbers,
// a six-step "See how it works" scroll story, a way into Lupa, and a final call to action.
// StartScreen owns the real behavior (file input, onboarding, uploads) and passes it in.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BrandMark } from "../BrandMark";
import { setHelperOpen } from "../helper/openStore";
import { useT } from "../i18n/I18nProvider";
import type { Key, PlainKey } from "../i18n/strings";
import { useCountUp, useInView, useReducedMotion } from "./hooks";
import { Lupa } from "./Lupa";
import "./landing.css";

// The real sample bill (convex/lib/sampleBill.json).
const BILL: { n: number; amt: number; flag?: "landing.overList" | "landing.twice" }[] = [
  { n: 1, amt: 6084 },
  { n: 2, amt: 4403 },
  { n: 3, amt: 482, flag: "landing.overList" },
  { n: 4, amt: 528 },
  { n: 5, amt: 269 },
  { n: 6, amt: 269, flag: "landing.twice" },
  { n: 7, amt: 287 },
  { n: 8, amt: 419 },
];
const lineKey = (n: number) => `landing.line${n}` as PlainKey;

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const i = (n: number) => ({ "--i": n }) as CSSProperties;

type Actions = {
  onPhoto: () => void;
  onSample: () => void;
  busy: null | "photo" | "sample";
  photoLabel: string;
  sampleLabel: string;
};

export function Landing({ actions, error, recent, install }: { actions: Actions; error: ReactNode; recent: ReactNode; install: ReactNode }) {
  return (
    <div className="landing">
      <Hero actions={actions} error={error} />
      {recent && <div className="ld-wrap ld-recent">{recent}</div>}
      <Problem />
      <How />
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
  {
    big: "landing.stat3Big",
    text: "landing.stat3",
    src: { name: "KFF Health News", href: "https://kffhealthnews.org/news/article/charity-care-settlement-debt-relief-patient-refunds-santa-clara-california/" },
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

/* ─────────────── How it works: a scroll story ─────────────── */
const STEPS: [Key, Key, (on: boolean) => ReactNode][] = [
  ["landing.step1T", "landing.step1", (on) => <SnapScreen on={on} />],
  ["landing.step2T", "landing.step2", (on) => <ReadingScreen on={on} />],
  ["landing.step3T", "landing.step3", (on) => <FlagScreen on={on} />],
  ["landing.step4T", "landing.step4", () => <QuestionScreen />],
  ["landing.step5T", "landing.step5", (on) => <AnswerScreen on={on} />],
  ["landing.step6T", "landing.step6", () => <LetterScreen />],
];

function How() {
  const { t } = useT();
  return (
    <section className="ld-how" id="how" aria-labelledby="ld-how-h">
      <div className="ld-wrap">
        <h2 id="ld-how-h" className="ld-h2 ld-how-h">
          {t("landing.howH")}
        </h2>
        {STEPS.map(([title, text, screen], k) => (
          <Step key={title} n={k + 1} title={t(title as PlainKey)} text={t(text as PlainKey)}>
            {screen}
          </Step>
        ))}
      </div>
    </section>
  );
}

function Step({ n, title, text, children }: { n: number; title: string; text: string; children: (on: boolean) => ReactNode }) {
  return (
    <Reveal as="div" className="ld-step" labelledBy={`ld-step-${n}`} threshold={0.35}>
      {(on) => (
        <>
          <div className="ld-step-copy rv" style={i(0)}>
            <span className="ld-step-n" aria-hidden="true">
              {n}
            </span>
            <h3 id={`ld-step-${n}`} className="ld-h3">
              {title}
            </h3>
            <p>{text}</p>
          </div>
          <div className="ld-phone rv" style={i(1)} aria-hidden="true" inert>
            <div className="ld-phone-bar">
              <BrandMark className="ld-phone-mark" />
              <span>Recount</span>
            </div>
            {children(on)}
          </div>
        </>
      )}
    </Reveal>
  );
}

function SnapScreen({ on }: { on: boolean }) {
  const { t } = useT();
  return (
    <div className="ld-scr" data-on={on}>
      <div className="ld-viewfinder">
        <span className="ld-corner ld-corner--tl" />
        <span className="ld-corner ld-corner--tr" />
        <span className="ld-corner ld-corner--bl" />
        <span className="ld-corner ld-corner--br" />
        <div className="ld-paper">
          <p className="ld-paper-h">ZSFG</p>
          <p className="ld-paper-s">{t("landing.itemized")}</p>
          {BILL.map((l) => (
            <span key={l.n} className="ld-paper-line">
              <i />
              <b>{usd(l.amt)}</b>
            </span>
          ))}
          <span className="ld-paper-total">
            <i />
            <b>$12,741</b>
          </span>
        </div>
        <span className="ld-flash" />
      </div>
      <p className="ld-snap-ok">
        <CheckIcon /> {t("landing.snapOk")}
      </p>
      <div className="ld-shutter">
        <span />
      </div>
    </div>
  );
}

function ReadingScreen({ on }: { on: boolean }) {
  const { t } = useT();
  const checks: PlainKey[] = ["landing.read1", "landing.read2"];
  return (
    <div className="ld-scr">
      <p className="ld-scr-title">{t("landing.readTitle")}</p>
      <div className="ld-mini-bill">
        {BILL.map((l) => (
          <div key={l.n} className="ld-mini-line">
            <span>{t(lineKey(l.n))}</span>
            <span>{usd(l.amt)}</span>
          </div>
        ))}
        {on && <span className="ld-sweep" />}
      </div>
      <ul className="ld-checks">
        {checks.map((k, j) => (
          <li key={k} style={i(j)}>
            <span className="ld-tick">
              <svg viewBox="0 0 24 24">
                <path d="M6 12.5l4 4L18 8" pathLength={1} />
              </svg>
            </span>
            {t(k)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlagScreen({ on }: { on: boolean }) {
  const { t } = useT();
  const saved = useCountUp(349, on, 1400, 2200);
  return (
    <div className="ld-scr">
      <p className="ld-scr-title">{t("landing.flagTitle")}</p>
      <ol className="ld-ledger-lines ld-ledger-lines--sm">
        {BILL.map((l) => (
          <li key={l.n} className={l.flag ? "is-flag" : undefined} style={i(l.n)}>
            <span className="ld-ln">{l.n}</span>
            <span className="ld-lw">
              {t(lineKey(l.n))}
              {l.flag && <em className="ld-flag">{t(l.flag)}</em>}
            </span>
            <span className="ld-la">{usd(l.amt)}</span>
          </li>
        ))}
      </ol>
      <div className="ld-saved">
        <span>{t("landing.save")}</span>
        <strong>{usd(saved)}</strong>
      </div>
    </div>
  );
}

function QuestionScreen() {
  const { t } = useT();
  return (
    <div className="ld-scr">
      <div className="ld-q-top">
        <div className="rc-progress" style={{ "--p": "34%" } as CSSProperties}>
          <span />
        </div>
        <span className="ld-q-count">{t("landing.qCount")}</span>
      </div>
      <p className="ld-q">{t("landing.qAsk")}</p>
      <p className="ld-q-help">{t("landing.qHelp")}</p>
      <div className="ld-stepper">
        <span>−</span>
        <output>3</output>
        <span>+</span>
      </div>
      <div className="ld-bar">
        <span className="btn ld-bar-btn">{t("landing.qBack")}</span>
        <span className="btn btn-primary ld-bar-btn">{t("landing.qNext")}</span>
      </div>
    </div>
  );
}

function AnswerScreen({ on }: { on: boolean }) {
  const { t } = useT();
  const counted = useCountUp(12741, on, 1500, 500);
  const left = 12741 - counted;
  const done = on && left === 0;
  return (
    <div className="ld-scr ld-answer" data-done={done}>
      <span className="ld-ok-badge">
        <svg viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="21" pathLength={1} />
          <path d="M15 24.5l6.5 6.5L33.5 18" pathLength={1} />
        </svg>
      </span>
      <p className="ld-answer-k">{t("landing.based")}</p>
      <p className="ld-answer-h">
        {t("landing.owe")} <span className="ld-answer-num">{usd(left)}</span>
      </p>
      <p className="ld-answer-was">
        {t("landing.billed")} <s>$12,741</s>
      </p>
      <div className="ld-meter">
        <div className="ld-meter-track">
          <span className="ld-meter-free" />
          <span className="ld-meter-you" />
        </div>
        <div className="ld-meter-keys">
          <span>{t("landing.you")}</span>
          <span>{t("landing.free")}</span>
        </div>
      </div>
      <p className="ld-answer-why">{t("landing.why")}</p>
      <span className="btn btn-primary ld-bar-btn ld-block">{t("landing.letters")}</span>
    </div>
  );
}

function LetterScreen() {
  const { t } = useT();
  return (
    <div className="ld-scr">
      <p className="ld-scr-title">{t("landing.letterTitle")}</p>
      <div className="ld-letter">
        <p className="ld-letter-meta">{t("landing.letterTo")}</p>
        <p className="ld-letter-meta">{t("landing.letterRe")}</p>
        <p>{t("landing.letterP1")}</p>
        <p>{t("landing.letterP2")}</p>
        <span className="ld-letter-skel" />
        <span className="ld-letter-skel ld-letter-skel--short" />
      </div>
      <p className="ld-approve">
        <span className="ld-box">
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        {t("landing.letterCheck")}
      </p>
      <span className="btn btn-primary ld-bar-btn ld-block">{t("landing.letterApprove")}</span>
      <p className="ld-letter-note">{t("landing.letterNote")}</p>
    </div>
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
function CheckIcon() {
  return (
    <svg className="ld-ico ld-ico--sm ld-ico--ok" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
