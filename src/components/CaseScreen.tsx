"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Answer } from "./Answer";
import { tokenFor, tokenFromLink, useRememberCase } from "./bills/myBills";
import { BillTools } from "./BillTools";
import { HospitalConfirm } from "./HospitalConfirm";
import { BillMarkup } from "./BillMarkup";
import { HouseholdForm } from "./HouseholdForm";
import { useT } from "./i18n/I18nProvider";
import type { T } from "./i18n/strings";
import { Letters } from "./Letters";
import { PolicyAside } from "./PolicyAside";
import { Progress } from "./Progress";
import { Sources } from "./Sources";
import { StepLog } from "./StepLog";
import type { CaseView } from "./types";

export function CaseScreen() {
  const { id } = useParams<{ id: string }>();
  // The bill's secret comes from the link (#t=…) or from My bills on this phone.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setToken(tokenFromLink() ?? tokenFor(id) ?? null);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [id]);
  const raw = useQuery(api.cases.get, token === undefined ? "skip" : { id: id as Id<"cases">, token: token ?? undefined }) as
    | CaseView
    | null
    | undefined;
  const c = raw ? { ...raw, token: token ?? undefined } : raw;
  useRememberCase(id, token ?? undefined, c);
  const { t } = useT();

  if (token === null && c === null)
    return (
      <section className="stack">
        <h1 className="h-answer">{t("case.private")}</h1>
        <p>{t("case.privateBody")}</p>
        <div className="row">
          <Link href="/bills" className="btn btn-primary">
            {t("bills.title")}
          </Link>
          <Link href="/" className="btn btn-quiet">
            {t("case.startAgain")}
          </Link>
        </div>
      </section>
    );
  if (c === undefined || token === undefined) return <p className="quiet">{t("case.opening")}</p>;
  if (c === null)
    return (
      <section>
        <h1 className="h-answer">{t("case.notFound")}</h1>
        <p>
          <Link href="/">{t("case.startAgain")}</Link>
        </p>
      </section>
    );

  if (c.status === "confirm_hospital")
    return (
      <div className="stack-lg">
        <Progress status={c.status} />
        <HospitalConfirm c={c} />
      </div>
    );

  if (c.status === "error") {
    const isPdf = c.fileType === "application/pdf";
    return (
      <section className="stack">
        <h1 className="h-answer">{t("case.cantRead", { pdf: isPdf })}</h1>
        <p>{plainError(t, c.error, isPdf)}</p>
        <Link href="/" className="btn btn-primary">
          {t("case.tryAgain")}
        </Link>
        <details className="log-details">
          <summary>{t("case.details")}</summary>
          <StepLog steps={c.steps.map((s) => (s.state === "running" ? { ...s, state: "error" as const } : s))} />
        </details>
      </section>
    );
  }

  if (c.status === "reading" || !c.bill) {
    return (
      <section className="stack">
        <Progress status="reading" />
        <p className="eyebrow">{t("case.eyebrow")}</p>
        <h1 className="h-answer">{t("case.reading")}</h1>
        {c.fileUrl && c.fileType?.startsWith("image/") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.fileUrl} alt={t("case.photoAlt")} className="photo photo-reading" />
        )}
        <StepLog steps={c.steps} live />
      </section>
    );
  }

  const findings = c.findings ?? [];
  const askHousehold = c.status === "needs_household" || c.eligibility?.tier === "NEEDS_INFO";

  return (
    <div className="stack-lg">
      <Progress status={c.status} />
      {c.eligibility && !askHousehold && <Answer c={c} />}

      <BillMarkup c={c} findings={findings} />

      <PolicyAside
        findings={c.policyFindings ?? []}
        hospitalName={c.hospital?.name ?? c.bill.hospitalName ?? null}
        hospitalKey={c.hospital?.key ?? null}
        inLetter={Boolean(c.letters?.length)}
      />

      {askHousehold ? (
        <HouseholdForm id={c._id} token={c.token} prior={c.household} needsOutOfPocket={c.eligibility?.tier === "NEEDS_INFO"} />
      ) : (
        <Letters c={c} />
      )}

      <Sources c={c} />
      <details className="log-details">
        <summary>{t("case.log")}</summary>
        <StepLog steps={c.steps} />
      </details>
      {c.token && <BillTools id={c._id} token={c.token} />}
    </div>
  );
}

/** Turn a backend error into one plain sentence for the patient. */
function plainError(t: T, raw: string | undefined, isPdf: boolean) {
  const r = (raw ?? "").toLowerCase();
  if (/api key|credit|rate limit|overloaded|529|503|unavailable/.test(r)) return t("case.err.unavailable", { pdf: isPdf });
  if (/not a hospital|not a medical|no lines|empty/.test(r)) return t("case.err.notBill", { pdf: isPdf });
  return t("case.err.generic", { pdf: isPdf });
}
