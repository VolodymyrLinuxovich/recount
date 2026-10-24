import Link from "next/link";
import { shortDate } from "./types";

export interface PolicyFinding {
  rule: string;
  verdict: "conflict" | "likely" | "ask";
  quote: string;
  page: number | null;
  docType: string;
  docUrl: string | null;
  effectiveDate: string | null;
  explanation: string;
}

// One plain line per state rule, with the section it comes from.
const LAW: Record<string, { title: string; line: string; cite: string; url: string }> = {
  DEADLINE: {
    title: "No deadline to apply",
    line: "Hospitals can't set a time limit for applying for financial assistance.",
    cite: "Health & Safety Code 127405",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=127405.",
  },
  ASSETS: {
    title: "No asset test",
    line: "Hospitals can't count your savings or other assets when deciding if you qualify.",
    cite: "Health & Safety Code 127405",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=127405.",
  },
  INCOME_PROOF: {
    title: "Simple proof of income",
    line: "Hospitals can only ask for recent pay stubs or tax returns as proof of income.",
    cite: "Health & Safety Code 127405",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=127405.",
  },
  CREDIT_REPORTING: {
    title: "No credit reporting",
    line: "Hospitals can't report this kind of medical debt to credit agencies.",
    cite: "Health & Safety Code 127425",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=127425.",
  },
  LIENS: {
    title: "No liens on your home",
    line: "Hospitals can't put a lien on a patient's real property to collect.",
    cite: "Health & Safety Code 127425",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=127425.",
  },
  MEDICAL_FIRST: {
    title: "No Medi-Cal-first rule",
    line: "Hospitals can't make you apply for Medi-Cal or other coverage before they'll consider you.",
    cite: "Health & Safety Code 127405",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=127405.",
  },
};

const DOC: Record<string, string> = {
  charity_care: "charity care policy",
  discount_payment: "discount payment policy",
  debt_collection: "debt collection policy",
  application: "application form",
};

export function PolicyAside({
  findings,
  hospitalName,
  hospitalKey,
  inLetter,
}: {
  findings: PolicyFinding[];
  hospitalName: string;
  hospitalKey: string | null;
  inLetter: boolean;
}) {
  if (!findings.length) return null;
  const firm = findings.filter((f) => f.verdict !== "ask");
  const head = firm.length
    ? `Heads up: ${hospitalName}'s own policy breaks ${firm.length === 1 ? "a state rule" : `${firm.length} state rules`}.`
    : `Heads up: part of ${hospitalName}'s own policy is unclear under state law.`;

  return (
    <aside className="policy-aside" aria-labelledby="policy-aside-h">
      <h2 id="policy-aside-h" className="hand policy-aside-h">
        {head}
      </h2>
      <ol className="policy-aside-list">
        {findings.map((f, i) => {
          const law = LAW[f.rule];
          return (
            <li key={f.rule + i}>
              <div className="versus-label">
                Their {DOC[f.docType] ?? "policy"} says
                {f.verdict === "likely" && " (likely conflict)"}
                {f.verdict === "ask" && " (worth asking about)"}
              </div>
              <blockquote className="policy-aside-quote">&ldquo;{f.quote}&rdquo;</blockquote>
              <div className="policy-aside-cite">
                {f.docUrl ? (
                  <a href={f.page != null ? `${f.docUrl}#page=${f.page}` : f.docUrl} target="_blank" rel="noreferrer">
                    Policy PDF{f.page != null && <>, page {f.page}</>}
                  </a>
                ) : (
                  <span>Policy{f.page != null && <>, page {f.page}</>}</span>
                )}
                <span className="quiet"> · effective {f.effectiveDate ? shortDate(f.effectiveDate) : "date not stated"}</span>
              </div>
              <p className="policy-aside-law">
                <strong>California law:</strong> {law ? law.line : f.explanation}{" "}
                {law && (
                  <a href={law.url} target="_blank" rel="noreferrer" className="src">
                    {law.cite}
                  </a>
                )}
              </p>
            </li>
          );
        })}
      </ol>
      <p className="policy-aside-foot">
        {firm.length > 0 && (inLetter ? "We've added this to your letter. " : "We'll add this to your letter. ")}
        <Link href={hospitalKey ? `/audit#h=${encodeURIComponent(hospitalKey)}` : "/audit"}>
          See what we found in other hospitals&rsquo; policies
        </Link>
      </p>
    </aside>
  );
}
