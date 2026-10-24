"use client";

import { usePathname } from "next/navigation";
import { Component, type FormEvent, type ReactNode, type RefObject, Suspense, type KeyboardEvent, type PointerEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { tokenFor, tokenFromLink } from "../bills/myBills";
import { useT } from "../i18n/I18nProvider";
import type { PlainKey } from "../i18n/strings";
import { type SendError, useChat, useSessionId } from "./chatApi";
import { TypedText } from "./TypedText";
import { Mascot } from "./Mascot";
import { lastTrigger, setHelperOpen, useHelperOpen } from "./openStore";
import "./helper.css";

/** An SSN (123-45-6789, 123 45 6789) or a long run of digits like a bank account or card number. */
const SENSITIVE = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b|\b(?:\d[ -]?){12,19}\b|\b(?:routing|account|cuenta|ruta)\s*(?:number|n[uú]mero|#|no\.?)?\s*:?\s*\d{6,}/i;

const CASE_QS: PlainKey[] = ["helper.qCase1", "helper.qCase2", "helper.qCase3"];
const START_QS: PlainKey[] = ["helper.qStart1", "helper.qStart2", "helper.qStart3"];
type PanelError = SendError | "sensitive";

function errorText(e: PanelError, t: ReturnType<typeof useT>["t"]) {
  if (e === "sensitive") return t("helper.sensitive");
  if (e === "failed") return t("helper.errFailed");
  return e.text;
}

/** Case id from /case/<id>, and its private token from #t=… or My bills on this phone. */
const CASE_ID = /^[0-9a-z]{25,40}$/;

function useCaseContext() {
  const pathname = usePathname();
  // Only a real Convex id counts as a case; anything else (a mistyped link) is "no case".
  const raw = pathname?.match(/^\/case\/([^/?#]+)/)?.[1];
  const caseId = raw && CASE_ID.test(raw) ? raw : undefined;
  const [token, setToken] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!caseId) return;
    const read = () => setToken(tokenFromLink() ?? tokenFor(caseId));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [caseId]);
  return { caseId, token: caseId ? token : undefined };
}

/** Wide screens have room for the chat beside the page, so the page stays usable. */
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(WIDE);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}
const WIDE = "(min-width: 1432px)";

/** Keeps the phone sheet's input above the on-screen keyboard. */
function useKeyboardInset(active: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!active || !vv || !el) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.setProperty("--helper-kb", `${Math.round(kb)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      el.style.removeProperty("--helper-kb");
    };
  }, [active, ref]);
}

/** Height of the case flow's pinned bottom bar, so the launcher can sit above it. */
function useStepBarHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    let bar: Element | null = null;
    let raf = 0;
    const ro = new ResizeObserver(() => setH(bar ? Math.ceil(bar.getBoundingClientRect().height) : 0));
    const check = () => {
      const next = document.querySelector(".step-bar");
      if (next !== bar) {
        if (bar) ro.unobserve(bar);
        bar = next;
        if (bar) ro.observe(bar);
      }
      setH(bar ? Math.ceil(bar.getBoundingClientRect().height) : 0);
    };
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(check);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    check();
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      ro.disconnect();
    };
  }, []);
  return h;
}

/** Mounted once in the root layout. Suspense keeps usePathname() from blocking prerender. */
export function HelperChat() {
  return (
    <Suspense fallback={null}>
      <GuardedHelper />
    </Suspense>
  );
}

/** A backend error in the chat must never take down the page: fall back to an offline panel. */
class ChatBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Helper chat failed", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function GuardedHelper() {
  // A new page gets a fresh try.
  const pathname = usePathname();
  return (
    <ChatBoundary key={pathname} fallback={<HelperChatInner offline />}>
      <HelperChatInner />
    </ChatBoundary>
  );
}

function HelperChatInner({ offline = false }: { offline?: boolean }) {
  const { t, lang } = useT();
  const { caseId, token } = useCaseContext();
  const session = useSessionId(caseId);
  const sessionId = offline ? null : session;
  const { messages, waiting, streaming, send } = useChat({ sessionId, caseId, token });
  const barH = useStepBarHeight();
  const wide = useWide();
  /** Below the wide breakpoint the chat covers the page, so the page goes inert. */
  const modal = !wide;

  const open = useHelperOpen();
  const setOpen = (next: boolean) => setHelperOpen(next);
  const [draft, setDraft] = useState("");
  // An error belongs to one conversation and language; it hides when either changes.
  const ctxKey = `${caseId ?? ""}|${lang}`;
  const [errorState, setErrorState] = useState<{ e: PanelError; key: string } | null>(null);
  const error = errorState?.key === ctxKey ? errorState.e : null;
  const [sending, setSending] = useState(false);
  const [drag, setDrag] = useState(0);

  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Replies already in the conversation when it loaded show at once; new ones type out.
  const [history, setHistory] = useState<{ session: string | null; ids: Set<string> } | null>(null);
  if (messages && history?.session !== (sessionId ?? null)) {
    setHistory({ session: sessionId ?? null, ids: new Set(messages.map((m) => m.id)) });
  }
  const scrollDown = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dragStart = useRef<number | null>(null);
  const wasOpen = useRef(false);

  const qs = caseId ? CASE_QS : START_QS;
  const busy = sending || streaming || offline;
  const hasMessages = !!messages?.length;

  useKeyboardInset(open, panelRef);

  // Open: focus the input; when the chat covers the page, make the page inert and stop it scrolling.
  // Close: give focus back to the launcher.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      inputRef.current?.focus({ preventScroll: true });
      if (!modal) return;
      const page = document.querySelector<HTMLElement>(".page");
      page?.setAttribute("inert", "");
      document.documentElement.classList.add("helper-open");
      return () => {
        page?.removeAttribute("inert");
        document.documentElement.classList.remove("helper-open");
      };
    }
    if (wasOpen.current) (lastTrigger() ?? launcherRef.current)?.focus();
  }, [open, modal]);

  // Escape closes the chat wherever focus is while it is open (even if focus fell to the page
  // body, e.g. after a suggestion was sent). Keys inside the panel are handled by onPanelKey;
  // another open dialog (like Display) gets its own Escape first.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target && panelRef.current?.contains(target)) return;
      if (target?.closest('[role="dialog"], [role="alertdialog"]')) return;
      setHelperOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Keep the newest message in view as replies stream in.
  const lastLen = messages?.[messages.length - 1]?.content.length ?? 0;
  useEffect(() => {
    const el = listRef.current;
    if (el && open) el.scrollTop = el.scrollHeight;
  }, [open, messages?.length, lastLen, waiting]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    // Never send a Social Security number or bank account details, even by accident.
    if (SENSITIVE.test(q)) {
      setErrorState({ e: "sensitive", key: ctxKey });
      return;
    }
    setSending(true);
    setErrorState(null);
    const err = await send(q, lang);
    setSending(false);
    if (err) setErrorState({ e: err, key: ctxKey });
    else setDraft("");
  }

  // The chips disappear once a question is sent, so keep keyboard focus in the chat: on the input.
  function askFromChip(text: string) {
    inputRef.current?.focus({ preventScroll: true });
    void ask(text);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(draft);
  }

  function onInputKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void ask(draft);
    }
  }

  // Escape closes; Tab stays inside the panel while it is open.
  function onPanelKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Phone sheet: drag the handle down to close.
  function onDragStart(e: PointerEvent<HTMLDivElement>) {
    dragStart.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onDragMove(e: PointerEvent<HTMLDivElement>) {
    if (dragStart.current === null) return;
    setDrag(Math.max(0, e.clientY - dragStart.current));
  }
  function onDragEnd() {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (drag > 110) setOpen(false);
    setDrag(0);
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        className="helper-launcher"
        style={barH ? { bottom: barH + 12 } : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        hidden={open}
        onClick={(e) => setHelperOpen(true, e.currentTarget)}
      >
        <span className="helper-launcher-face">
          <Mascot state={waiting ? "thinking" : "idle"} size={38} />
        </span>
        <span className="helper-launcher-text">{t("helper.open")}</span>
      </button>

      <div className="helper-scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden="true" />

      <div
        ref={panelRef}
        className="helper-panel"
        data-open={open}
        data-dragging={drag > 0}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        role="dialog"
        aria-modal={modal}
        aria-label={t("helper.panelLabel")}
        tabIndex={-1}
        inert={!open}
        onKeyDown={onPanelKey}
      >
        <div
          className="helper-grab"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          aria-hidden="true"
        >
          <span className="helper-grab-bar" />
        </div>

        <header className="helper-head">
          <Mascot state={waiting ? "thinking" : "idle"} size={44} />
          <div className="helper-head-text">
            <p className="helper-name">{t("helper.name")}</p>
            <p className="helper-role">{t("helper.role")}</p>
          </div>
          <button type="button" className="helper-close" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            {t("helper.close")}
          </button>
        </header>

        <div className="helper-list" ref={listRef} aria-live="polite" aria-busy={waiting}>
          <div className="helper-hello">
            <Mascot state={hasMessages ? "idle" : "wave"} size={hasMessages ? 64 : 96} />
            <p className="helper-bubble helper-bubble--lupa">{t(caseId ? "helper.hiCase" : "helper.hiStart")}</p>
          </div>

          {!hasMessages && messages !== undefined && (
            <div className="helper-suggest">
              <p className="helper-suggest-title">{t("helper.suggestTitle")}</p>
              {qs.map((k) => (
                <button key={k} type="button" className="helper-chip" onClick={() => askFromChip(t(k))} disabled={busy}>
                  {t(k)}
                </button>
              ))}
            </div>
          )}

          {messages === undefined && sessionId && <p className="helper-note">{t("helper.loading")}</p>}
          {offline && <p className="helper-note">{t("helper.offline")}</p>}

          {messages?.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="helper-msg helper-msg--you">
                <span className="visually-hidden">{t("helper.you")}: </span>
                <p className="helper-bubble helper-bubble--you">{m.content}</p>
              </div>
            ) : m.pending && !m.content ? null : (
              <div key={m.id} className="helper-msg helper-msg--lupa">
                <span className="visually-hidden">{t("helper.name")}: </span>
                <div className="helper-bubble helper-bubble--lupa helper-rich">
                  <TypedText text={m.content} animate={history ? !history.ids.has(m.id) : false} onGrow={scrollDown} />
                </div>
              </div>
            ),
          )}

          {waiting && (
            <div className="helper-typing" role="status">
              <Mascot state="thinking" size={40} />
              <span>{t("helper.thinking")}</span>
            </div>
          )}
        </div>

        <form className="helper-form" onSubmit={onSubmit}>
          <div className="helper-input-row">
            <label htmlFor="helper-input" className="visually-hidden">
              {t("helper.inputLabel")}
            </label>
            <textarea
              id="helper-input"
              ref={inputRef}
              className="helper-input"
              rows={1}
              value={draft}
              maxLength={1500}
              placeholder={t("helper.placeholder")}
              enterKeyHint="send"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onInputKey}
            />
            <button type="submit" className="helper-send" disabled={busy || !draft.trim()} aria-label={t("helper.send")}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path d="M5 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          {draft.length > 1200 && (
            <p className={`helper-count ${draft.length >= 1500 ? "full" : ""}`} aria-live="polite">
              {draft.length} / 1500
            </p>
          )}
          {error && (
            <p className="helper-error" role="alert">
              {errorText(error, t)}
            </p>
          )}
          <p className="helper-safety">
            {t("helper.safety")}{" "}
            <a href="https://healthconsumer.org/" target="_blank" rel="noopener noreferrer" title={t("helper.personHint")}>
              {t("helper.person")}
            </a>
          </p>
        </form>
      </div>
    </>
  );
}
