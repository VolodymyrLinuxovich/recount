// Optional accounts, like the website: email + password (Convex Auth). Signed in, the bills on
// this phone are attached to the account (cases.claim) and the account's bills show in My bills.
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { BackHandler, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { C, Card, F, H1, P, Screen, s } from "./ui";

const api = anyApi;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const validId = (id) => /^[0-9a-z]{25,40}$/.test(id);

/** The round profile button in the start screen's header. */
export function AccountIcon({ t, onPress }) {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.profile.get, isAuthenticated ? {} : "skip");
  const initial = (me?.accountName || me?.name || me?.accountEmail || "").trim().charAt(0).toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={isAuthenticated ? t.acctYours : t.acctSignIn}
      style={({ pressed }) => [st.pic, isAuthenticated && st.picOn, pressed && st.picPressed]}
    >
      {isAuthenticated && initial ? (
        <Text style={st.picLetter}>{initial}</Text>
      ) : (
        <Svg width={26} height={26} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
          <Circle cx={12} cy={8.5} r={4} fill={isAuthenticated ? C.onBrand : C.ink2} />
          <Path d="M4 20.5c1.2-4 4.4-6 8-6s6.8 2 8 6" fill={isAuthenticated ? C.onBrand : C.ink2} />
        </Svg>
      )}
    </Pressable>
  );
}

function authError(t, e, mode) {
  const raw = e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message : String(e);
  if (/valid email/i.test(raw)) return t.acctErrEmail;
  if (/at least 8/i.test(raw)) return t.acctErrShort;
  if (/too long/i.test(raw)) return t.acctErrLong;
  if (/too ?many/i.test(raw)) return t.acctErrTooMany;
  if (/signs in with Google/i.test(raw)) return t.acctErrGoogle;
  if (/already exists/i.test(raw)) return t.acctErrExists;
  if (/network|fetch|offline|connection/i.test(raw)) return t.acctErrNetwork;
  return mode === "signIn" ? t.acctErrWrong : t.acctErrSignUp;
}

