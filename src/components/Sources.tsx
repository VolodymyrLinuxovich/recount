import { useT } from "./i18n/I18nProvider";
import { type CaseView, hostOf, shortDate } from "./types";
import "./more.css";

export function Sources({ c }: { c: CaseView }) {
  const { t, lang } = useT();
  const h = c.hospital;
  return (
    <section className="sources more-sec" aria-labelledby="src-h">
      <h2 id="src-h" className="more-h">
        {t("src.h")}
      </h2>
      <ul>
        <li>
          <span className="label">{t("src.bill")}</span>{" "}
          {c.billSource === "claude" ? t("src.billClaude") : t("src.billSample")}
        </li>
        {h ? (
          <>
            {h.mrf ? (
              <li>
                <span className="label">{t("src.hospital")}</span>{" "}
                {h.source === "apify-live"
                  ? t("src.live", { date: shortDate(h.fetchedAt, lang) })
                  : t("src.saved", { date: shortDate(h.fetchedAt, lang) })}
              </li>
            ) : (
              <li>
                <span className="label">{t("src.hospital")}</span>{" "}
                {h.fap ? (
                  <>
                    {t("src.policyUsed")}
                    {h.fap.url && (
                      <>
                        {" ("}
                        <a href={h.fap.url} target="_blank" rel="noreferrer">
                          {t("src.readPolicy")}
                        </a>
                        {")"}
                      </>
                    )}
                    {". "}
                    {t("src.noPrices")}
                  </>
                ) : (
                  t("src.rulesOnly")
                )}
              </li>
            )}
            {h.mrf?.url && (
              <li>
                <span className="label">{t("src.priceFile")}</span>{" "}
                <a href={h.mrf.url} target="_blank" rel="noreferrer">
                  {t("src.priceLink", { name: h.name })}
                </a>{" "}
                <span className="quiet">({hostOf(h.mrf.url)}{h.mrf.lastUpdated ? t("src.updated", { date: shortDate(h.mrf.lastUpdated, lang) }) : ""})</span>
              </li>
            )}
            {h.mrf && h.fap?.url && (
              <li>
                <span className="label">{t("src.policy")}</span>{" "}
                <a href={h.fap.url} target="_blank" rel="noreferrer">
                  {t("src.policyLink", { name: h.name })}
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
            <span className="label">{t("src.hospital")}</span> {t("src.noMatch")}
          </li>
        )}
      </ul>
    </section>
  );
}
