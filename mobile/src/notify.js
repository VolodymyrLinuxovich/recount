// "Your bill check is done" on the phone, so the patient can leave the app while we read the bill.
// Push: the phone gives the backend its Expo push token for the bill (convex/notify.ts sends it).
// Fallback: while the app is in the background but still running, a status change on the open
// bill shows a local notification (for phones without push, like Expo Go on Android).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

// An app binary built before expo-notifications was added can still get this code as an update.
// Then the native module is missing and notifications are simply off.
let N = null;
if (Platform.OS !== "web") {
  try {
    N = require("expo-notifications");
  } catch {
    N = null;
  }
}

const CHANNEL = "bill-updates";
const PUSHED_KEY = "recount.pushed.v1"; // bills whose updates come by push, so we don't show two
const BUSY = ["reading", "drafting"];
const DONE = ["needs_household", "confirm_hospital", "ready", "error"];

let openBill = null; // the bill on screen; its own notices don't need a banner

/** Same wording as convex/lib/notice.ts (the push text). */
function noticeText(status, lang, findings) {
  const es = lang === "es";
  const n = findings || 0;
  if (status === "needs_household") {
    return es
      ? { title: "Revisamos su factura", body: n ? `Encontramos ${n} ${n === 1 ? "cosa" : "cosas"} para preguntar. Toque para verlas.` : "Toque para ver lo que encontramos." }
      : { title: "Your bill check is done", body: n ? `We found ${n} thing${n === 1 ? "" : "s"} to question. Tap to see ${n === 1 ? "it" : "them"}.` : "Tap to see what we found." };
  }
  if (status === "confirm_hospital") {
    return es
      ? { title: "Leímos su factura", body: "Díganos de qué hospital es para seguir." }
      : { title: "We read your bill", body: "Tell us which hospital it's from so we can keep going." };
  }
  if (status === "ready") {
    return es
      ? { title: "Sus cartas están listas", body: "Toque para leerlas y enviarlas." }
      : { title: "Your letters are ready", body: "Tap to read them and send them." };
  }
  return es
    ? { title: "No pudimos terminar su factura", body: "Toque para intentarlo de nuevo." }
    : { title: "We couldn't finish your bill", body: "Tap to try again." };
}

/** Once at app start: how notices show while the app is open. */
export function setupNotifications() {
  if (!N) return;
  try {
    N.setNotificationHandler({
      handleNotification: async (n) => {
        const here = n?.request?.content?.data?.caseId === openBill && AppState.currentState === "active";
        return { shouldShowBanner: !here, shouldShowList: !here, shouldPlaySound: !here, shouldSetBadge: false };
      },
    });
  } catch {
    // Notifications unavailable on this phone.
  }
}

export function setOpenBill(id) {
  openBill = id || null;
}

async function pushedBills() {
  try {
    const list = JSON.parse((await AsyncStorage.getItem(PUSHED_KEY)) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Right after an upload: ask to send notifications (the system asks only once), then register
 * this phone's push token for the bill. register is the notify.register mutation.
 */
export async function askForBill(id, token, register) {
  if (!N) return;
  try {
    if (Platform.OS === "android") {
      // Android 13+ shows the permission prompt only once a channel exists.
      await N.setNotificationChannelAsync(CHANNEL, { name: "Bill updates", importance: N.AndroidImportance.HIGH });
    }
    let perm = await N.getPermissionsAsync();
    if (perm.status !== "granted" && perm.canAskAgain !== false) perm = await N.requestPermissionsAsync();
    if (perm.status !== "granted") return;
    const { data: pushToken } = await N.getExpoPushTokenAsync();
    if (!pushToken) return;
    const ok = await register({ id, token, pushToken, platform: Platform.OS });
    if (ok) {
      const list = (await pushedBills()).filter((b) => b !== id);
      list.unshift(id);
      await AsyncStorage.setItem(PUSHED_KEY, JSON.stringify(list.slice(0, 30)));
    }
  } catch {
    // No push on this phone (Expo Go on Android, or no push key in the build): the local notice still works.
  }
}

/** On the open bill: a local notice when its work finishes while the app is in the background. */
export function useBackgroundNotice(id, c) {
  const status = c?.status;
  const prev = useRef(status);
  useEffect(() => {
    const p = prev.current;
    prev.current = status;
    if (!N || !status || !p || p === status || !BUSY.includes(p) || !DONE.includes(status)) return;
    if (AppState.currentState === "active") return;
    const { title, body } = noticeText(status, c?.lang, Array.isArray(c?.findings) ? c.findings.length : 0);
    (async () => {
      if ((await pushedBills()).includes(id)) return; // the push is on its way
      if ((await N.getPermissionsAsync()).status !== "granted") return;
      await N.scheduleNotificationAsync({
        content: { title, body, data: { caseId: id, status } },
        trigger: Platform.OS === "android" ? { channelId: CHANNEL } : null,
      });
    })().catch(() => {});
    // Only a status change matters; lang and findings are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, status]);
}

/** Calls open(caseId) when the patient taps a notice, including the one that launched the app. */
export function onNoticeTap(open) {
  if (!N) return () => {};
  const idOf = (r) => r?.notification?.request?.content?.data?.caseId;
  let sub = null;
  try {
    N.getLastNotificationResponseAsync()
      .then((r) => {
        if (idOf(r)) {
          open(idOf(r));
          N.clearLastNotificationResponseAsync?.().catch(() => {});
        }
      })
      .catch(() => {});
    sub = N.addNotificationResponseReceivedListener((r) => idOf(r) && open(idOf(r)));
  } catch {
    // Notifications unavailable.
  }
  return () => sub?.remove();
}
