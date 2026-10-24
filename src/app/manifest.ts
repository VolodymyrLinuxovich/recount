import type { MetadataRoute } from "next";

// Lets people add Recount to their home screen and open it like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Recount",
    short_name: "Recount",
    description: "Check a hospital bill against the hospital's own prices and California's charity care rules.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f0e6",
    theme_color: "#f5f0e6",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
