import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, F } from "./theme";

export { C, F };

/** One step per screen: header (Back + progress), scrolling body, buttons pinned at the bottom. */
export function Screen({ t, step, onBack, children, primary, secondary, footer = true }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.fill, { paddingTop: insets.top }]}>
        {(onBack || step) && (
          <View style={s.header}>
            {onBack ? (
              <Pressable onPress={onBack} hitSlop={16} accessibilityRole="button" accessibilityLabel={t.back}>
                {({ pressed }) => (
                  <View style={[s.backBtn, pressed && s.backBtnPressed]}>
                    <Text style={s.backArrow}>‹</Text>
                    <Text style={s.back}>{t.back}</Text>
                  </View>
                )}
              </Pressable>
            ) : (
              <View />
            )}
            {step ? <Progress t={t} step={step} /> : null}
          </View>
        )}
        <ScrollView style={s.fill} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          {primary ? <Button {...primary} /> : null}
          {secondary ? <Button kind="secondary" {...secondary} /> : null}
          {footer ? <Text style={s.footer}>{t.footer}</Text> : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Progress({ t, step }) {
  return (
    <View style={s.progress} accessibilityLabel={t.stepOf(step)}>
      <Text style={s.progressText}>{t.stepOf(step)}</Text>
      <View style={s.track}>
        <View style={[s.trackFill, { width: `${(Math.min(step, 4) / 4) * 100}%` }]} />
      </View>
    </View>
  );
}

/** Flat button with a crisp press: it sinks 1px and the face darkens. */
export function Button({ label, onPress, disabled, busy, kind = "primary" }) {
  const primary = kind === "primary";
  const off = !!(disabled || busy);
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: !!busy }}
      style={({ pressed }) => [
        s.btn,
        primary ? s.btnPrimary : s.btnSecondary,
        primary && pressed && s.btnPrimaryPressed,
        !primary && pressed && s.btnSecondaryPressed,
        off && (primary ? (busy ? s.btnPrimaryBusy : s.btnPrimaryOff) : s.btnSecondaryOff),
        pressed && s.btnPressed,
      ]}
    >
      {busy ? <ActivityIndicator color={primary ? C.onBrand : C.brand} style={{ marginRight: 10 }} /> : null}
      <Text style={[s.btnText, primary ? s.btnTextPrimary : s.btnTextSecondary, off && !busy && !primary && { color: C.ink2 }]}>{label}</Text>
    </Pressable>
  );
}

export function LinkText({ label, onPress, style }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="link">
      {({ pressed }) => <Text style={[s.link, pressed && { color: C.ink }, style]}>{label}</Text>}
    </Pressable>
  );
}

export function openUrl(url) {
  if (url) Linking.openURL(url).catch(() => {});
}

export const H1 = ({ children }) => <Text style={s.h1} accessibilityRole="header">{children}</Text>;
export const H2 = ({ children }) => <Text style={s.h2} accessibilityRole="header">{children}</Text>;
export const P = ({ children, muted, style }) => <Text style={[s.p, muted && { color: C.ink2 }, style]}>{children}</Text>;
export const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;

export const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, minHeight: 60, gap: 16 },
  backBtn: { flexDirection: "row", alignItems: "center", minHeight: 44, paddingLeft: 10, paddingRight: 16, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  backBtnPressed: { backgroundColor: C.bg2, borderColor: C.brand, transform: [{ translateY: 1 }] },
  backArrow: { fontFamily: F.body600, fontSize: 26, lineHeight: 28, color: C.brand, marginRight: 6, marginTop: -2 },
  back: { fontFamily: F.body600, fontSize: 18, color: C.ink },
  progress: { flex: 1, maxWidth: 180, alignItems: "flex-end" },
  progressText: { fontFamily: F.body600, fontSize: 14, color: C.ink2, marginBottom: 6 },
  track: { alignSelf: "stretch", height: 8, borderRadius: 999, backgroundColor: C.bg2, overflow: "hidden" },
  trackFill: { height: 8, borderRadius: 999, backgroundColor: C.brand },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  bottom: { paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg, gap: 10 },
  footer: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.ink2, textAlign: "center", marginTop: 2 },
  btn: { minHeight: 58, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", paddingHorizontal: 20 },
  btnPressed: { transform: [{ translateY: 1 }, { scale: 0.985 }] },
  btnPrimary: { backgroundColor: C.brand, borderBottomWidth: 2, borderBottomColor: "rgba(0,0,0,0.18)" },
  btnPrimaryPressed: { backgroundColor: C.brandPressed, borderBottomColor: "transparent" },
  btnPrimaryOff: { backgroundColor: C.disabled, borderBottomColor: "transparent" },
  btnPrimaryBusy: { backgroundColor: C.brand, opacity: 0.85 },
  btnSecondary: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.line },
  btnSecondaryPressed: { backgroundColor: C.bg2, borderColor: C.brand },
  btnSecondaryOff: { opacity: 0.6 },
  btnText: { fontFamily: F.body600, fontSize: 19, lineHeight: 24, textAlign: "center" },
  btnTextPrimary: { color: C.onBrand },
  btnTextSecondary: { color: C.ink },
  link: { fontFamily: F.body500, fontSize: 18, lineHeight: 26, color: C.brand, textDecorationLine: "underline", paddingVertical: 9 },
  h1: { fontFamily: F.display800, fontSize: 31, lineHeight: 37, letterSpacing: -0.5, color: C.ink, marginTop: 8, marginBottom: 12 },
  h2: { fontFamily: F.display800, fontSize: 23, lineHeight: 29, letterSpacing: -0.3, color: C.ink, marginBottom: 8 },
  p: { fontFamily: F.body, fontSize: 18, lineHeight: 28, color: C.ink, marginBottom: 10 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 18, marginBottom: 14 },
  input: { outlineColor: C.brand, fontFamily: F.body, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.secondaryEdge, borderRadius: 14, fontSize: 19, paddingHorizontal: 16, paddingVertical: 14, color: C.ink },
  label: { fontFamily: F.body600, fontSize: 14, color: C.ink2, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  error: { fontFamily: F.body500, fontSize: 17, lineHeight: 24, color: C.flagInk, backgroundColor: C.flagTint, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12, overflow: "hidden" },
});
