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
    return (
      <section className="stack">
        <h1 className="h-answer">We couldn&rsquo;t finish reading this bill.</h1>
        <p>{c.error ?? "Something went wrong."}</p>
        <StepLog steps={c.steps} />
        <Link href="/" className="btn btn-primary">
          Try again
        </Link>
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
