import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

// "Get the app". The QR code on the home page points here, so a new build only needs the APK
// line changed. Android (and anything that isn't an iPhone or iPad) gets the Expo app, which
// updates itself after it's installed. iPhones and iPads go to the home page's "Get the app"
// section, which shows how to add Recount to the Home Screen.
const APK_URL = "https://expo.dev/artifacts/eas/By0CXz5JAOlEsQQMWguI0D52ShsBFt-xVDnBlvMLuxk.apk";

export function GET(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) redirect("/#get-app");
  redirect(APK_URL);
}
