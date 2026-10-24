import { Suspense } from "react";
import { CaseScreen } from "@/components/CaseScreen";
import { T } from "@/components/i18n/T";

export default function CasePage() {
  return (
    <Suspense fallback={<p className="quiet"><T k="case.opening" /></p>}>
      <CaseScreen />
    </Suspense>
  );
}