/** Signed out: create an account or sign in. Signed in: who you are, and Sign out. */
export function AccountScreen({ t, onBack, billCount }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.profile.get, isAuthenticated ? {} : "skip");
  const { signIn, signOut } = useAuthActions();
  const [mode, setMode] = useState("signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Android's back button closes this screen, like Back at the top.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const pick = (m) => {
    setMode(m);
    setError(null);
  };

  async function submit() {
    const em = email.trim().toLowerCase();
    if (!EMAIL.test(em)) return setError(t.acctErrEmail);
    if (mode === "signUp" && password.length < 8) return setError(t.acctErrShort);
    if (!password) return setError(t.acctErrNoPassword);
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email: em, password, flow: mode });
      setPassword("");
    } catch (e) {
      setError(authError(t, e, mode));
    }
    setBusy(false);
  }

  if (isAuthenticated) {
    return (
      <Screen
        t={t}
        onBack={onBack}
        primary={{ label: t.acctDone, onPress: onBack }}
        secondary={{ label: busy ? t.acctWorking : t.acctSignOut, busy, onPress: async () => { setBusy(true); await signOut().catch(() => {}); setBusy(false); } }}
      >
        <H1>{t.acctYours}</H1>
        <Card>
          <Text style={st.label}>{t.acctSignedInAs}</Text>
          <Text style={st.email}>{me?.accountEmail || "…"}</Text>
        </Card>
        <P>{billCount ? t.acctSynced(billCount) : t.acctWhy}</P>
      </Screen>
    );
  }

  return (
    <Screen
      t={t}
      onBack={onBack}
      primary={{ label: busy ? t.acctWorking : mode === "signUp" ? t.acctCreate : t.acctSignInBtn, onPress: submit, busy, disabled: isLoading }}
    >
      <H1>{mode === "signUp" ? t.acctTabCreate : t.acctTabSignIn}</H1>
      <P>{t.acctWhy}</P>
      <P muted>{t.acctOptional}</P>

      <View style={st.tabs} accessibilityRole="radiogroup">
        {[["signUp", t.acctTabCreate], ["signIn", t.acctTabSignIn]].map(([m, label]) => {
          const on = mode === m;
          return (
            <Pressable key={m} onPress={() => pick(m)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[st.tab, on && st.tabOn]}>
              <Text style={[st.tabText, on && st.tabTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={st.label} nativeID="acct-email">{t.acctEmail}</Text>
      <TextInput
        style={st.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        accessibilityLabelledBy="acct-email"
        accessibilityLabel={t.acctEmail}
      />
      <Text style={st.label} nativeID="acct-pw">{t.acctPassword}</Text>
      {mode === "signUp" ? <Text style={st.hint}>{t.acctPasswordHint}</Text> : null}
      <View style={st.pwRow}>
        <TextInput
          style={[st.input, { flex: 1, marginBottom: 0 }]}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={mode === "signUp" ? "new-password" : "current-password"}
          textContentType={mode === "signUp" ? "newPassword" : "password"}
          accessibilityLabelledBy="acct-pw"
          accessibilityLabel={t.acctPassword}
          onSubmitEditing={submit}
        />
        <Pressable onPress={() => setShow((v) => !v)} style={st.showBtn} accessibilityRole="button">
          <Text style={st.showText}>{show ? t.acctHide : t.acctShow}</Text>
        </Pressable>
      </View>
      {mode === "signUp" ? <P muted style={{ marginTop: 12 }}>{t.acctNoReset}</P> : <P muted style={{ marginTop: 12 }}>{t.acctNoForgot}</P>}
      {error ? (
        <Text style={s.error} accessibilityLiveRegion="polite">
          {error}
          {error === t.acctErrExists && mode === "signUp" ? (
            <Text style={st.inlineLink} onPress={() => pick("signIn")}>{" " + t.acctToSignIn}</Text>
          ) : null}
        </Text>
      ) : null}
    </Screen>
  );
}

/** Signed in: attach this phone's bills to the account once each, and return the account's bills. */
export function useAccountBills(localBills) {
  const { isAuthenticated } = useConvexAuth();
  const claim = useMutation(api.cases.claim);
  const mine = useQuery(api.cases.mine, isAuthenticated ? {} : "skip");
  const tried = useRef(new Set());
  useEffect(() => {
    if (!isAuthenticated) {
      tried.current.clear();
      return;
    }
    const items = localBills.filter((b) => b.token && validId(b.id) && !tried.current.has(b.id)).map((b) => ({ id: b.id, token: b.token }));
    if (!items.length) return;
    items.forEach((i) => tried.current.add(i.id));
    claim({ items }).catch(() => items.forEach((i) => tried.current.delete(i.id)));
  }, [isAuthenticated, localBills, claim]);
  if (!isAuthenticated || !mine) return localBills;
  // The account's bills plus any on this phone not attached yet, newest first.
  const byId = new Map(localBills.map((b) => [b.id, b]));
  for (const b of mine) if (b.token) byId.set(b.id, { ...byId.get(b.id), id: b.id, token: b.token, hospitalName: b.hospitalName ?? byId.get(b.id)?.hospitalName ?? null, createdAt: b.createdAt });
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

const st = StyleSheet.create({
  pic: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", marginLeft: 10 },
  picOn: { backgroundColor: C.brand, borderColor: C.brand },
  picPressed: { transform: [{ translateY: 1 }], opacity: 0.85 },
  picLetter: { fontFamily: F.display700, fontSize: 20, color: C.onBrand },
  tabs: { flexDirection: "row", padding: 3, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.surface, marginTop: 8, marginBottom: 20 },
  tab: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: C.brand },
  tabText: { fontFamily: F.body600, fontSize: 16, color: C.ink2 },
  tabTextOn: { color: C.onBrand },
  label: { fontFamily: F.body600, fontSize: 16, color: C.ink, marginBottom: 6 },
  hint: { fontFamily: F.body, fontSize: 15, color: C.ink2, marginBottom: 6 },
  email: { fontFamily: F.display700, fontSize: 19, color: C.ink },
  input: { minHeight: 52, borderWidth: 1.5, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, fontFamily: F.body, fontSize: 18, color: C.ink, backgroundColor: C.surface, marginBottom: 16 },
  pwRow: { flexDirection: "row", alignItems: "center" },
  showBtn: { minHeight: 52, paddingHorizontal: 14, justifyContent: "center", marginLeft: 8 },
  showText: { fontFamily: F.body600, fontSize: 16, color: C.brand },
  inlineLink: { color: C.brand, textDecorationLine: "underline" },
});
