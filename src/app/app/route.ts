import { redirect } from "next/navigation";

// The Android app (Expo build). The QR code on the home page points here, so a new build
// only needs this one line changed. The app updates itself after it's installed.
const APK_URL = "https://expo.dev/artifacts/eas/Wcsx-6EwcgMjTyNtfPZ0E4dWNB_XredZx_Wvxz_WQvE.apk";

export function GET() {
  redirect(APK_URL);
}
