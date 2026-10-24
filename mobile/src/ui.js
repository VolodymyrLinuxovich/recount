import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const C = {
  paper: "#F6F2E8",
  card: "#FFFDF7",
  line: "#DDD5C4",
  ink: "#1E1A15",
  muted: "#5E564B",
  red: "#B3261E",
  redSoft: "#F6E3DF",
  disabled: "#B9B1A3",
};

const serif = Platform.select({ ios: "Georgia", android: "serif", default: undefined });

/** One step per screen: header (Back + progress), scrolling body, buttons pinned at the bottom. */
export function Screen({ t, step, onBack, children, primary, secondary, footer = true }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.fill, { paddingTop: insets.top }]}>
        {(onBack || step) && (
          <View style={s.header}>
            {onBack ? (
              <Pressable onPress={onBack} hitSlop={16} accessibilityRole="button" style={s.backBtn}>
                <Text style={s.back}>{"‹ " + t.back}</Text>
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
        <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
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
      <View style={s.bars}>
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={[s.bar, n <= step && s.barOn]} />
        ))}
      </View>
    </View>
  );
}

export function Button({ label, onPress, disabled, busy, kind = "primary" }) {
  const primary = kind === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={({ pressed }) => [
        s.btn,
        primary ? s.btnPrimary : s.btnSecondary,
        (disabled || busy) && (primary ? s.btnPrimaryOff : s.btnSecondaryOff),
        pressed && { opacity: 0.8 },
      ]}
    >
      {busy ? <ActivityIndicator color={primary ? "#fff" : C.ink} style={{ marginRight: 10 }} /> : null}
      <Text style={[s.btnText, primary ? s.btnTextPrimary : s.btnTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

export function LinkText({ label, onPress, style }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="link">
      <Text style={[s.link, style]}>{label}</Text>
    </Pressable>
  );
}

export function openUrl(url) {
  if (url) Linking.openURL(url).catch(() => {});
}

export const H1 = ({ children }) => <Text style={s.h1} accessibilityRole="header">{children}</Text>;
export const H2 = ({ children }) => <Text style={s.h2} accessibilityRole="header">{children}</Text>;
export const P = ({ children, muted, style }) => <Text style={[s.p, muted && { color: C.muted }, style]}>{children}</Text>;
export const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;

export const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.paper },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10, minHeight: 52 },
  backBtn: { paddingVertical: 6, paddingRight: 12 },
  back: { fontSize: 19, color: C.ink, fontWeight: "600" },
  progress: { alignItems: "flex-end" },
  progressText: { fontSize: 15, color: C.muted, marginBottom: 5 },
  bars: { flexDirection: "row", gap: 5 },
  bar: { width: 26, height: 5, borderRadius: 3, backgroundColor: C.line },
  barOn: { backgroundColor: C.ink },
  body: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 28 },
  bottom: { paddingHorizontal: 20, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.paper, gap: 10 },
  footer: { fontSize: 13, color: C.muted, textAlign: "center", marginTop: 2 },
  btn: { minHeight: 60, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", paddingHorizontal: 18 },
  btnPrimary: { backgroundColor: C.red },
  btnPrimaryOff: { backgroundColor: C.disabled },
  btnSecondary: { backgroundColor: C.card, borderWidth: 1.5, borderColor: C.ink },
  btnSecondaryOff: { borderColor: C.disabled },
  btnText: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  btnTextPrimary: { color: "#fff" },
  btnTextSecondary: { color: C.ink },
  link: { fontSize: 18, color: C.ink, textDecorationLine: "underline", paddingVertical: 8 },
  h1: { fontFamily: serif, fontSize: 32, lineHeight: 39, color: C.ink, fontWeight: "700", marginTop: 6, marginBottom: 12 },
  h2: { fontFamily: serif, fontSize: 23, lineHeight: 29, color: C.ink, fontWeight: "700", marginBottom: 8 },
  p: { fontSize: 19, lineHeight: 27, color: C.ink, marginBottom: 10 },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 18, marginBottom: 14 },
  input: { backgroundColor: C.card, borderWidth: 1.5, borderColor: C.ink, borderRadius: 12, fontSize: 20, paddingHorizontal: 16, paddingVertical: 14, color: C.ink },
  label: { fontSize: 15, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  error: { fontSize: 18, color: C.red, marginTop: 10 },
});
