import { Suspense } from "react";
import { CaseScreen } from "@/components/CaseScreen";

export default function CasePage() {
  return (
    <Suspense fallback={<p className="quiet">Opening your bill…</p>}>
      <CaseScreen />
    </Suspense>
  );
}
