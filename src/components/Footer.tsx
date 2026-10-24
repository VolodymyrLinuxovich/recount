"use client";

import Link from "next/link";
import { VisionToggle } from "./a11y/VisionToggle";
import { useT } from "./i18n/I18nProvider";
import "./footer.css";

/** The legal note, and the quiet way into Display settings (text size and contrast). */
export function Footer() {
  const { t } = useT();
  return (
    <footer className="footnote">
      <p className="footnote-text">{t("footer")}</p>
      <div className="footnote-links">
        <Link href="/privacy">{t("footer.privacy")}</Link>
        <VisionToggle />
      </div>
    </footer>
  );
}
