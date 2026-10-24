import type { Metadata, Viewport } from "next";
import { Caveat, Fraunces, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { Masthead } from "@/components/Masthead";
import "./globals.css";

const display = Fraunces({ variable: "--font-display", subsets: ["latin"], axes: ["SOFT", "opsz"] });
const body = Source_Serif_4({ variable: "--font-body", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });
const hand = Caveat({ variable: "--font-hand", subsets: ["latin"], weight: ["500", "700"] });

export const metadata: Metadata = {
  title: "Recount",
  description: "Check a hospital bill against the hospital's own prices and California's charity care rules.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e7" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1a17" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} ${hand.variable}`}>
      <body>
        <ConvexClientProvider>
          <I18nProvider>
          <div className="page">
            <Masthead />
            <main className="column">{children}</main>
            <footer className="footnote">
              Not legal or medical advice. Recount checks your bill against public rules and prices; the hospital
              makes the final decision.
            </footer>
          </div>
          </I18nProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
