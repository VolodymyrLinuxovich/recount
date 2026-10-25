"use client";

import { useT } from "../i18n/I18nProvider";

/** "Get the Android app": a QR code for computers, a download button for phones, and a note for iPhone. */
export function GetApp() {
  const { t } = useT();
  return (
    <section className="ld-app" aria-labelledby="ld-app-h">
      <div className="ld-wrap ld-app-in">
        <div className="ld-app-copy">
          <h2 id="ld-app-h" className="ld-h2">
            {t("landing.appH")}
          </h2>
          <p>{t("landing.appP")}</p>
          <a className="rc-btn ld-app-btn" href="/app">
            {t("landing.appBtn")}
          </a>
          <p className="ld-app-ios">{t("landing.appIos")}</p>
        </div>
        <figure className="ld-app-qr">
          {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG */}
          <img src="/app-qr.svg" alt={t("landing.appQrAlt")} width={180} height={180} />
          <figcaption>{t("landing.appQrCap")}</figcaption>
        </figure>
      </div>
    </section>
  );
}
