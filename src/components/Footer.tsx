"use client";

import { VisionToggle } from "./a11y/VisionToggle";
import { useT } from "./i18n/I18nProvider";

/** The legal note, and the quiet way into Display settings (text size and contrast). */
export function Footer() {
  const { t } = useT();
  return (
    <footer className="footnote">
      <p className="footnote-text">{t("footer")}</p>
      <VisionToggle />
    </footer>
  );
}
