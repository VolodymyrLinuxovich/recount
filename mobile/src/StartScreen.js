import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { AccountIcon } from "./Account";
import { RecountLogo } from "./Logo";
import { useLupa } from "./Chat";
import { imageType, uploadFile } from "./upload";
import { C, Card, F, H1, H2, LinkText, P, Screen, s } from "./ui";

const api = anyApi;
export const SAMPLE_URL = "https://recount-nu.vercel.app/sample-bill.png";
/** A paper bill can be sent as up to this many photos (the server checks it too, see convex/lib/pages.ts). */
const MAX_PAGES = 6;
let pageSeq = 0;
const isPdf = (f) => f.type === "application/pdf";

export function StartScreen({ t, lang, setLang, bills, onOpen, onStarted, onAccount }) {
  const generateUploadUrl = useMutation(api.cases.generateUploadUrl);
  const start = useMutation(api.cases.start);
  const [busy, setBusy] = useState(null); // "photo" | "sample" | null
  const lupa = useLupa();
  const [error, setError] = useState(null);
  // Photos of a paper bill, page by page, before it's sent. Null until the first photo.
  const [pages, setPages] = useState(null);

  /** Photos join the pages screen; a single PDF goes straight through. */
  function addPicked(picked) {
    const list = (Array.isArray(picked) ? picked : [picked]).filter(Boolean);
    const current = pages || [];
    if (list.some(isPdf)) {
      if (!current.length && list.length === 1) return false; // send it as it is
      setError(t.pagesPdfAlone);
      return true;
    }
    const room = MAX_PAGES - current.length;
    const next = [...current, ...list.slice(0, room).map((p) => ({ ...p, key: `p${++pageSeq}` }))];
    setPages(next);
    setError(list.length > room ? t.pagesTooMany(MAX_PAGES) : null);
    return true;
  }

  async function begin(kind, getFile) {
    setError(null);
    let picked;
    try {
      picked = await getFile();
    } catch {
      setError(t.uploadFailed);
      return;
    }
    if (!picked && kind !== "sample") return; // cancelled
    if (Array.isArray(picked) && !picked.length) return;
    if (kind !== "sample" && addPicked(picked)) return;
    setBusy(kind);
    try {
      let fileId;
      let fileType;
      if (picked) {
        const up = await uploadFile(generateUploadUrl, picked.uri, picked.type);
        fileId = up.storageId;
        fileType = up.type;
      }
      const { id, token } = await start({ sample: kind === "sample", fileId, fileType, lang });
      setBusy(null);
      onStarted({ id, token });
    } catch (e) {
      setBusy(null);
      console.warn("upload failed", e);
      setError(/too many/i.test(String(e)) ? t.busy : t.uploadFailed);
    }
  }

  /** "Check my bill": upload every page in order, then start one bill with all of them. */
  async function sendPages() {
    if (!pages?.length || busy) return;
    setError(null);
    setBusy("pages");
    try {
      const ups = [];
      for (const p of pages) ups.push(await uploadFile(generateUploadUrl, p.uri, p.type));
      const morePages = ups.slice(1).map((u) => ({ fileId: u.storageId, type: u.type }));
      const { id, token } = await start({ sample: false, fileId: ups[0].storageId, fileType: ups[0].type, ...(morePages.length ? { morePages } : {}), lang });
      setBusy(null);
      setPages(null);
      onStarted({ id, token });
    } catch (e) {
      setBusy(null);
      console.warn("upload failed", e);
      // The pages stay, so a retry doesn't mean taking the photos again.
      setError(/too many/i.test(String(e)) ? t.busy : String(e?.data || "") || t.uploadFailed);
    }
  }

  const room = MAX_PAGES - (pages?.length || 0);

  const fromLibrary = async () => {
    // Several photos at once: a paper bill's pages, in the order picked.
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsMultipleSelection: room > 1, selectionLimit: Math.max(1, room), orderedSelection: true });
    if (r.canceled || !r.assets?.length) return null;
    return r.assets.map((a) => ({ uri: a.uri, type: imageType(a) }));
  };

  const fromCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) throw new Error("no camera permission");
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
      if (r.canceled || !r.assets?.length) return null;
      return { uri: r.assets[0].uri, type: imageType(r.assets[0]) };
    } catch {
      // No camera (simulator) or permission denied: fall back to the photo library.
      setError(t.noCamera);
      return fromLibrary();
    }
  };

  const fromPdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.length) return null;
    const a = r.assets[0];
    return { uri: a.uri, type: a.mimeType || (/\.pdf$/i.test(a.name || "") ? "application/pdf" : "image/jpeg") };
  };

  const sample = async () => {
    try {
      const head = await fetch(SAMPLE_URL, { method: "HEAD" });
      return head.ok ? { uri: SAMPLE_URL, type: "image/png" } : null;
    } catch {
      return null; // the backend has its own copy of the sample
    }
  };

  if (pages?.length) {
    const move = (i, dir) => {
      const j = i + dir;
      if (j < 0 || j >= pages.length) return;
      const next = [...pages];
      [next[i], next[j]] = [next[j], next[i]];
      setPages(next);
    };
    const remove = (i) => {
      const next = pages.filter((_, k) => k !== i);
      setPages(next.length ? next : null);
      setError(null);
    };
    const sending = busy === "pages";
    return (
      <Screen
        t={t}
        onBack={sending ? undefined : () => { setPages(null); setError(null); }}
        primary={{ label: sending ? t.uploading : t.checkBill, onPress: sendPages, busy: sending, disabled: !!busy }}
        secondary={room > 0 ? { label: t.addPage, onPress: () => begin("photo", fromCamera), disabled: !!busy } : undefined}
      >
        <H1>{t.pagesTitle}</H1>
        <P>{t.pagesBody}</P>
        <Text style={st.count} accessibilityLiveRegion="polite">{t.pagesCount(pages.length)}</Text>
        {pages.map((p, i) => (
          <Card key={p.key} style={st.page}>
            <Image source={{ uri: p.uri }} style={st.thumb} resizeMode="cover" accessibilityLabel={t.pageAlt(i + 1, pages.length)} />
            <View style={st.pageSide}>
              <Text style={st.pageName}>{t.pageN(i + 1)}</Text>
              <View style={st.tools}>
                <Tool label={t.pageUpShort} a11y={t.pageUp(i + 1)} icon="↑" disabled={i === 0 || !!busy} onPress={() => move(i, -1)} />
                <Tool label={t.pageDownShort} a11y={t.pageDown(i + 1)} icon="↓" disabled={i === pages.length - 1 || !!busy} onPress={() => move(i, 1)} />
                <Tool label={t.pageRemoveShort} a11y={t.pageRemove(i + 1)} icon="×" disabled={!!busy} onPress={() => remove(i)} />
              </View>
            </View>
          </Card>
        ))}
        {room > 0 ? (
          <LinkText label={t.addPageLibrary} onPress={() => !busy && begin("photo", fromLibrary)} />
        ) : (
          <Text style={st.count}>{t.pagesMax(MAX_PAGES)}</Text>
        )}
        {error ? <Text style={s.error}>{error}</Text> : null}
        {!sending ? <LinkText label={t.pagesStartOver} onPress={() => { setPages(null); setError(null); }} /> : null}
      </Screen>
    );
  }

  return (
    <Screen
      t={t}
      primary={{ label: busy === "photo" ? t.uploading : t.takePhoto, onPress: () => begin("photo", fromCamera), busy: busy === "photo", disabled: !!busy }}
      secondary={{ label: busy === "sample" ? t.startingSample : t.trySample, onPress: () => begin("sample", sample), busy: busy === "sample", disabled: !!busy }}
    >
      <View style={st.top}>
        <RecountLogo size={40} label={t.appName} />
        <View style={st.right}>
          <View style={st.lang} accessibilityRole="radiogroup" accessibilityLabel={t.language}>
          {["en", "es"].map((code) => {
            const on = lang === code;
            return (
              <Pressable
                key={code}
                onPress={() => !on && setLang(code)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={code === "en" ? "English" : "Español"}
                hitSlop={6}
                style={({ pressed }) => [st.langBtn, on && st.langBtnOn, pressed && !on && st.langBtnPressed]}
              >
                <Text style={[st.langText, on && st.langTextOn]}>{code.toUpperCase()}</Text>
              </Pressable>
            );
          })}
          </View>
          <AccountIcon t={t} onPress={onAccount} />
        </View>
      </View>
      <H1>{t.startTitle}</H1>
      <P>{t.startBody}</P>
      <View style={st.links}>
        <LinkText label={t.choosePhoto} onPress={() => !busy && begin("photo", fromLibrary)} />
        <LinkText label={t.choosePdf} onPress={() => !busy && begin("photo", fromPdf)} />
        {lupa ? <LinkText label={t.chatAskLink} onPress={lupa.open} /> : null}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}

      {bills.length > 0 && (
        <View style={{ marginTop: 28 }}>
          <H2>{t.myBills}</H2>
          {bills.map((b) => (
            <Pressable key={b.id} onPress={() => onOpen(b)} accessibilityRole="button">
              {({ pressed }) => (
                <Card style={[st.bill, pressed && st.billPressed]}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.billName}>{b.hospitalName || t.noName}</Text>
                    <Text style={st.billDate}>{new Date(b.createdAt).toLocaleDateString(lang === "es" ? "es-US" : "en-US")}</Text>
                  </View>
                  <Text style={st.chev}>›</Text>
                </Card>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

/** A small labeled button on a page card (44 px or more to tap). */
function Tool({ label, a11y, icon, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      style={({ pressed }) => [st.tool, pressed && !disabled && st.toolPressed, disabled && st.toolOff]}
    >
      <Text style={[st.toolText, disabled && { color: C.ink2 }]}>
        {icon} {label}
      </Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  count: { fontFamily: F.body600, fontSize: 18, lineHeight: 26, color: C.ink, marginBottom: 12 },
  page: { flexDirection: "row", alignItems: "flex-start", padding: 12, gap: 12 },
  thumb: { width: 84, height: 108, borderRadius: 8, backgroundColor: C.bg2, borderWidth: 1, borderColor: C.line },
  pageSide: { flex: 1, minWidth: 0 },
  pageName: { fontFamily: F.display700, fontSize: 20, lineHeight: 26, color: C.ink, marginBottom: 8 },
  tools: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tool: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  toolPressed: { backgroundColor: C.bg2, borderColor: C.brand },
  toolOff: { opacity: 0.5 },
  toolText: { fontFamily: F.body600, fontSize: 17, color: C.ink },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginBottom: 28 },
  right: { flexDirection: "row", alignItems: "center" },
  lang: { flexDirection: "row", padding: 3, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.surface },
  langBtn: { minWidth: 48, minHeight: 42, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  langBtnOn: { backgroundColor: C.brand },
  langBtnPressed: { backgroundColor: C.bg2 },
  langText: { fontFamily: F.body600, fontSize: 16, color: C.ink2 },
  langTextOn: { color: C.onBrand },
  links: { marginTop: 6 },
  bill: { flexDirection: "row", alignItems: "center", paddingVertical: 16, marginBottom: 10 },
  billPressed: { backgroundColor: C.bg2, borderColor: C.brand, transform: [{ translateY: 1 }] },
  billName: { fontFamily: F.display700, fontSize: 19, lineHeight: 25, color: C.ink },
  billDate: { fontFamily: F.body, fontSize: 16, color: C.ink2, marginTop: 2 },
  chev: { fontFamily: F.body600, fontSize: 30, color: C.brand, marginLeft: 12 },
});
