"use client";

import { useEffect, useRef } from "react";
import { noticeFor, noticeText } from "../../../convex/lib/notice";
import type { CaseView } from "../types";

/** Ask to show notifications. Call from the upload tap (some browsers only ask during a tap). */
export function askNoticePermission() {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
  } catch {
    // Old browsers return nothing here, or have no notifications at all.
  }
}

/** A browser notification when the bill's work finishes while this tab is hidden. */
export function useDoneNotice(c: CaseView | null | undefined) {
  const status = c?.status;
  const prev = useRef(status);
  useEffect(() => {
    const p = prev.current;
    prev.current = status;
    const done = noticeFor(p, status);
    if (!c || !done || document.visibilityState === "visible") return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const { title, body } = noticeText(done, c.lang, c.findings?.length);
    try {
      const n = new Notification(title, { body, tag: `recount-${c._id}`, icon: "/icon-192.png" });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      // Android Chrome allows notifications only from a service worker; the page still updates.
    }
    // Only a status change matters; the rest is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
}
