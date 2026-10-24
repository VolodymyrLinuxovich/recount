import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Fraunces } from "next/font/google";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { Footer } from "@/components/Footer";
import { HelperChat } from "@/components/helper/HelperChat";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { Masthead } from "@/components/Masthead";
import { VISION_SCRIPT } from "@/components/a11y/vision";
import "./globals.css";

// Fraunces only for the h1 and the wordmark (32px and up); everything else, numbers included,
// is Atkinson Hyperlegible Next (DESIGN-RESEARCH B1).
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], axes: ["SOFT", "opsz"] });
const body = Atkinson_Hyperlegible_Next({ variable: "--font-body", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: "Recount",
  description: "Check a hospital bill against the hospital's own prices and California's charity care rules.",
  appleWebApp: { title: "Recount", statusBarStyle: "default" },
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
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        {/* Display settings (text size, contrast) before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: VISION_SCRIPT }} />
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
