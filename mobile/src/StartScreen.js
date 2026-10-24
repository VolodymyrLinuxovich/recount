import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { C, Card, H1, H2, LinkText, P, Screen, s } from "./ui";

const api = anyApi;
export const SAMPLE_URL = "https://recount-nu.vercel.app/sample-bill.png";

/**
 * Upload a local or remote file to Convex storage; returns { storageId, type }.
 * On phones we use the native uploader: posting a fetch() Blob is unreliable in React Native
 * (iOS often sends an empty or broken body). Photos are shrunk to ~1600 px wide first,
 * which is plenty to read a bill and makes upload and reading much faster.
 */
async function uploadFile(generateUploadUrl, uri, type) {
  let contentType = type || "image/jpeg";
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    const res = await fetch(await generateUploadUrl(), { method: "POST", headers: { "Content-Type": contentType }, body: blob });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return { storageId: (await res.json()).storageId, type: contentType };
  }
  let local = uri;
  if (/^https?:/i.test(uri)) {
    const d = await FileSystem.downloadAsync(uri, `${FileSystem.cacheDirectory}upload-${Date.now()}`);
    local = d.uri;
  } else if (contentType.startsWith("image/")) {
    const small = await manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.75, format: SaveFormat.JPEG });
    local = small.uri;
    contentType = "image/jpeg";
  }
  const res = await FileSystem.uploadAsync(await generateUploadUrl(), local, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": contentType },
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`Upload failed (${res.status})`);
  return { storageId: JSON.parse(res.body).storageId, type: contentType };
}

function imageType(asset) {
  const m = asset.mimeType || "";
  if (/png/i.test(m) || /\.png$/i.test(asset.uri)) return "image/png";
  if (/webp/i.test(m)) return "image/webp";
  return "image/jpeg"; // the picker re-encodes to JPEG when quality < 1
}

export function StartScreen({ t, lang, setLang, bills, onOpen, onStarted }) {
  const generateUploadUrl = useMutation(api.cases.generateUploadUrl);
  const start = useMutation(api.cases.start);
  const [busy, setBusy] = useState(null); // "photo" | "sample" | null
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
        <Text style={st.brand}>{t.appName}</Text>
        <Pressable onPress={() => setLang(lang === "en" ? "es" : "en")} style={st.lang} accessibilityRole="button" hitSlop={10}>
          <Text style={st.langText}>{t.language}</Text>
        </Pressable>
      </View>
      <H1>{t.startTitle}</H1>
      <P>{t.startBody}</P>
      <View style={st.links}>
        <LinkText label={t.choosePhoto} onPress={() => !busy && begin("photo", fromLibrary)} />
        <LinkText label={t.choosePdf} onPress={() => !busy && begin("photo", fromPdf)} />
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}

      {bills.length > 0 && (
        <View style={{ marginTop: 26 }}>
          <H2>{t.myBills}</H2>
          {bills.map((b) => (
            <Pressable key={b.id} onPress={() => onOpen(b)} accessibilityRole="button">
              {({ pressed }) => (
                <Card style={[st.bill, pressed && { opacity: 0.7 }]}>
                  <Text style={st.billName}>{b.hospitalName || t.noName}</Text>
                  <Text style={st.billDate}>{new Date(b.createdAt).toLocaleDateString(lang === "es" ? "es-US" : "en-US")}</Text>
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
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, marginBottom: 18 },
  brand: { fontSize: 20, fontWeight: "800", color: C.ink, letterSpacing: 0.4 },
  lang: { borderWidth: 1.5, borderColor: C.ink, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  langText: { fontSize: 17, fontWeight: "600", color: C.ink },
  links: { marginTop: 4 },
  bill: { paddingVertical: 14, marginBottom: 10 },
  billName: { fontSize: 19, fontWeight: "600", color: C.ink },
  billDate: { fontSize: 16, color: C.muted, marginTop: 2 },
});
