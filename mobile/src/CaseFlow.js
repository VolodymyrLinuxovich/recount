import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Image, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { money } from "./strings";
import { forgetBill, updateBill } from "./myBills";
import { useBackgroundNotice } from "./notify";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EMPTY_DETAILS, checkDetails, fillLetter } from "./letterFill";

const DETAILS_KEY = "recount.details.v1"; // kept only on this phone
import Svg, { Circle, Path } from "react-native-svg";
import { Button, C, Card, F, H1, H2, LinkText, P, Screen, openUrl, s } from "./ui";

const api = anyApi;
const QUESTION_PAGES = ["found", "size", "income", "insured", "oop"];

export function CaseFlow({ t, id, token, onHome }) {
  const c = useQuery(api.cases.get, { id, token });
  const status = c?.status;
  useBackgroundNotice(id, c);
  const [page, setPage] = useState(null);
  const [letterIndex, setLetterIndex] = useState(0);
  const [household, setHousehold] = useState({ size: 1, income: "", insured: null, plan: null, oop: "" });
  const [drafts, setDrafts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [seenStatus, setSeenStatus] = useState(null);
  const [draftsKey, setDraftsKey] = useState("");
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [detailsTried, setDetailsTried] = useState(false);

  // The patient's details are typed once and reused for their next bill.
  useEffect(() => {
    AsyncStorage.getItem(DETAILS_KEY)
      .then((raw) => raw && setDetails((d) => ({ ...d, ...JSON.parse(raw) })))
      .catch(() => {});
  }, []);

  const confirmHospital = useMutation(api.cases.confirmHospital);
  const submitHousehold = useMutation(api.cases.submitHousehold);
  const approve = useMutation(api.cases.approve);
  const unapprove = useMutation(api.cases.unapprove);
  const remove = useMutation(api.cases.remove);
  const correctLine = useMutation(api.cases.correctLine);

  // Move to the right screen when the backend status changes (not on every update).
  // Adjusting state during render is React's recommended pattern for this.
  if (status && status !== seenStatus) {
    setSeenStatus(status);
    if (status === "needs_household") setPage(QUESTION_PAGES.includes(page) ? page : "found");
    else if (status === "drafting") setPage("answer");
    else if (status === "ready") {
      if (seenStatus === "approved") {
        setLetterIndex(0);
        setPage("letter");
      } else setPage(page === "letter" ? page : "answer");
    } else if (status === "approved") setPage("done");
    else setPage(null);
  }

  // Editable copies of the letters; reset only when the backend letters actually change.
  const lettersKey = c?.letters ? JSON.stringify(c.letters) : "";
  if (lettersKey !== draftsKey) {
    setDraftsKey(lettersKey);
    setDrafts(c?.letters ? c.letters.map((l) => ({ ...l })) : null);
  }

  // Keep "My bills" labels fresh; forget bills deleted elsewhere.
  const gone = c === null;
  const hospitalName = c?.hospital?.name || c?.bill?.hospitalName || null;
  useEffect(() => {
    if (gone) forgetBill(id);
    else if (hospitalName) updateBill(id, { hospitalName });
  }, [gone, hospitalName, id]);

  // Android hardware back follows the on-screen Back.
  const backRef = useRef(onHome);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      backRef.current?.();
      return true;
    });
    return () => sub.remove();
  }, []);

  async function run(fn) {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(String(typeof e?.data === "string" ? e.data : e?.message || e).replace(/^.*Uncaught (Convex)?Error:\s*/s, "").split("\n")[0].replace(/^[A-Z_]{4,}:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  const go = (p) => {
    setErr(null);
    setPage(p);
  };

  // Deleting is offered on the findings screen too, so a bill can be removed before any letters.
  const deleteButton = {
    label: t.deleteBill,
    onPress: () => {
      const del = () => run(async () => { await remove({ id, token }); await forgetBill(id); onHome(); });
      // Alert.alert does nothing in a web browser, so use the browser's own confirm there.
      if (Platform.OS === "web") {
        if (window.confirm(`${t.deleteConfirmTitle}\n\n${t.deleteConfirmBody}`)) del();
        return;
      }
      Alert.alert(t.deleteConfirmTitle, t.deleteConfirmBody, [
        { text: t.cancel, style: "cancel" },
        { text: t.del, style: "destructive", onPress: del },
      ]);
    },
  };

  // ---------- states driven by the backend ----------
  let view;
  if (c === undefined) {
    view = { back: onHome, body: <Center label={t.loading} /> };
  } else if (c === null) {
    view = { back: onHome, body: <H1>{t.gone}</H1>, primary: { label: t.home, onPress: onHome } };
  } else if (status === "error") {
    const notBill = /NOT_A_BILL/.test(c.error || "");
    const retake = /RETAKE/.test(c.error || "");
    const outside = /OUT_OF_STATE/.test(c.error || "");
    const plain = (c.error || "").replace(/^(Error:\s*)?[A-Z_]{4,}:\s*/, "");
    view = {
      back: onHome,
      body: (
        <>
          <H1>{notBill ? t.notABill : retake ? t.retakeTitle : outside ? t.outOfStateTitle : t.errorTitle}</H1>
          {(notBill || retake) && c.fileUrl && (c.fileType || "image/").startsWith("image/") ? (
            <View style={bad.frame}>
              <Image source={{ uri: c.fileUrl }} style={bad.img} resizeMode="cover" accessibilityLabel={t.invalidDoc} />
              <View style={bad.bar} accessibilityRole="alert">
                <Text style={bad.text}>✕  {notBill ? t.invalidDoc : t.unreadableDoc}</Text>
              </View>
            </View>
          ) : null}
          <P muted>{notBill ? t.notABillBody : plain}</P>
        </>
      ),
      primary: { label: t.tryAgain, onPress: () => remove({ id, token }).catch(() => {}).finally(() => { forgetBill(id); onHome(); }) },
    };
  } else if (status === "reading" || (!page && status !== "confirm_hospital")) {
    view = { step: 1, back: onHome, body: <Reading t={t} steps={c.steps} /> };
  } else if (status === "confirm_hospital") {
    view = {
      step: 1,
      back: onHome,
      body: <HospitalPick t={t} c={c} busy={busy} onPick={(key) => run(() => confirmHospital({ id, token, key }))} />,
    };
  } else {
    view = pageView();
  }

  function pageView() {
    const h = household;
    switch (page) {
      case "found":
        return { step: 2, back: onHome, body: <Found t={t} c={c} busy={busy} err={err} onFix={(index, charge) => run(() => correctLine({ id, token, index, charge }))} />, primary: { label: t.continueQ, onPress: () => go("size") }, secondary: deleteButton };
      case "size":
        return {
          step: 3,
          back: () => go("found"),
          body: (
            <>
              <H1>{t.qSizeTitle}</H1>
              <P muted>{t.qSizeBody}</P>
              <Stepper t={t} value={h.size} onChange={(size) => setHousehold({ ...h, size })} />
            </>
          ),
          primary: { label: t.next, onPress: () => go("income") },
        };
      case "income":
        return {
          step: 3,
          back: () => go("size"),
          body: (
            <>
              <H1>{t.qIncomeTitle}</H1>
              <P muted>{t.qIncomeBody}</P>
              <MoneyInput value={h.income} onChange={(income) => setHousehold({ ...h, income })} />
            </>
          ),
          primary: { label: t.next, onPress: () => go("insured"), disabled: h.income === "" },
        };
      case "insured":
        return {
          step: 3,
          back: () => go("income"),
          body: (
            <>
              <H1>{t.qInsuredTitle}</H1>
              <P muted>{t.qInsuredBody}</P>
              {/* The coverage type: Medicare and Medi-Cal have their own billing rules. */}
              {["none", "private", "medicare", "medi-cal", "both"].map((p) => (
                <Choice key={p} label={t.plans[p]} on={h.plan === p} onPress={() => setHousehold({ ...h, plan: p, insured: p !== "none" })} />
              ))}
              {err ? <Text style={s.error}>{err}</Text> : null}
            </>
          ),
          primary:
            h.insured === true
              ? { label: t.next, onPress: () => go("oop") }
              : { label: t.seeAnswer, disabled: h.insured === null, busy, onPress: () => submit() },
        };
      case "oop":
        return {
          step: 3,
          back: () => go("insured"),
          body: (
            <>
              <H1>{t.qOopTitle}</H1>
              <P muted>{t.qOopBody}</P>
              <MoneyInput value={h.oop} onChange={(oop) => setHousehold({ ...h, oop })} />
              {err ? <Text style={s.error}>{err}</Text> : null}
            </>
          ),
          primary: { label: t.seeAnswer, disabled: h.oop === "", busy, onPress: () => submit() },
        };
      case "answer":
        return {
          step: 4,
          back: () => go(h.insured ? "oop" : "insured"),
          body: <Answer t={t} e={c.eligibility} />,
          primary:
            status === "ready" || status === "approved"
              ? {
                  label: t.seeLetters,
                  onPress: () => {
                    // Start with the name printed on the bill; the patient can change it.
                    if (!details.name && c.bill?.patientName) setDetails({ ...details, name: c.bill.patientName });
                    setLetterIndex(0);
                    go("details");
                  },
                }
              : { label: t.draftingLetters, busy: true },
        };
      case "details": {
        const d = details;
        const problems = checkDetails(d);
        const ok = !Object.keys(problems).length;
        return {
          step: 4,
          back: () => go("answer"),
          body: <DetailsForm t={t} d={d} problems={detailsTried ? problems : {}} onChange={setDetails} />,
          primary: {
            label: t.detailsDone,
            onPress: () => {
              setDetailsTried(true);
              if (!ok) return;
              AsyncStorage.setItem(DETAILS_KEY, JSON.stringify(d)).catch(() => {});
              // The letters already use the name printed on the bill; use the patient's name instead.
              const billName = (c.bill?.patientName || "").trim();
              const newName = d.name.trim();
              const rename = (txt) => (txt && billName && newName && billName !== newName ? txt.split(billName).join(newName) : txt);
              setDrafts(
                // Start from the letters as written, so changing a detail twice still works.
                (c.letters || drafts || []).map((l) =>
                  fillLetter({ ...l, subject: rename(l.subject), body: rename(l.body), bodyPatient: rename(l.bodyPatient), subjectPatient: rename(l.subjectPatient) }, d),
                ),
              );
              setLetterIndex(0);
              go("letter");
            },
          },
        };
      }
      case "letter": {
        const list = drafts || [];
        const i = Math.min(letterIndex, Math.max(0, list.length - 1));
        const last = i >= list.length - 1;
        return {
          step: 4,
          back: () => (i > 0 ? setLetterIndex(i - 1) : go("details")),
          body: list.length ? (
            <LetterEditor
              key={i}
              t={t}
              es={c.lang === "es"}
              index={i}
              count={list.length}
              letter={list[i]}
              onChange={(l) => setDrafts(list.map((x, j) => (j === i ? l : x)))}
              err={err}
            />
          ) : (
            <Center label={t.draftingLetters} />
          ),
          primary: last
            ? {
                label: t.approve,
                busy,
                disabled: !list.length,
                onPress: () =>
                  run(() =>
                    approve({
                      id,
                      token,
                      requireFilled: true,
                      letters: list.map((l) => clean({ kind: l.kind, title: l.title, subject: l.subject, body: l.body, subjectPatient: l.subjectPatient, bodyPatient: l.bodyPatient })),
                    }),
                  ),
              }
            : { label: t.nextLetter, onPress: () => setLetterIndex(i + 1) },
        };
      }
      case "done":
        return {
          back: onHome,
          body: <Done t={t} c={c} id={id} token={token} letters={drafts || c.letters || []} />,
          primary: { label: t.changeLetters, busy, onPress: () => run(() => unapprove({ id, token })) },
          secondary: deleteButton,
        };
      default:
        return { step: 1, back: onHome, body: <Reading t={t} steps={c.steps} /> };
    }
  }

  function submit() {
    const h = household;
    return run(async () => {
      await submitHousehold({
        id,
        token,
        size: h.size,
        annualIncome: Number(h.income || 0),
        insured: !!h.insured,
        ...(h.plan ? { coverage: h.plan } : {}),
        ...(h.insured ? { outOfPocket12mo: Number(h.oop || 0) } : {}),
      });
      setPage("answer");
    });
  }

  useEffect(() => {
    backRef.current = view.back;
  });

  return (
    <Screen t={t} step={view.step} onBack={view.back} primary={view.primary} secondary={view.secondary}>
      {view.body}
    </Screen>
  );
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

function Center({ label }) {
  return (
    <View style={{ paddingVertical: 60, alignItems: "center" }}>
      <ActivityIndicator size="large" color={C.brand} />
      <P muted style={{ marginTop: 16 }}>{label}</P>
    </View>
  );
}

// ---------- 1. Reading ----------
function Reading({ t, steps }) {
  return (
    <>
      <H1>{t.readingTitle}</H1>
      <P muted>{t.readingBody}</P>
      <View style={{ marginTop: 10 }}>
        {(steps || []).length === 0 ? (
          <StepRow state="running" label={t.waiting} />
        ) : (
          steps.map((st) => <StepRow key={st.key} state={st.state} label={st.label} detail={st.detail} />)
        )}
      </View>
    </>
  );
}

function StepRow({ state, label, detail }) {
  const mark = { done: "✓", warn: "!", error: "×" }[state];
  return (
    <View style={x.stepRow}>
      <View style={[x.stepMark, state === "done" && x.stepDone, (state === "warn" || state === "error") && x.stepWarn]}>
        {state === "running" ? (
          <ActivityIndicator size="small" color={C.brand} />
        ) : state === "done" ? (
          <Tick />
        ) : (
          <Text style={[x.stepMarkText, (state === "warn" || state === "error") && { color: C.flagInk }]}>{mark}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={x.stepLabel}>{label}</Text>
        {detail ? <Text style={x.stepDetail} numberOfLines={3}>{detail}</Text> : null}
      </View>
    </View>
  );
}

function Tick({ color = C.brand, size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5 L10 17.5 L19 7" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ---------- 1b. Which hospital ----------
function HospitalPick({ t, c, busy, onPick }) {
  const [q, setQ] = useState("");
  const results = useQuery(api.cases.searchHospitals, q.trim().length >= 2 ? { q } : "skip");
  const list = q.trim().length >= 2 ? results || [] : c.hospitalCandidates || [];
  return (
    <>
      <H1>{t.hospitalTitle}</H1>
      <P muted>{t.hospitalBody}</P>
      {c.bill?.hospitalName ? <P>{t.onBill}: {c.bill.hospitalName}</P> : null}
      <TextInput style={[s.input, { marginBottom: 14 }]} value={q} onChangeText={setQ} placeholder={t.searchPlaceholder} placeholderTextColor={C.ink2} autoCorrect={false} />
      {list.map((h) => (
        <Pressable key={h.key} disabled={busy} onPress={() => onPick(h.key)} accessibilityRole="button">
          {({ pressed }) => (
            <Card style={[{ paddingVertical: 16, marginBottom: 10 }, pressed && x.cardPressed]}>
              <Text style={x.hName}>{h.name}</Text>
              {h.city ? <Text style={x.hCity}>{h.city}</Text> : null}
            </Card>
          )}
        </Pressable>
      ))}
      <Button kind="secondary" label={t.notListed} disabled={busy} onPress={() => onPick(null)} />
    </>
  );
}

// ---------- 2. What we found ----------
function Found({ t, c, busy, err, onFix }) {
  const findings = c.findings || [];
  const policy = c.policyFindings || [];
  const lines = c.bill?.lines || [];
  const checks = (c.bill?.amountChecks || []).filter((k) => lines[k.index]);
  // Notes about amounts we're already asking about would say the same thing twice.
  const unreadable = (c.bill?.unreadable || []).filter((u) => !checks.length || !/second look|segunda lectura/i.test(u));
  return (
    <>
      <H1>{t.foundTitle}</H1>
      {err ? <Text style={s.error}>{err}</Text> : null}
      {checks.map((k) => (
        <Card key={"check" + k.index} style={{ borderColor: C.flag }}>
          <H2>{t.whichAmount}</H2>
          <P>{t.whichAmountBody(lines[k.index].description || lines[k.index].code || "", money(k.first), money(k.second))}</P>
          <Button label={money(k.first)} busy={busy} onPress={() => onFix(k.index, k.first)} />
          <View style={{ height: 10 }} />
          <Button kind="secondary" label={money(k.second)} disabled={busy} onPress={() => onFix(k.index, k.second)} />
        </Card>
      ))}
      <Card style={{ backgroundColor: C.bg2 }}>
        <Text style={s.label}>{t.billFrom}</Text>
        <Text style={x.hName}>{c.hospital?.name || c.bill?.hospitalName || t.noName}</Text>
        <View style={x.totals}>
          {c.bill?.totalCharges != null ? <Kv k={t.totalCharges} v={money(c.bill.totalCharges)} /> : null}
          {c.bill?.amountDue != null ? <Kv k={t.amountDue} v={money(c.bill.amountDue)} /> : null}
        </View>
      </Card>

      {findings.length === 0 ? <P>{t.foundNone}</P> : null}
      {findings.map((f, i) => (
        <Card key={f.id || i}>
          <View style={x.flagTag}>
            <View style={x.flagDot} />
            <Text style={x.flagTagText}>{t.findingOf(i + 1, findings.length)}</Text>
          </View>
          <H2>{f.title}</H2>
          {(f.evidence || []).map((ev, j) => (
            <View key={j} style={x.evRow}>
              <Text style={x.evLabel}>{ev.label}</Text>
              <Text style={x.evValue}>{ev.value}</Text>
            </View>
          ))}
          {f.amount > 0 ? (
            <View style={x.saved}>
              <Text style={x.saveText}>{t.couldSave(money(f.amount))}</Text>
            </View>
          ) : null}
          <P style={{ marginTop: 6, marginBottom: 0 }}>{f.detail}</P>
          {f.evidence?.find((ev) => /^https?:/.test(ev.source || "")) ? (
            <LinkText label={t.source} onPress={() => openUrl(f.evidence.find((ev) => /^https?:/.test(ev.source || "")).source)} />
          ) : null}
        </Card>
      ))}

      {policy.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <H2>{t.policyTitle}</H2>
          {policy.map((p, i) => (
            <Card key={i} style={p.verdict === "ask" ? null : { borderColor: C.flag }}>
              <Text style={[x.badge, p.verdict !== "ask" && x.badgeFlag]}>{p.verdict === "ask" ? t.worthAsking : t.headsUp}</Text>
              <P>{p.explanation}</P>
              {p.quote ? <Text style={x.quote}>{"“" + p.quote + "”"}</Text> : null}
            </Card>
          ))}
        </View>
      )}

      <LineFixer t={t} lines={lines} busy={busy} onFix={onFix} />

      {unreadable.length > 0 && (
        <Card style={{ marginTop: 10 }}>
          <H2>{t.doubleCheck}</H2>
          <P muted>{t.doubleCheckBody}</P>
          {unreadable.map((u, i) => (
            <P key={i}>{"• " + u}</P>
          ))}
        </Card>
      )}
    </>
  );
}

const Kv = ({ k, v }) => (
  <View style={{ marginRight: 24 }}>
    <Text style={x.evLabel}>{k}</Text>
    <Text style={x.kvValue}>{v}</Text>
  </View>
);

// ---------- 3. Questions ----------
function Stepper({ t, value, onChange }) {
  return (
    <View style={x.stepper}>
      <Pressable style={({ pressed }) => [x.stepBtn, pressed && x.stepBtnPressed]} onPress={() => onChange(Math.max(1, value - 1))} accessibilityLabel={t.minus} accessibilityRole="button">
        <Text style={x.stepBtnText}>{"−"}</Text>
      </Pressable>
      <View style={{ alignItems: "center", flex: 1 }}>
        <Text style={x.stepValue}>{value}</Text>
        <Text style={x.hCity}>{t.people(value)}</Text>
      </View>
      <Pressable style={({ pressed }) => [x.stepBtn, pressed && x.stepBtnPressed]} onPress={() => onChange(Math.min(20, value + 1))} accessibilityLabel={t.plus} accessibilityRole="button">
        <Text style={x.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

/** "Is an amount wrong?": every line we read, each with a Fix button. */
function LineFixer({ t, lines, busy, onFix }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [value, setValue] = useState("");
  if (!lines.length) return null;
  if (!open) return <LinkText label={t.checkLines} onPress={() => setOpen(true)} />;
  return (
    <Card style={{ marginTop: 10 }}>
      <H2>{t.linesTitle}</H2>
      <P muted>{t.linesBody}</P>
      {lines.map((l, i) => (
        <View key={i} style={x.evRow}>
          <Text style={[x.evLabel, { flex: 1 }]}>{l.description || l.code}</Text>
          {editing === i ? (
            <View style={{ alignItems: "flex-end" }}>
              <TextInput
                style={[s.input, { minWidth: 120, textAlign: "right" }]}
                value={value}
                onChangeText={(v) => setValue(v.replace(/[^0-9.]/g, "").slice(0, 10))}
                keyboardType="decimal-pad"
                autoFocus
                accessibilityLabel={t.linesTitle}
              />
              <LinkText
                label={t.save}
                onPress={() => {
                  const n = Number(value);
                  if (value === "" || !Number.isFinite(n)) return;
                  onFix(i, Math.round(n * 100) / 100);
                  setEditing(null);
                }}
              />
            </View>
          ) : (
            <Pressable
              disabled={busy}
              onPress={() => { setEditing(i); setValue(String(l.charge)); }}
              accessibilityRole="button"
              accessibilityLabel={t.fixAmount + " " + (l.description || "")}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={x.evValue}>{money(l.charge) + "  ✎"}</Text>
            </Pressable>
          )}
        </View>
      ))}
    </Card>
  );
}

function DetailsForm({ t, d, problems, onChange }) {
  const field = (key, label, props = {}) => (
    <View style={{ marginBottom: 12 }} key={key}>
      <Text style={x.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, problems[key] && { borderColor: C.flag }]}
        value={d[key]}
        onChangeText={(v) => onChange({ ...d, [key]: v })}
        accessibilityLabel={label}
        {...props}
      />
      {problems[key] ? <Text style={s.error}>{problems[key] === "bad" ? t.detailsBad[key] : t.detailsMissing}</Text> : null}
    </View>
  );
  return (
    <>
      <H1>{t.detailsTitle}</H1>
      <P muted>{t.detailsBody}</P>
      {field("name", t.dName, { autoComplete: "name", textContentType: "name" })}
      {field("street", t.dStreet, { autoComplete: "street-address", textContentType: "streetAddressLine1" })}
      {field("city", t.dCity, { textContentType: "addressCity" })}
      {field("zip", t.dZip, { keyboardType: "number-pad", autoComplete: "postal-code", textContentType: "postalCode", maxLength: 10 })}
      {field("phone", t.dPhone, { keyboardType: "phone-pad", autoComplete: "tel", textContentType: "telephoneNumber" })}
    </>
  );
}

function MoneyInput({ value, onChange }) {
  const shown = value === "" ? "" : Number(value).toLocaleString("en-US");
  return (
    <View style={x.moneyRow}>
      <Text style={x.dollar}>$</Text>
      <TextInput
        style={[s.input, x.moneyInput]}
        value={shown}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "").slice(0, 9))}
        keyboardType="number-pad"
        autoFocus
        placeholder="0"
        placeholderTextColor="#958cad"
      />
    </View>
  );
}

function Choice({ label, on, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [x.choice, pressed && !on && x.choicePressed, on && x.choiceOn, pressed && { transform: [{ translateY: 1 }] }]}
    >
      <View style={[x.radio, on && x.radioOn]}>{on ? <View style={x.radioDot} /> : null}</View>
      <Text style={x.choiceText}>{label}</Text>
    </Pressable>
  );
}

// ---------- 4. Answer ----------
function Answer({ t, e }) {
  if (!e) return <Center label={t.loading} />;
  return (
    <>
      {e.tier === "FREE" || e.tier === "DISCOUNT" ? <OkBadge /> : null}
      <Text style={s.label}>{t.answerTitle}</Text>
      <Text style={[x.headline, (e.tier === "FREE" || e.tier === "DISCOUNT") && { color: C.greenInk }]}>{e.headline}</Text>
      {typeof e.fplPct === "number" ? <P>{t.fpl(Math.round(e.fplPct))}</P> : null}
      {e.medicalLikely ? (
        <Card style={{ backgroundColor: C.brandTint, borderColor: C.brandTint }}>
          <P style={{ marginBottom: 0 }}>{t.medical}</P>
        </Card>
      ) : null}
      {(e.basis || []).length > 0 && (
        <View style={{ marginTop: 8 }}>
          <H2>{t.why}</H2>
          {e.basis.map((b, i) => (
            <Card key={i}>
              <P style={{ marginBottom: 0 }}>{b.text}</P>
              {b.source ? <LinkText label={t.source} onPress={() => openUrl(b.source)} /> : null}
            </Card>
          ))}
        </View>
      )}
    </>
  );
}

function OkBadge() {
  return (
    <View style={{ marginBottom: 10 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={60} height={60} viewBox="0 0 64 64" fill="none">
        <Circle cx={32} cy={32} r={29} fill={C.greenTint} stroke={C.greenDeep} strokeWidth={3} />
        <Path d="M19 33 L28 42 L45 23" stroke={C.greenDeep} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

// ---------- 4b. Letters ----------
function LetterEditor({ t, es, index, count, letter, onChange, err }) {
  const [copied, setCopied] = useState(false);
  const text = `${letter.subject}\n\n${letter.body}`;
  return (
    <>
      <Text style={x.count}>{t.letterOf(index + 1, count)}</Text>
      <H1>{letter.title}</H1>
      <P muted>{t.editHint}</P>
      <Text style={s.label}>{t.subject}</Text>
      <TextInput style={[s.input, { marginBottom: 14, minHeight: 88 }]} value={letter.subject} onChangeText={(subject) => onChange({ ...letter, subject })} multiline />
      <TextInput
        style={[s.input, x.letterBody]}
        value={letter.body}
        onChangeText={(body) => onChange({ ...letter, body })}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
      />
      <View style={x.row}>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" label={t.share} onPress={() => Share.share({ title: letter.subject, message: text }).catch(() => {})} />
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <Button
            kind="secondary"
            label={copied ? t.copied : t.copy}
            onPress={async () => {
              await Clipboard.setStringAsync(text);
              setCopied(true);
            }}
          />
        </View>
      </View>
      {es && letter.bodyPatient ? (
        <Card style={{ marginTop: 18 }}>
          <H2>{t.patientCopy}</H2>
          {letter.subjectPatient ? <P style={{ fontFamily: F.body600 }}>{letter.subjectPatient}</P> : null}
          <P style={{ marginBottom: 0 }}>{letter.bodyPatient}</P>
        </Card>
      ) : null}
      {err ? <Text style={s.error}>{err}</Text> : null}
    </>
  );
}

// ---------- 5. Done ----------
// The follow-up (check-in day, complaint to the state) lives in the web app for now.
const WEB = "https://recount-nu.vercel.app";
const HCAI_COMPLAINT_URL = "https://hcai.ca.gov/affordability/hospital-fair-billing-program/hospital-bill-complaint-program/";

function Done({ t, c, id, token, letters }) {
  const billing = c.bill?.billingPhone;
  const assist = c.hospital?.fap?.phone;
  const tel = (p) => openUrl("tel:" + p.replace(/[^0-9+]/g, ""));
  return (
    <>
      <OkBadge />
      <H1>{t.doneTitle}</H1>
      <P>{t.doneBody}</P>
      <View style={{ height: 8 }} />
      <H2>{t.howToSend}</H2>
      {billing ? <Button kind="secondary" label={t.callBilling(billing)} onPress={() => tel(billing)} /> : null}
      {assist && assist !== billing ? (
        <View style={{ marginTop: 10 }}>
          <Button kind="secondary" label={t.callAssist(assist)} onPress={() => tel(assist)} />
        </View>
      ) : null}
      <View style={{ marginTop: 14 }}>
        {letters.map((l, i) => (
          <View key={i}>
            <LinkText label={t.shareLetter(l.title)} onPress={() => Share.share({ title: l.subject, message: `${l.subject}\n\n${l.body}` }).catch(() => {})} />
            <LinkText
              label={`${t.sendEmail}: ${l.title}`}
              onPress={() => openUrl(`mailto:?subject=${encodeURIComponent(l.subject)}&body=${encodeURIComponent(l.body)}`)}
            />
          </View>
        ))}
      </View>
      <P muted style={{ marginTop: 10 }}>{t.sendMail}</P>
      {c.hospital?.fap?.applicationUrl ? <LinkText label={c.hospital.fap.applicationUrl} onPress={() => openUrl(c.hospital.fap.applicationUrl)} /> : null}
      <View style={{ height: 18 }} />
      <H2>{t.afterTitle}</H2>
      <P>{t.afterBody}</P>
      <Button kind="secondary" label={t.afterOpen} onPress={() => openUrl(`${WEB}/case/${id}#t=${token}&s=after`)} />
      <LinkText label={t.afterHcai} onPress={() => openUrl(HCAI_COMPLAINT_URL)} />
    </>
  );
}

const x = StyleSheet.create({
  fieldLabel: { fontFamily: F.body500, fontSize: 17, color: C.ink, marginBottom: 6 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  stepMark: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.bg2, alignItems: "center", justifyContent: "center", marginRight: 14 },
  stepDone: { backgroundColor: C.brandTint },
  stepWarn: { backgroundColor: C.flagTint },
  stepMarkText: { fontFamily: F.display800, color: C.ink, fontSize: 17 },
  stepLabel: { fontFamily: F.body500, fontSize: 18, color: C.ink, lineHeight: 26 },
  stepDetail: { fontFamily: F.body, fontSize: 16, color: C.ink2, marginTop: 3, lineHeight: 23 },
  cardPressed: { backgroundColor: C.bg2, borderColor: C.brand, transform: [{ translateY: 1 }] },
  hName: { fontFamily: F.display700, fontSize: 20, lineHeight: 26, color: C.ink },
  hCity: { fontFamily: F.body, fontSize: 16, color: C.ink2, marginTop: 2 },
  totals: { flexDirection: "row", marginTop: 14 },
  kvValue: { fontFamily: F.display800, fontSize: 24, lineHeight: 30, color: C.ink, marginTop: 2 },
  count: { fontFamily: F.body600, fontSize: 15, color: C.ink2, marginBottom: 6 },
  flagTag: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", backgroundColor: C.flagTint, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 10 },
  flagDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.flag, marginRight: 8 },
  flagTagText: { fontFamily: F.body600, fontSize: 14, color: C.flagInk },
  evRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 40, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  evLabel: { fontFamily: F.body, fontSize: 16, lineHeight: 22, color: C.ink2, flex: 1, paddingRight: 10 },
  evValue: { fontFamily: F.body600, fontSize: 17, color: C.ink },
  saved: { backgroundColor: C.greenTint, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginTop: 14, marginBottom: 6 },
  saveText: { fontFamily: F.display800, fontSize: 24, lineHeight: 30, color: C.greenInk },
  badge: { fontFamily: F.body600, fontSize: 14, textTransform: "uppercase", letterSpacing: 0.8, color: C.brand, backgroundColor: C.brandTint, alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 10, overflow: "hidden" },
  badgeFlag: { color: C.flagInk, backgroundColor: C.flagTint },
  quote: { fontFamily: F.body, fontSize: 17, fontStyle: "italic", color: C.ink2, lineHeight: 25, borderLeftWidth: 3, borderLeftColor: C.lilac, paddingLeft: 12 },
  stepper: { flexDirection: "row", alignItems: "center", marginTop: 28 },
  stepBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center", backgroundColor: C.bg2 },
  stepBtnPressed: { backgroundColor: C.brandTint, borderColor: C.brand, transform: [{ scale: 0.94 }] },
  stepBtnText: { fontFamily: F.body500, fontSize: 34, color: C.brand, lineHeight: 40 },
  stepValue: { fontFamily: F.display800, fontSize: 56, lineHeight: 64, color: C.ink },
  moneyRow: { flexDirection: "row", alignItems: "center", marginTop: 20 },
  dollar: { fontFamily: F.display800, fontSize: 32, color: C.ink2, marginRight: 10 },
  moneyInput: { flex: 1, minWidth: 0, width: "100%", fontFamily: F.display800, fontSize: 30 },
  choice: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: C.line, backgroundColor: C.surface, borderRadius: 16, padding: 20, minHeight: 68, marginTop: 12 },
  choicePressed: { backgroundColor: C.bg2 },
  choiceOn: { borderColor: C.brand, borderWidth: 2, backgroundColor: C.brandTint },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: C.ink2, marginRight: 16, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: C.brand, backgroundColor: C.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.onBrand },
  choiceText: { fontFamily: F.body600, fontSize: 21, color: C.ink },
  headline: { fontFamily: F.display800, fontSize: 29, lineHeight: 36, letterSpacing: -0.4, color: C.ink, marginBottom: 12 },
  letterBody: { minHeight: 320, fontSize: 17, lineHeight: 25 },
  row: { flexDirection: "row", marginTop: 14 },
});

// A rejected photo: red frame and a red label under it.
const bad = StyleSheet.create({
  frame: { borderWidth: 2, borderColor: C.flag, borderRadius: 12, overflow: "hidden", marginVertical: 14, backgroundColor: "#fff" },
  img: { width: "100%", height: 200, opacity: 0.85 },
  bar: { backgroundColor: C.flag, paddingVertical: 9, paddingHorizontal: 12 },
  text: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
