import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AccountIcon } from "./Account";
import { RecountLogo } from "./Logo";
import { useLupa } from "./Chat";
import { imageType, uploadFile } from "./upload";
import { C, Card, F, H1, H2, LinkText, P, Screen, s } from "./ui";

const api = anyApi;
export const SAMPLE_URL = "https://recount-nu.vercel.app/sample-bill.png";

export function StartScreen({ t, lang, setLang, bills, onOpen, onStarted, onAccount }) {
  const generateUploadUrl = useMutation(api.cases.generateUploadUrl);
  const start = useMutation(api.cases.start);
  const [busy, setBusy] = useState(null); // "photo" | "sample" | null
  const lupa = useLupa();
  const [error, setError] = useState(null);

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

  const fromLibrary = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (r.canceled || !r.assets?.length) return null;
    return { uri: r.assets[0].uri, type: imageType(r.assets[0]) };
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

const st = StyleSheet.create({
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
