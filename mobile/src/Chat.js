// Lupa on the phone: the same helper chat as the web (convex/chat.ts), full screen.
// Opened from a bill, it answers about that bill (caseId + token); opened from the start
// screen, it answers general questions. send() returns at once and the reply streams into list().
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { ConvexError } from "convex/values";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Lupa } from "./Lupa";
import { C, F } from "./theme"; // not "./ui": ui.js imports this file


const api = anyApi;
const MAX_MESSAGE = 1000;
const PERSON_URL = "https://healthconsumer.org/";
// Same check as the web helper: never send what looks like an SSN, card or bank number.
export const SENSITIVE = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b|\b(?:\d[ -]?){12,19}\b|\b(?:routing|account|cuenta|ruta)\s*(?:number|n[uú]mero|#|no\.?)?\s*:?\s*\d{6,}/i;

const ChatCtx = createContext(null);

/** Gives every screen an "Ask Lupa" button and owns the chat window. */
export function ChatProvider({ t, lang, current, children }) {
  const [open, setOpen] = useState(false);
  return (
    <ChatCtx.Provider value={{ t, open: () => setOpen(true) }}>
      {children}
      <Modal visible={open} animationType="slide" presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"} onRequestClose={() => setOpen(false)}>
        {open ? <ChatWindow t={t} lang={lang} caseId={current?.id} token={current?.token} onClose={() => setOpen(false)} /> : null}
      </Modal>
    </ChatCtx.Provider>
  );
}

export const useLupa = () => useContext(ChatCtx);

/** The small "Ask" pill with Lupa's lens, for screen headers. */
export function AskButton() {
  const ctx = useLupa();
  if (!ctx) return null;
  return (
    <Pressable onPress={ctx.open} hitSlop={10} accessibilityRole="button" accessibilityLabel={ctx.t.chatOpen}>
      {({ pressed }) => (
        <View style={[st.ask, pressed && st.askPressed]}>
          <Lupa size={26} />
          <Text style={st.askText}>{ctx.t.chatShort}</Text>
        </View>
      )}
    </Pressable>
  );
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** One conversation per bill, or one per phone before there is a bill (same keys as the web). */
function useSessionId(caseId) {
  const [id, setId] = useState(null);
  useEffect(() => {
    const key = caseId ? `recount.chat.${caseId}` : "recount.chat.device";
    let live = true;
    AsyncStorage.getItem(key)
      .then((v) => {
        if (v && v.length >= 16 && v.length <= 100) return v;
        const fresh = newId();
        AsyncStorage.setItem(key, fresh).catch(() => {});
        return fresh;
      })
      .catch(() => newId())
      .then((v) => live && setId(v));
    return () => {
      live = false;
    };
  }, [caseId]);
  return id;
}

/** Replies may use **bold**; the phone shows plain text. */
const plain = (s) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "");

function ChatWindow({ t, lang, caseId, token, onClose }) {
  const insets = useSafeAreaInsets();
  const sessionId = useSessionId(caseId);
  const messages = useQuery(api.chat.list, sessionId ? { sessionId, ...(caseId ? { caseId, token } : {}) } : "skip");
  const send = useMutation(api.chat.send);
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const scroll = useRef(null);

  const waiting = !!messages?.some((m) => m.role === "assistant" && m.pending);
  const lastText = messages?.length ? messages[messages.length - 1].content : "";
  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [messages?.length, lastText]);

  async function ask(q) {
    const question = q.trim();
    if (!question || !sessionId || sending || waiting) return;
    if (SENSITIVE.test(question)) {
      setError(t.chatSensitive);
      return;
    }
    setError(null);
    setSending(true);
    try {
      await send({ sessionId, ...(caseId ? { caseId, token } : {}), lang, content: question.slice(0, MAX_MESSAGE) });
      setText("");
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : t.chatFailed);
    } finally {
      setSending(false);
    }
  }

  const suggestions = caseId ? [t.chatQCase1, t.chatQCase2, t.chatQCase3] : [t.chatQStart1, t.chatQStart2, t.chatQStart3];
  const empty = messages !== undefined && messages.length === 0;
  const canSend = !!text.trim() && !!sessionId && !sending && !waiting;

  return (
    <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[st.fill, { paddingTop: Platform.OS === "ios" ? 8 : insets.top }]}>
        <View style={st.head}>
          <Lupa size={40} mood={waiting ? "think" : "idle"} />
          <View style={{ flex: 1 }}>
            <Text style={st.name} accessibilityRole="header">{t.chatName}</Text>
            <Text style={st.role}>{t.chatRole}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t.chatClose}>
            {({ pressed }) => (
              <View style={[st.close, pressed && st.askPressed]}>
                <Text style={st.closeText}>{t.chatClose}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <ScrollView ref={scroll} style={st.fill} contentContainerStyle={st.list} keyboardShouldPersistTaps="handled">
          <Bubble who="lupa" text={caseId ? t.chatHiCase : t.chatHiStart} />
          {messages === undefined ? <Text style={st.note}>{sessionId ? t.chatLoading : ""}</Text> : null}
          {empty ? (
            <View style={st.suggest}>
              <Text style={st.suggestTitle}>{t.chatSuggestTitle}</Text>
              {suggestions.map((q) => (
                <Pressable key={q} onPress={() => ask(q)} accessibilityRole="button" disabled={!sessionId}>
                  {({ pressed }) => (
                    <View style={[st.chip, pressed && st.chipPressed]}>
                      <Text style={st.chipText}>{q}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          ) : null}
          {(messages ?? []).map((m) =>
            m.role === "user" ? (
              <Bubble key={m._id} who="you" text={m.content} />
            ) : m.pending && !m.content ? null : (
              <Bubble key={m._id} who="lupa" text={plain(m.content)} />
            ),
          )}
          {waiting && !lastText ? (
            <View style={st.thinking} accessibilityLiveRegion="polite">
              <Lupa size={22} mood="think" />
              <Text style={st.thinkingText}>{t.chatThinking}</Text>
            </View>
          ) : null}
          <Text style={st.note}>{t.chatSafety}</Text>
          <Pressable onPress={() => Linking.openURL(PERSON_URL).catch(() => {})} accessibilityRole="link" accessibilityHint={t.chatPersonHint}>
            <Text style={st.person}>{t.chatPerson}</Text>
          </Pressable>
        </ScrollView>

        {error ? <Text style={st.error} accessibilityLiveRegion="polite">{error}</Text> : null}
        <View style={[st.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={st.input}
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (error) setError(null);
            }}
            placeholder={t.chatPlaceholder}
            placeholderTextColor={C.ink2}
            accessibilityLabel={t.chatInputLabel}
            multiline
            maxLength={MAX_MESSAGE}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => ask(text)}
          />
          <Pressable onPress={() => ask(text)} disabled={!canSend} accessibilityRole="button" accessibilityLabel={t.chatSend} accessibilityState={{ disabled: !canSend }}>
            {({ pressed }) => (
              <View style={[st.send, !canSend && st.sendOff, pressed && canSend && st.sendPressed]}>
                <Text style={st.sendText}>{t.chatSend}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ who, text }) {
  const you = who === "you";
  return (
    <View style={[st.bubble, you ? st.you : st.lupa]}>
      <Text style={[st.bubbleText, you && { color: C.onBrand }]} selectable>
        {text}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.bg },
  ask: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingLeft: 8, paddingRight: 14, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  askPressed: { backgroundColor: C.bg2, borderColor: C.brand, transform: [{ translateY: 1 }] },
  askText: { fontFamily: F.body600, fontSize: 17, color: C.brand },
  head: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  name: { fontFamily: F.display800, fontSize: 22, color: C.ink },
  role: { fontFamily: F.body, fontSize: 15, color: C.ink2 },
  close: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  closeText: { fontFamily: F.body600, fontSize: 17, color: C.ink },
  list: { padding: 16, paddingBottom: 24, gap: 10 },
  bubble: { maxWidth: "88%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  lupa: { alignSelf: "flex-start", backgroundColor: C.bg2, borderTopLeftRadius: 6 },
  you: { alignSelf: "flex-end", backgroundColor: C.brand, borderTopRightRadius: 6 },
  bubbleText: { fontFamily: F.body, fontSize: 18, lineHeight: 26, color: C.ink },
  suggest: { gap: 8, marginTop: 4 },
  suggestTitle: { fontFamily: F.body600, fontSize: 14, color: C.ink2, textTransform: "uppercase", letterSpacing: 0.8 },
  chip: { alignSelf: "flex-start", borderWidth: 1.5, borderColor: C.secondaryEdge, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.surface },
  chipPressed: { backgroundColor: C.bg2, borderColor: C.brand },
  chipText: { fontFamily: F.body500, fontSize: 17, color: C.brand },
  thinking: { flexDirection: "row", alignItems: "center", gap: 8 },
  thinkingText: { fontFamily: F.body, fontSize: 16, color: C.ink2 },
  note: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.ink2, marginTop: 8 },
  person: { fontFamily: F.body500, fontSize: 16, color: C.brand, textDecorationLine: "underline", paddingVertical: 6 },
  error: { fontFamily: F.body500, fontSize: 16, lineHeight: 22, color: C.flagInk, backgroundColor: C.flagTint, marginHorizontal: 12, marginBottom: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, overflow: "hidden" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line },
  input: { flex: 1, maxHeight: 120, minHeight: 50, fontFamily: F.body, fontSize: 18, color: C.ink, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.secondaryEdge, borderRadius: 14, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 },
  send: { minHeight: 50, paddingHorizontal: 18, borderRadius: 14, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  sendOff: { backgroundColor: C.disabled },
  sendPressed: { backgroundColor: C.brandPressed, transform: [{ translateY: 1 }] },
  sendText: { fontFamily: F.body600, fontSize: 17, color: C.onBrand },
});
