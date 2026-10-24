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
  const [wanted, go] = useStep();
  const steps = stepsFor(c);
  const step = wanted && steps.includes(wanted) ? wanted : homeStep(c);

  // When the backend moves the bill to a new phase (reading done, letters written…), move with it.
  const lastStatus = useRef(c.status);
  useEffect(() => {
    if (lastStatus.current !== c.status) {
      const was = lastStatus.current;
      lastStatus.current = c.status;
      // Letters just finished while the patient waited: go straight to them.
      go(was === "drafting" && c.status === "ready" ? "details" : homeStep(c), true);
    }
  }, [c, go]);

  const i = steps.indexOf(step);
  const props: ScreenProps = {
    c,
    step,
    go,
    next: () => i + 1 < steps.length && go(steps[i + 1]),
    back: i > 0 ? () => go(steps[i - 1]) : undefined,
  };

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
