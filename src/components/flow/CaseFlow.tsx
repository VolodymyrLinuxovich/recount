"use client";

import { useEffect, useRef } from "react";
import type { CaseView } from "../types";
import { FindingStep, FoundStep } from "./FoundScreens";
import { DetailsStep, LetterStep, LettersWaitStep, SendStep } from "./LetterScreens";
import { AnswerStep, HospitalStep, MoreStep, QuestionStep, ReadingStep } from "./MainScreens";
import { homeStep, stepsFor } from "./steps";
import type { ScreenProps } from "./types";
import { useStep } from "./useStep";
import "./flow.css";

/** A bill, one screen at a time. The screen is kept in the link so refresh and the Back button work. */
export function CaseFlow({ c }: { c: CaseView }) {
  const steps = stepsFor(c);
  // A screen's place in the flow decides which way the slide goes.
  const [wanted, go, goBack] = useStep((s) => steps.indexOf(s && steps.includes(s) ? s : homeStep(c)));
  const step = wanted && steps.includes(wanted) ? wanted : homeStep(c);

  // When the backend moves the bill to a new phase (reading done, letters written…), move with it.
  const lastStatus = useRef(c.status);
  useEffect(() => {
    if (lastStatus.current !== c.status) {
      lastStatus.current = c.status;
      // Only move the patient on by itself from a screen that is waiting for the backend,
      // never while they are reading something.
      // No step in the link yet means the patient hasn't moved anywhere: follow the bill.
      const waiting = !wanted || ["reading", "hospital", "letters-wait", "q3"].includes(wanted);
      if (waiting) return go(wanted === "letters-wait" && c.status === "ready" ? "details" : homeStep(c), true);
      if (c.status === "error") return go("reading", true);
    }
    // A step the bill doesn't have (yet), like &s=letter-3: the fallback screen shows, so put it in the link too.
    if (wanted && !steps.includes(wanted)) go(step, true, true);
  }, [c, go, wanted, steps, step]);

  const i = steps.indexOf(step);
  const props: ScreenProps = {
    c,
    step,
    go,
    next: () => i + 1 < steps.length && go(steps[i + 1]),
    back: i > 0 ? () => goBack(steps[i - 1]) : undefined,
  };

  // Keyed by step so each screen arrives fresh and can slide in (see useStep and flow.css).
  return (
    <div className="step-anim" key={step}>
      <Screen step={step} props={props} />
    </div>
  );
}

function Screen({ step, props }: { step: string; props: ScreenProps }) {
  if (step === "reading") return <ReadingStep {...props} />;
  if (step === "hospital") return <HospitalStep {...props} />;
  if (step === "found") return <FoundStep {...props} />;
  if (step.startsWith("finding-")) return <FindingStep {...props} index={Number(step.slice(8))} />;
  if (step === "q1" || step === "q2" || step === "q3") return <QuestionStep {...props} n={Number(step[1]) as 1 | 2 | 3} />;
  if (step === "answer") return <AnswerStep {...props} />;
  if (step === "letters-wait") return <LettersWaitStep {...props} />;
  if (step === "details") return <DetailsStep {...props} />;
  if (step.startsWith("letter-")) return <LetterStep {...props} index={Number(step.slice(7))} />;
  if (step === "send") return <SendStep {...props} />;
  return <MoreStep {...props} />;
}
