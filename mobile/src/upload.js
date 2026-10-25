// Uploading a photo or PDF to Convex storage, shared by the start screen (bills) and Lupa's chat
// (attachments). Uses only modules the installed app already has.
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";

/**
 * Upload a local or remote file to Convex storage; returns { storageId, type }.
 * On phones we use the native uploader: posting a fetch() Blob is unreliable in React Native
 * (iOS often sends an empty or broken body). Photos are shrunk to ~1600 px wide first,
 * which is plenty to read a bill and makes upload and reading much faster.
 */
export async function uploadFile(generateUploadUrl, uri, type) {
  let contentType = type || "image/jpeg";
  if (Platform.OS === "web") {
    if (contentType.startsWith("image/")) {
      // Phone photos can be over 10 MB; shrink them like the native path does.
      uri = (await manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.75, format: SaveFormat.JPEG })).uri;
      contentType = "image/jpeg";
    }
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

export function imageType(asset) {
  const m = asset.mimeType || "";
  if (/png/i.test(m) || /\.png$/i.test(asset.uri)) return "image/png";
  if (/webp/i.test(m)) return "image/webp";
  return "image/jpeg"; // the picker re-encodes to JPEG when quality < 1
}
