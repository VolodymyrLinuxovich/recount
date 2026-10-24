"use client";

import { useT } from "./I18nProvider";
import type { PlainKey } from "./strings";

/** Plain UI text for server components, e.g. a Suspense fallback: <T k="case.opening" />. */
export function T({ k }: { k: PlainKey }) {
  const { t } = useT();
  return <>{t(k)}</>;
}
