"use client";

import { type Lang, useT } from "./I18nProvider";
import "./i18n.css";

// Each name is written in its own language, so people can find theirs whatever the page shows.
const OPTIONS: { lang: Lang; name: string }[] = [
  { lang: "en", name: "English" },
  { lang: "es", name: "Español" },
];

export function LanguageToggle() {
  const { lang, setLang, t } = useT();
  return (
    <div className="lang-toggle" role="group" aria-label={t("lang.group")}>
      {OPTIONS.map((o) => (
        <button
          key={o.lang}
          type="button"
          lang={o.lang}
          className="lang-option"
          aria-pressed={lang === o.lang}
          onClick={() => setLang(o.lang)}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}
