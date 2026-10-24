"use client";

// The one place the helper talks to the backend (convex/chat.ts).
// send() returns right away; the reply streams into list() while `pending` is true.

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useSyncExternalStore } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Lang } from "../i18n/strings";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending: boolean;
}

/** Why a send failed: the server's own words (already in the patient's language), or a generic failure. */
export type SendError = { text: string } | "failed";

// ---- one conversation id per case, or per device before there is a case ----

const sessionCache = new Map<string, string>();

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
}

function sessionFor(caseId: string | undefined): string {
  const key = caseId ? `recount.chat.${caseId}` : "recount.chat.device";
  const cached = sessionCache.get(key);
  if (cached) return cached;
  let id: string | null = null;
  try {
    id = window.localStorage.getItem(key);
  } catch {
    // Storage blocked: the chat still works for this visit.
  }
  if (!id || id.length < 16 || id.length > 100) {
    id = newId();
    try {
      window.localStorage.setItem(key, id);
    } catch {}
  }
  sessionCache.set(key, id);
  return id;
}

const noop = () => () => {};

/** The conversation id for this case (or this device). Null during server render. */
export function useSessionId(caseId: string | undefined): string | null {
  return useSyncExternalStore(
    noop,
    () => sessionFor(caseId),
    () => null,
  );
}

// ---- the hook the panel uses ----

function readError(e: unknown): SendError {
  // chat.send throws ConvexError for limits ("Too many questions in a row…",
  // "Please wait for the answer to finish."), in the language it was sent in.
  // Anything else (network, server bug) gets the generic message.
  if (e instanceof ConvexError) return { text: String(e.data) };
  return "failed";
}

export function useChat({
  sessionId,
  caseId,
  token,
}: {
  sessionId: string | null;
  caseId?: string;
  token?: string;
}) {
  const id = caseId as Id<"cases"> | undefined;
  const rows = useQuery(api.chat.list, sessionId ? { sessionId, caseId: id, token } : "skip");
  const sendMutation = useMutation(api.chat.send);

  const messages: ChatMessage[] | undefined = rows?.map((m) => ({
    id: m._id,
    role: m.role,
    content: m.content,
    pending: m.pending,
  }));
  /** A reply was asked for and nothing has arrived yet: show the mascot thinking. */
  const waiting = !!messages?.some((m) => m.role === "assistant" && m.pending && !m.content);
  const streaming = !!messages?.some((m) => m.role === "assistant" && m.pending);

  const send = useCallback(
    async (content: string, lang: Lang): Promise<SendError | null> => {
      if (!sessionId) return "failed";
      try {
        await sendMutation({ sessionId, caseId: id, token, lang, content });
        return null;
      } catch (e) {
        return readError(e);
      }
    },
    [sendMutation, sessionId, id, token],
  );

  return { messages, waiting, streaming, send };
}
