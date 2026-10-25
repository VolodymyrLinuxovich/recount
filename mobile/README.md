# Recount mobile

The Recount phone app, built with Expo (SDK 58, React Native, plain JavaScript). It talks to the same Convex backend as the web app (`https://zealous-grouse-384.convex.cloud`), so a bill checked here works exactly like one checked on the web.

## Try it on your phone

1. Install **Expo Go** from the App Store or Google Play.
2. On the laptop (Node 22.13 or newer):

   ```bash
   cd mobile
   nvm use            # picks Node 22 from .nvmrc
   npm install
   npm run tunnel     # expo start --tunnel ngrok
   ```

3. Scan the QR code in the terminal. On iPhone use the Camera app; on Android scan from inside Expo Go.

The tunnel works from any network. On a real iPhone, Expo Go opens it only when Expo Go and the laptop's Expo CLI are signed in to the same Expo account, so iPhone judges can't scan it themselves; Android phones can. Since May 2026 Expo Go also opens published EAS Updates only for the project's owner or organization members, so an `exp://u.expo.dev/...` link is not a public iPhone install either. For other people on iPhone, the website from the Home Screen is the way in. The laptop has to keep `npm run tunnel` running. If you see a `exp://...exp.direct` URL instead of a QR code (for example when the server runs in the background), paste that URL into Expo Go or turn it into a QR code.

On the same Wi-Fi you can skip the tunnel: `npx expo start` and scan the QR code.

## What it does

One step per screen, with a large button at the bottom and "Step x of 4" at the top:

1. **Start.** Take a photo of the bill, pick a photo or PDF, or try the sample bill. English or Spanish.
2. **Reading.** The backend steps update live while Claude reads the bill and matches the hospital. If the hospital is unclear, you pick it from a list or search all 470 California hospitals.
3. **What we found.** One card per problem, with the billed amount, the hospital's published price, and how much it could take off. Hospital policy problems and parts of the bill we could not read are shown too.
4. **Three questions.** Household size, yearly income, insurance (and medical costs in the last year if insured).
5. **Your answer.** California charity care result, percent of the poverty line, and each rule with a link to the law.
6. **Letters.** Edit the English letter for the hospital. In Spanish mode the patient also sees "Lo que dice su carta", a Spanish copy to read. Share or copy each letter, then approve.
7. **Done.** Call billing or financial assistance, share or email the letters, change them, or delete the bill.

Nothing is sent to the hospital by the app. The patient sends the letters.

## What is native

* **Camera and photo library** through `expo-image-picker`, and PDFs through `expo-document-picker`.
* **Share sheet** (React Native `Share`) to send a letter to Mail, Messages, Notes, a printer app, and so on.
* **Clipboard** through `expo-clipboard`.
* **Phone calls** to the billing office through `tel:` links.
* **My bills** saved on the phone with AsyncStorage. Each bill keeps its secret token only on this device; anyone without it cannot open the bill.
* Android back button follows the on-screen Back.

## Files

* `App.js` sets up the Convex client and switches between the start screen and an open bill.
* `src/StartScreen.js` handles upload and My bills.
* `src/CaseFlow.js` has every screen after upload. Which screen shows comes from the bill's status on the backend.
* `src/strings.js` has the English and Spanish UI text. Text from the backend already comes in the bill's language.
* `src/ui.js` has the shared layout and colors.
* `scripts/smoke.mjs` runs the same backend calls the app makes.

## Checks

```bash
npm run smoke                                      # start sample, read, answer, letters, approve, unapprove, delete (en and es)
npx expo export --platform ios --output-dir /tmp/recount-ios   # bundle builds
npx expo-doctor
```

Not legal or medical advice. Recount checks a bill against public rules and prices.
