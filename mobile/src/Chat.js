// Lupa on the phone: the same helper chat as the web (convex/chat.ts), full screen.
// Opened from a bill, it answers about that bill (caseId + token); opened from the start
// screen, it answers general questions. send() returns at once and the reply streams into list().
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { ConvexError } from "convex/values";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Lupa } from "./Lupa";
import { C, F } from "./theme"; // not "./ui": ui.js imports this file
import { imageType, uploadFile } from "./upload";


const api = anyApi;
const MAX_MESSAGE = 1000;
const PERSON_URL = "https://healthconsumer.org/";
// Same limits as the server (convex/lib/attach.ts). Photos are shrunk before upload anyway.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
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
  const uploadUrl = useMutation(api.chat.generateUploadUrl);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null); // { uri, type, name }
  const [menu, setMenu] = useState(false);
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
    if ((!question && !file) || !sessionId || sending || waiting) return;
    if (question && SENSITIVE.test(question)) {
      setError(t.chatSensitive);
      return;
    }
    setError(null);
    setMenu(false);
    setSending(true);
    try {
      let attach = {};
      if (file) {
        const up = await uploadFile(() => uploadUrl({ lang }), file.uri, file.type);
        attach = { fileId: up.storageId, fileType: up.type, fileName: file.name };
      }
      await send({ sessionId, ...(caseId ? { caseId, token } : {}), lang, content: question.slice(0, MAX_MESSAGE), ...attach });
      setText("");
      setFile(null);
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : t.chatFailed);
    } finally {
      setSending(false);
    }
  }

  // Picking an attachment: a photo (camera or library) or a PDF. Big photos are shrunk on upload.
  async function pick(kind) {
    setMenu(false);
    setError(null);
    try {
      let picked = null;
      if (kind === "pdf") {
        const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
        if (r.canceled || !r.assets?.length) return;
        const a = r.assets[0];
        const pdf = a.mimeType === "application/pdf" || /\.pdf$/i.test(a.name || "");
        if (!pdf && !(a.mimeType || "").startsWith("image/")) {
          setError(t.chatFileType);
          return;
        }
        if (pdf && a.size && a.size > MAX_PDF_BYTES) {
          setError(t.chatFileTooBig);
          return;
        }
        picked = { uri: a.uri, type: pdf ? "application/pdf" : imageType(a), name: a.name || (pdf ? "document.pdf" : "photo.jpg") };
      } else {
        let r;
        if (kind === "camera") {
          const perm = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
          if (!perm?.granted) {
            setError(t.noCamera);
            r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
          } else {
            r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
          }
        } else {
          r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
        }
        if (r.canceled || !r.assets?.length) return;
        const a = r.assets[0];
        // The photo is shrunk to a small JPEG on upload, so only a huge original is refused.
        if (a.fileSize && a.fileSize > 8 * MAX_IMAGE_BYTES) {
          setError(t.chatFileTooBig);
          return;
        }
        picked = { uri: a.uri, type: imageType(a), name: a.fileName || "photo.jpg" };
      }
      setFile(picked);
    } catch {
      setError(t.uploadFailed);
    }
  }

  const suggestions = caseId ? [t.chatQCase1, t.chatQCase2, t.chatQCase3] : [t.chatQStart1, t.chatQStart2, t.chatQStart3];
  const empty = messages !== undefined && messages.length === 0;
  const canSend = (!!text.trim() || !!file) && !!sessionId && !sending && !waiting;
  const canAttach = !!sessionId && !sending && !waiting;

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
              <View key={m._id} style={st.youStack}>
                {m.fileType ? <SentFile t={t} type={m.fileType} name={m.fileName} url={m.fileUrl} /> : null}
                {m.content ? <Bubble who="you" text={m.content} /> : null}
              </View>
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
        {menu ? (
          <View style={st.menu} accessibilityLabel={t.chatAttachHint}>
            <Text style={st.menuHint}>{t.chatAttachHint}</Text>
            <View style={st.menuRow}>
              {[
                ["camera", t.chatAttachCamera],
                ["photo", t.chatAttachPhoto],
                ["pdf", t.chatAttachPdf],
              ].map(([k, label]) => (
                <Pressable key={k} onPress={() => pick(k)} accessibilityRole="button">
                  {({ pressed }) => (
                    <View style={[st.chip, pressed && st.chipPressed]}>
                      <Text style={st.chipText}>{label}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {file ? (
          <View style={st.attached}>
            {file.type.startsWith("image/") ? (
              <Image source={{ uri: file.uri }} style={st.attachedThumb} accessibilityIgnoresInvertColors />
            ) : (
              <View style={st.pdfBox}>
                <Text style={st.pdfText}>PDF</Text>
              </View>
            )}
            <Text style={st.attachedName} numberOfLines={1} accessibilityLabel={`${t.chatAttachedFile}: ${file.name}`}>
              {file.name}
            </Text>
            {sending ? <Text style={st.uploading}>{t.chatUploading}</Text> : null}
            <Pressable onPress={() => setFile(null)} disabled={sending} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${t.chatRemoveFile}: ${file.name}`}>
              {({ pressed }) => (
                <View style={[st.remove, pressed && st.chipPressed]}>
                  <Text style={st.removeText}>×</Text>
                </View>
              )}
            </Pressable>
          </View>
        ) : null}
        <View style={[st.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            onPress={() => setMenu((v) => !v)}
            disabled={!canAttach}
            accessibilityRole="button"
            accessibilityLabel={t.chatAttach}
            accessibilityHint={t.chatAttachHint}
            accessibilityState={{ disabled: !canAttach, expanded: menu }}
          >
            {({ pressed }) => (
              <View style={[st.attach, !canAttach && { opacity: 0.45 }, (pressed || menu) && st.chipPressed]}>
                <Svg width={24} height={24} viewBox="0 0 24 24">
                  <Path
                    d="M20 11.5l-7.8 7.8a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8"
                    fill="none"
                    stroke={C.ink}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>
            )}
          </Pressable>
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

/** The photo or PDF in the patient's own bubble; tapping opens it. */
function SentFile({ t, type, name, url }) {
  if (!url) return <Text style={st.gone}>{t.chatFileGone}</Text>;
  const open = () => Linking.openURL(url).catch(() => {});
  const photo = type.startsWith("image/");
  return (
    <Pressable onPress={open} accessibilityRole="link" accessibilityLabel={`${photo ? t.chatAttachedPhoto : t.chatAttachedFile}. ${t.chatOpenFile}`}>
      {photo ? (
        <Image source={{ uri: url }} style={st.sentPhoto} resizeMode="cover" />
      ) : (
        <View style={st.sentFile}>
          <View style={st.pdfBox}>
            <Text style={st.pdfText}>PDF</Text>
          </View>
          <Text style={st.attachedName} numberOfLines={1}>
            {name || t.chatAttachedFile}
          </Text>
        </View>
      )}
    </Pressable>
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
  attach: { minHeight: 50, width: 50, borderRadius: 14, borderWidth: 1.5, borderColor: C.secondaryEdge, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  menu: { paddingHorizontal: 12, paddingTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: C.line },
  menuHint: { fontFamily: F.body, fontSize: 15, lineHeight: 21, color: C.ink2 },
  menuRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  attached: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginTop: 8, padding: 6, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.surface },
  attachedThumb: { width: 44, height: 44, borderRadius: 8 },
  attachedName: { flex: 1, fontFamily: F.body, fontSize: 16, color: C.ink },
  uploading: { fontFamily: F.body, fontSize: 14, color: C.ink2 },
  pdfBox: { width: 44, height: 44, borderRadius: 8, backgroundColor: C.bg2, alignItems: "center", justifyContent: "center" },
  pdfText: { fontFamily: F.body600, fontSize: 14, color: C.ink },
  remove: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  removeText: { fontFamily: F.body600, fontSize: 26, lineHeight: 30, color: C.ink },
  youStack: { width: "100%", alignItems: "flex-end", gap: 6 },
  sentPhoto: { width: 170, height: 170, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg2 },
  sentFile: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 260, padding: 6, paddingRight: 12, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  gone: { fontFamily: F.body, fontSize: 15, color: C.ink2, paddingVertical: 4 },
});
