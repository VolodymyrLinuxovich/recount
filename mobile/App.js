import AsyncStorage from "@react-native-async-storage/async-storage";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AccountScreen, useAccountBills } from "./src/Account";
import { CaseFlow } from "./src/CaseFlow";
import { ChatProvider } from "./src/Chat";
import { loadBills, rememberBill } from "./src/myBills";
import { StartScreen } from "./src/StartScreen";
import { STRINGS } from "./src/strings";
import { Platform, View } from "react-native";
import { C, FONTS } from "./src/theme";

export const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL || "https://zealous-grouse-384.convex.cloud";
const convex = new ConvexReactClient(CONVEX_URL, { unsavedChangesWarning: false });
const LANG_KEY = "recount.lang";

// Sign-in tokens stay on the phone, in the same storage as My bills.
const authStorage = Platform.OS === "web" ? undefined : AsyncStorage;

export default function App() {
  const [lang, setLangState] = useState("en");
  const [current, setCurrent] = useState(null); // { id, token } of the open bill
  const [account, setAccount] = useState(false); // the account screen is open
  const [bills, setBills] = useState([]);
  const [fontsLoaded, fontError] = useFonts(FONTS);
  const t = STRINGS[lang];

  const refresh = useCallback(() => loadBills().then(setBills), []);
  useEffect(() => {
    refresh();
    AsyncStorage.getItem(LANG_KEY)
      .then((v) => (v === "es" || v === "en") && setLangState(v))
      .catch(() => {});
  }, [refresh]);

  const setLang = (l) => {
    setLangState(l);
    AsyncStorage.setItem(LANG_KEY, l).catch(() => {});
  };

  async function onStarted({ id, token }) {
    await rememberBill({ id, token, hospitalName: null, createdAt: Date.now() });
    setCurrent({ id, token });
  }

  function goHome() {
    setCurrent(null);
    refresh();
  }

  // Show nothing (the native splash stays up) until the fonts are ready; on a font error, fall back to system fonts.
  if (!fontsLoaded && !fontError) return null;

  return (
    <ConvexAuthProvider client={convex} storage={authStorage}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ChatProvider t={t} lang={lang} current={current}>
          <View style={{ flex: 1, backgroundColor: C.bg }}>
            <Main t={t} lang={lang} setLang={setLang} bills={bills} current={current} setCurrent={setCurrent} account={account} setAccount={setAccount} onStarted={onStarted} goHome={goHome} />
          </View>
        </ChatProvider>
      </SafeAreaProvider>
    </ConvexAuthProvider>
  );
}

/** Inside the auth provider, so My bills can include the account's bills. */
function Main({ t, lang, setLang, bills, current, setCurrent, account, setAccount, onStarted, goHome }) {
  const allBills = useAccountBills(bills);
  if (current) return <CaseFlow key={current.id} t={t} id={current.id} token={current.token} onHome={goHome} />;
  if (account) return <AccountScreen t={t} onBack={() => setAccount(false)} billCount={allBills.length} />;
  return (
    <StartScreen
      t={t}
      lang={lang}
      setLang={setLang}
      bills={allBills}
      onOpen={(b) => setCurrent({ id: b.id, token: b.token })}
      onStarted={onStarted}
      onAccount={() => setAccount(true)}
    />
  );
}
