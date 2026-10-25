// The phone notification for a bill whose background work just finished (see convex/notify.ts).

export type NoticeStatus = "needs_household" | "confirm_hospital" | "ready" | "error";

export type Notice = { title: string; body: string };

/** Busy phases a patient may leave the app during; a move from one of these is worth a notice. */
const BUSY = new Set(["reading", "drafting"]);
const DONE = new Set<string>(["needs_household", "confirm_hospital", "ready", "error"]);

/** The status the patient should hear about, or null if this change isn't one. */
export function noticeFor(prev: string | undefined, next: string | undefined): NoticeStatus | null {
  if (!prev || !next || prev === next || !BUSY.has(prev) || !DONE.has(next)) return null;
  return next as NoticeStatus;
}

/** Short plain text in the bill's language. findings: how many things we found to question. */
export function noticeText(status: NoticeStatus, lang: string | undefined, findings?: number): Notice {
  const es = lang === "es";
  if (status === "needs_household") {
    const n = findings ?? 0;
    return es
      ? {
          title: "Revisamos su factura",
          body: n ? `Encontramos ${n} ${n === 1 ? "cosa" : "cosas"} para preguntar. Toque para verlas.` : "Toque para ver lo que encontramos.",
        }
      : {
          title: "Your bill check is done",
          body: n ? `We found ${n} thing${n === 1 ? "" : "s"} to question. Tap to see ${n === 1 ? "it" : "them"}.` : "Tap to see what we found.",
        };
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

/** An Expo push token as the phone reports it. */
export function isExpoPushToken(s: string): boolean {
  return /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$/.test(s);
}
