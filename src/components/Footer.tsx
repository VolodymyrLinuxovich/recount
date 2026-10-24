"use client";

import { useT } from "./i18n/I18nProvider";

export function Footer() {
  const { t } = useT();
  return <footer className="footnote">{t("footer")}</footer>;
}
