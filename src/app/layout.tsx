import type { Metadata, Viewport } from "next";
import { Lexend, Plus_Jakarta_Sans } from "next/font/google";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { Footer } from "@/components/Footer";
import { HelperChat } from "@/components/helper/HelperChat";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { Masthead } from "@/components/Masthead";
import { VISION_SCRIPT } from "@/components/a11y/vision";
import { REVEAL_SCRIPT } from "@/components/motion/revealScript";
import "./globals.css";

// Plus Jakarta Sans (600 to 800) for headings, the wordmark and big figures; Lexend, built for
// reading ease, for body text and controls. Money uses tabular figures (globals.css).
const display = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800"],
});
const body = Lexend({ variable: "--font-body", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: "Recount",
  description: "Check a hospital bill against the hospital's own prices and California's charity care rules.",
  appleWebApp: { title: "Recount", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#13002a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        {/* Display settings (text size, contrast) before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: VISION_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: REVEAL_SCRIPT }} />
      </head>
      <body>
        <ConvexClientProvider>
          <I18nProvider>
          <div className="page">
            <Masthead />
            <main className="column">{children}</main>
            <Footer />
          </div>
          <HelperChat />
          </I18nProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
