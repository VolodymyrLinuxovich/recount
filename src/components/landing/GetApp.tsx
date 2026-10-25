"use client";

import { useEffect, useState } from "react";
import { useT } from "../i18n/I18nProvider";

/**
 * "Get the app", for Android and iPhone. Android downloads the Expo app (it updates itself).
 * iPhone adds this website to the Home Screen, where it opens full screen (see app/manifest.ts).
 * The QR code goes to /app, which sends Android to the download and iPhone back here.
 * On an iPhone, the iPhone card comes first.
 */
export function GetApp() {
  const { t } = useT();
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    // iPadOS reports a Mac user agent; touch points tell them apart.
    setIos(/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1));
  }, []);
  return (
    <section id="get-app" className="ld-app" aria-labelledby="ld-app-h" data-ios={ios || undefined}>
      <div className="ld-wrap">
        <div className="ld-app-head">
          <div>
            <h2 id="ld-app-h" className="ld-h2">
              {t("landing.appH")}
            </h2>
            <p>{t("landing.appP")}</p>
          </div>
          <figure className="ld-app-qr">
            {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG */}
            <img src="/app-qr.svg" alt={t("landing.appQrAlt")} width={160} height={160} />
            <figcaption>{t("landing.appQrCap")}</figcaption>
          </figure>
        </div>
        <div className="ld-app-cards">
          <div className="ld-app-card ld-app-card--android">
            <h3>
              <AndroidMark />
              {t("landing.appAndroidH")}
            </h3>
            <p>{t("landing.appAndroidP")}</p>
            <a className="rc-btn ld-app-btn" href="/app">
              {t("landing.appBtn")}
            </a>
          </div>
          <div className="ld-app-card ld-app-card--ios">
            <h3>
              <AppleMark />
              {t("landing.appIosH")}
            </h3>
            <p>{t("landing.appIosP")}</p>
            <ol className="ld-app-steps">
              <li>{t("landing.appIos1")}</li>
              <li>{t("landing.appIos2")}</li>
              <li>{t("landing.appIos3")}</li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

function AndroidMark() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path fill="currentColor" d="M6 9h12v8a1.5 1.5 0 0 1-1.5 1.5H15V21a1 1 0 0 1-2 0v-2.5h-2V21a1 1 0 0 1-2 0v-2.5H7.5A1.5 1.5 0 0 1 6 17zm-2.5 0a1 1 0 0 1 1 1v5a1 1 0 0 1-2 0v-5a1 1 0 0 1 1-1m17 0a1 1 0 0 1 1 1v5a1 1 0 0 1-2 0v-5a1 1 0 0 1 1-1M8.1 3.3l.9 1.4A6.6 6.6 0 0 1 12 4c1.1 0 2.1.2 3 .7l.9-1.4a.4.4 0 1 1 .7.4l-.9 1.4A5.4 5.4 0 0 1 18 8H6a5.4 5.4 0 0 1 2.3-3.9l-.9-1.4a.4.4 0 1 1 .7-.4M9.5 6a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5m5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path fill="currentColor" d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7a4.5 4.5 0 0 0-3.5-1.9c-1.5-.2-2.9.9-3.7.9s-1.9-.9-3.2-.8A4.7 4.7 0 0 0 4.2 9.5c-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4s1.7-.8 3.2-.8 1.9.8 3.2.8 2.1-1.2 2.9-2.4a10 10 0 0 0 1.3-2.7 4.2 4.2 0 0 1-2.6-4M14 5.4A4.3 4.3 0 0 0 15 2.3a4.4 4.4 0 0 0-2.9 1.5 4.1 4.1 0 0 0-1 3 3.6 3.6 0 0 0 2.9-1.4" />
    </svg>
  );
}
