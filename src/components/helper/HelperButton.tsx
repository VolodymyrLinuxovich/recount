"use client";

import { useT } from "../i18n/I18nProvider";
import { Mascot } from "./Mascot";
import { setHelperOpen, useHelperOpen } from "./openStore";
import "./helper.css";

/**
 * The masthead entry to the helper, for phones and tablets (below 1200px).
 * It sits in the header row, so it never floats over the page or the step bar.
 * On wide screens it hides and the bottom-right pill takes over (HelperChat).
 */
export function HelperButton() {
  const { t } = useT();
  const open = useHelperOpen();
  return (
    <button
      type="button"
      className="helper-mast-btn"
      aria-label={t("helper.open")}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(e) => setHelperOpen(true, e.currentTarget)}
    >
      <Mascot size={30} />
      <span className="helper-mast-text">{t("helper.name")}</span>
      {/* Phones: a short verb beside the lens, so it reads as "ask", not "search". */}
      <span className="helper-mast-short" aria-hidden="true">
        {t("helper.short")}
      </span>
    </button>
  );
}
