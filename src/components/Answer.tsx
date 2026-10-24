import { PenUnderline } from "./Pen";
import { type CaseView, hostOf, money, questionableTotal } from "./types";

export function Answer({ c }: { c: CaseView }) {
  const e = c.eligibility!;
  const due = c.bill?.amountDue ?? null;
  const questionable = questionableTotal(c.findings ?? []);

  let big: React.ReactNode = e.headline;
  if (e.tier === "FREE") big = <>You likely owe <span className="answer-amt">$0<PenUnderline delay={200} /></span></>;
  else if (e.tier === "DISCOUNT") big = "You likely qualify for a discount.";
  else if (e.tier === "NOT_ELIGIBLE" && e.owedEstimate != null && questionable > 0)
    big = <>Ask them to take off up to <span className="answer-amt">{money(questionable, false)}</span></>;

  return (
    <section className="answer" aria-labelledby="answer-h">
      <p className="eyebrow">The short answer</p>
      <h1 id="answer-h" className="h-answer">
        {big}
      </h1>
      <p className="answer-sub">
        {e.tier === "FREE" && due != null && due > 0 && <>The bill says {money(due)}. </>}
        {e.tier === "FREE" && "Under the hospital's own policy, your household qualifies for free care."}
        {e.tier === "DISCOUNT" &&
          "State law caps what they can charge you at roughly what a government program would pay, usually far less than this bill."}
        {e.tier === "NOT_ELIGIBLE" && e.headline + "."}
        {e.tier !== "FREE" && questionable > 0 && e.tier !== "NOT_ELIGIBLE" && (
          <> We also marked up to {money(questionable, false)} in charges worth questioning.</>
        )}
      </p>

      <div className="receipts">
        <h2 className="receipts-h">Why</h2>
        <ol>
          {e.basis.map((b, i) => (
            <li key={i} className="receipt">
              <div className="receipt-rule">{b.rule}</div>
              <p>{b.text}</p>
              {b.source && (
                <a href={b.source} target="_blank" rel="noreferrer" className="src">
                  {hostOf(b.source)}
                </a>
              )}
            </li>
          ))}
        </ol>
      </div>

      {e.medicalLikely && (
        <p className="aside">
          <strong>Also check Medi-Cal.</strong> At {e.fplPct}% of the poverty line you may qualify, and Medi-Cal can pay
          bills from up to three months before you apply. Apply at{" "}
          <a href="https://www.coveredca.com/" target="_blank" rel="noreferrer">
            coveredca.com
          </a>{" "}
          or ask the hospital&rsquo;s financial counselor.
        </p>
      )}
    </section>
  );
}
