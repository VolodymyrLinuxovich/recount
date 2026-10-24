"use client";

import { useT } from "../i18n/I18nProvider";
import type { Kind } from "./kinds";
import "./how.css";

/** A small label: "Rules", "AI" or "You". */
export function KindBadge({ kind }: { kind: Kind }) {
  const { t } = useT();
  return <span className={`kind kind-${kind}`}>{t(`how.kind.${kind}`)}</span>;
}
