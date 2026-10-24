import AsyncStorage from "@react-native-async-storage/async-storage";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CaseFlow } from "./src/CaseFlow";
import { loadBills, rememberBill } from "./src/myBills";
import { StartScreen } from "./src/StartScreen";
import { STRINGS } from "./src/strings";
import { View } from "react-native";
import { C } from "./src/ui";

export const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL || "https://zealous-grouse-384.convex.cloud";
const convex = new ConvexReactClient(CONVEX_URL, { unsavedChangesWarning: false });
const LANG_KEY = "recount.lang";

export default function App() {
  const [lang, setLangState] = useState("en");
  const [current, setCurrent] = useState(null); // { id, token } of the open bill
  const [bills, setBills] = useState([]);
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

  return (
    <ConvexProvider client={convex}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1, backgroundColor: C.paper }}>
          {current ? (
            <CaseFlow key={current.id} t={t} id={current.id} token={current.token} onHome={goHome} />
          ) : (
            <StartScreen t={t} lang={lang} setLang={setLang} bills={bills} onOpen={(b) => setCurrent({ id: b.id, token: b.token })} onStarted={onStarted} />
          )}
        </View>
      </SafeAreaProvider>
    </ConvexProvider>
  );
}
