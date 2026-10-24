"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Answer } from "./Answer";
import { BillMarkup } from "./BillMarkup";
import { HouseholdForm } from "./HouseholdForm";
import { Letters } from "./Letters";
import { PolicyAside } from "./PolicyAside";
import { Sources } from "./Sources";
import { StepLog } from "./StepLog";
import type { CaseView } from "./types";

export function CaseScreen() {
  const { id } = useParams<{ id: string }>();
  const c = useQuery(api.cases.get, { id: id as Id<"cases"> }) as CaseView | null | undefined;

  if (c === undefined) return <p className="quiet">Opening your bill…</p>;
  if (c === null)
    return (
      <section>
        <h1 className="h-answer">We couldn&rsquo;t find this bill.</h1>
        <p>
          <Link href="/">Start again</Link>
        </p>
      </section>
    );

  if (c.status === "error") {
    const isPdf = c.fileType === "application/pdf";
    return (
      <section className="stack">
        <h1 className="h-answer">We couldn&rsquo;t read this {isPdf ? "file" : "photo"}.</h1>
        <p>{plainError(c.error, isPdf)}</p>
        <Link href="/" className="btn btn-primary">
          Try again
        </Link>
        <details className="log-details">
          <summary>Details</summary>
          <StepLog steps={c.steps.map((s) => (s.state === "running" ? { ...s, state: "error" as const } : s))} />
        </details>
      </section>
    );
  }

  if (c.status === "reading" || !c.bill) {
    return (
      <section className="stack">
        <p className="eyebrow">Recounting</p>
        <h1 className="h-answer">Going through your bill, line by line.</h1>
        {c.fileUrl && c.fileType?.startsWith("image/") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.fileUrl} alt="Your bill" className="photo photo-reading" />
        )}
        <StepLog steps={c.steps} live />
      </section>
    );
  }

  const findings = c.findings ?? [];
  const askHousehold = c.status === "needs_household" || c.eligibility?.tier === "NEEDS_INFO";

  return (
    <div className="stack-lg">
      {c.eligibility && !askHousehold && <Answer c={c} />}

      <BillMarkup c={c} findings={findings} />

      <PolicyAside
        findings={c.policyFindings ?? []}
        hospitalName={c.hospital?.name ?? c.bill.hospitalName ?? "The hospital"}
        hospitalKey={c.hospital?.key ?? null}
        inLetter={Boolean(c.letters?.length)}
      />

      {askHousehold ? (
        <HouseholdForm id={c._id} prior={c.household} needsOutOfPocket={c.eligibility?.tier === "NEEDS_INFO"} />
      ) : (
        <Letters c={c} />
      )}

      <Sources c={c} />
      <details className="log-details">
        <summary>What Recount did</summary>
        <StepLog steps={c.steps} />
      </details>
    </div>
  );
}

/** Turn a backend error into one plain sentence for the patient. */
function plainError(raw: string | undefined, isPdf: boolean) {
  const what = isPdf ? "file" : "photo";
  const r = (raw ?? "").toLowerCase();
  if (/api key|credit|rate limit|overloaded|529|503|unavailable/.test(r))
    return `Our bill reader is unavailable right now, so we couldn't read your ${what}. Please try again in a few minutes. The sample bill on the start page still works.`;
  if (/not a hospital|not a medical|no lines|empty/.test(r))
    return `This doesn't look like a hospital bill. Try a ${what} of the page that lists each charge.`;
  return `Something went wrong while reading your ${what}. Try again with a clear, flat ${what} of the page that lists each charge.`;
}
