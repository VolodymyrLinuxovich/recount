"use client";

// Placeholder screens for letters and sending. To be replaced with one letter per screen.
import { useT } from "../i18n/I18nProvider";
import { Letters } from "../Letters";
import { SendGuide } from "../SendGuide";
import { StepFrame } from "./StepFrame";
import type { ScreenProps } from "./types";

export function LettersWaitStep({ back }: ScreenProps) {
  const { t } = useT();
  return (
    <StepFrame phase={3} title={t("flow.writingH")} onBack={back}>
      <p className="quiet pulse">{t("flow.writingBody")}</p>
    </StepFrame>
  );
}

export function DetailsStep({ next, back }: ScreenProps) {
  const { t } = useT();
  return <StepFrame phase={3} title={t("flow.detailsH")} primary={{ label: t("flow.next"), onClick: next }} onBack={back} />;
}

export function LetterStep({ c, index, back }: ScreenProps & { index: number }) {
  return (
    <StepFrame phase={3} onBack={back}>
      {index === 0 && <Letters c={c} />}
    </StepFrame>
  );
}

export function SendStep({ c, go }: ScreenProps) {
  const { t } = useT();
  return (
    <StepFrame phase={4} title={t("flow.sendH")} secondary={{ label: t("flow.seeLettersAgain"), onClick: () => go("letter-0") }}>
      <SendGuide c={c} letters={c.letters ?? []} />
    </StepFrame>
  );
}
