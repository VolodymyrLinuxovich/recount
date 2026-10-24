import type { Step } from "./types";

function Mark({ state }: { state: Step["state"] }) {
  if (state === "running") return <span className="step-mark step-running" aria-label="working" />;
  if (state === "done")
    return (
      <svg className="step-mark" viewBox="0 0 20 20" aria-label="done">
        <path d="M3.5 10.5 C5.5 12, 7 14, 8 15.5 C10 11, 13 7, 17 3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  return (
    <span className={`step-mark step-${state}`} aria-label={state === "warn" ? "note" : "problem"}>
      !
    </span>
  );
}

export function StepLog({ steps, live = false }: { steps: Step[]; live?: boolean }) {
  if (!steps.length) return live ? <p className="quiet">Starting…</p> : null;
  return (
    <ol className="steps" aria-live={live ? "polite" : undefined}>
      {steps.map((s) => (
        <li key={s._id} className={`step step-is-${s.state}`}>
          <Mark state={s.state} />
          <div>
            <div className="step-label">{s.label}</div>
            {s.detail && <div className="step-detail">{s.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
