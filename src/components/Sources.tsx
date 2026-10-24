import { type CaseView, hostOf, shortDate } from "./types";

export function Sources({ c }: { c: CaseView }) {
  const h = c.hospital;
  return (
    <section className="sources" aria-labelledby="src-h">
      <h2 id="src-h" className="h-small">
        Where these numbers come from
      </h2>
      <ul>
        <li>
          <span className="label">Bill</span>{" "}
          {c.billSource === "claude" ? "Read by Claude from the file you uploaded. Check names and amounts." : "Sample bill, loaded from its source data."}
        </li>
        {h ? (
          <>
            <li>
              <span className="label">Hospital data</span>{" "}
              {h.source === "apify-live" ? `Fetched live ${shortDate(h.fetchedAt)}.` : `Saved lookup from ${shortDate(h.fetchedAt)}, not fetched just now.`}
            </li>
            {h.mrf?.url && (
              <li>
                <span className="label">Price file</span>{" "}
                <a href={h.mrf.url} target="_blank" rel="noreferrer">
                  {h.name}&rsquo;s published standard charges
                </a>{" "}
                <span className="quiet">({hostOf(h.mrf.url)}{h.mrf.lastUpdated ? `, updated ${shortDate(h.mrf.lastUpdated)}` : ""})</span>
              </li>
            )}
            {h.fap?.url && (
              <li>
                <span className="label">Assistance policy</span>{" "}
                <a href={h.fap.url} target="_blank" rel="noreferrer">
                  {h.name}&rsquo;s financial assistance policy
                </a>
              </li>
            )}
            {h.warnings?.map((w, i) => (
              <li key={i} className="quiet">
                {w}
              </li>
            ))}
          </>
        ) : (
          <li>
            <span className="label">Hospital data</span> We couldn&rsquo;t match this hospital, so charges weren&rsquo;t compared with
            its price list.
          </li>
        )}
      </ul>
    </section>
  );
}
