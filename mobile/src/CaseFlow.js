import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { money } from "./strings";
import { forgetBill, updateBill } from "./myBills";
import { Button, C, Card, H1, H2, LinkText, P, Screen, openUrl, s } from "./ui";

const api = anyApi;
const QUESTION_PAGES = ["found", "size", "income", "insured", "oop"];

export function CaseFlow({ t, id, token, onHome }) {
  const c = useQuery(api.cases.get, { id, token });
  const status = c?.status;
  const [page, setPage] = useState(null);
  const [letterIndex, setLetterIndex] = useState(0);
  const [household, setHousehold] = useState({ size: 1, income: "", insured: null, oop: "" });
  const [drafts, setDrafts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [seenStatus, setSeenStatus] = useState(null);
  const [draftsKey, setDraftsKey] = useState("");

  const confirmHospital = useMutation(api.cases.confirmHospital);
  const submitHousehold = useMutation(api.cases.submitHousehold);
  const approve = useMutation(api.cases.approve);
  const unapprove = useMutation(api.cases.unapprove);
  const remove = useMutation(api.cases.remove);

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
      setErr(String(typeof e?.data === "string" ? e.data : e?.message || e).replace(/^.*Uncaught (Convex)?Error:\s*/s, "").split("\n")[0].replace(/^FILL_IN:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  const go = (p) => {
    setErr(null);
    setPage(p);
  };

  // ---------- states driven by the backend ----------
  let view;
  if (c === undefined) {
    view = { back: onHome, body: <Center label={t.loading} /> };
  } else if (c === null) {
    view = { back: onHome, body: <H1>{t.gone}</H1>, primary: { label: t.home, onPress: onHome } };
  } else if (status === "error") {
    const notBill = /NOT_A_BILL/.test(c.error || "");
    view = {
      back: onHome,
      body: (
        <>
          <H1>{notBill ? t.notABill : t.errorTitle}</H1>
          <P muted>{notBill ? t.notABillBody : c.error}</P>
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
        return { step: 2, back: onHome, body: <Found t={t} c={c} />, primary: { label: t.continueQ, onPress: () => go("size") } };
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
              <Choice label={t.yes} on={h.insured === true} onPress={() => setHousehold({ ...h, insured: true })} />
              <Choice label={t.no} on={h.insured === false} onPress={() => setHousehold({ ...h, insured: false })} />
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
              ? { label: t.seeLetters, onPress: () => { setLetterIndex(0); go("letter"); } }
              : { label: t.draftingLetters, busy: true },
        };
      case "letter": {
        const list = drafts || [];
        const i = Math.min(letterIndex, Math.max(0, list.length - 1));
        const last = i >= list.length - 1;
        return {
          step: 4,
          back: () => (i > 0 ? setLetterIndex(i - 1) : go("answer")),
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
          body: <Done t={t} c={c} letters={drafts || c.letters || []} />,
          primary: { label: t.changeLetters, busy, onPress: () => run(() => unapprove({ id, token })) },
          secondary: {
            label: t.deleteBill,
            onPress: () =>
              Alert.alert(t.deleteConfirmTitle, t.deleteConfirmBody, [
                { text: t.cancel, style: "cancel" },
                {
                  text: t.del,
                  style: "destructive",
                  onPress: () => run(async () => { await remove({ id, token }); await forgetBill(id); onHome(); }),
                },
              ]),
          },
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
      <ActivityIndicator size="large" color={C.ink} />
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
        {state === "running" ? <ActivityIndicator size="small" color={C.ink} /> : <Text style={x.stepMarkText}>{mark}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={x.stepLabel}>{label}</Text>
        {detail ? <Text style={x.stepDetail} numberOfLines={3}>{detail}</Text> : null}
      </View>
    </View>
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
      <TextInput style={[s.input, { marginBottom: 14 }]} value={q} onChangeText={setQ} placeholder={t.searchPlaceholder} placeholderTextColor={C.muted} autoCorrect={false} />
      {list.map((h) => (
        <Pressable key={h.key} disabled={busy} onPress={() => onPick(h.key)} accessibilityRole="button">
          {({ pressed }) => (
            <Card style={[{ paddingVertical: 14, marginBottom: 10 }, pressed && { opacity: 0.7 }]}>
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
function Found({ t, c }) {
  const findings = c.findings || [];
  const policy = c.policyFindings || [];
  const unreadable = c.bill?.unreadable || [];
  return (
    <>
      <H1>{t.foundTitle}</H1>
      <Card style={{ backgroundColor: "transparent" }}>
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
          <Text style={x.count}>{t.findingOf(i + 1, findings.length)}</Text>
          <H2>{f.title}</H2>
          {(f.evidence || []).map((ev, j) => (
            <View key={j} style={x.evRow}>
              <Text style={x.evLabel}>{ev.label}</Text>
              <Text style={x.evValue}>{ev.value}</Text>
            </View>
          ))}
          {f.amount > 0 ? <Text style={x.save}>{t.couldSave(money(f.amount))}</Text> : null}
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
            <Card key={i} style={p.verdict === "ask" ? null : { borderColor: C.red }}>
              <Text style={[x.badge, p.verdict !== "ask" && { color: C.red }]}>{p.verdict === "ask" ? t.worthAsking : t.headsUp}</Text>
              <P>{p.explanation}</P>
              {p.quote ? <Text style={x.quote}>{"“" + p.quote + "”"}</Text> : null}
            </Card>
          ))}
        </View>
      )}

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
      <Pressable style={x.stepBtn} onPress={() => onChange(Math.max(1, value - 1))} accessibilityLabel={t.minus} accessibilityRole="button">
        <Text style={x.stepBtnText}>{"−"}</Text>
      </Pressable>
      <View style={{ alignItems: "center", flex: 1 }}>
        <Text style={x.stepValue}>{value}</Text>
        <Text style={x.hCity}>{t.people(value)}</Text>
      </View>
      <Pressable style={x.stepBtn} onPress={() => onChange(Math.min(20, value + 1))} accessibilityLabel={t.plus} accessibilityRole="button">
        <Text style={x.stepBtnText}>+</Text>
      </Pressable>
    </View>
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
        placeholderTextColor={C.disabled}
      />
    </View>
  );
}

function Choice({ label, on, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[x.choice, on && x.choiceOn]}>
      <View style={[x.radio, on && x.radioOn]} />
      <Text style={x.choiceText}>{label}</Text>
    </Pressable>
  );
}

// ---------- 4. Answer ----------
function Answer({ t, e }) {
  if (!e) return <Center label={t.loading} />;
  return (
    <>
      <Text style={s.label}>{t.answerTitle}</Text>
      <Text style={x.headline}>{e.headline}</Text>
      {typeof e.fplPct === "number" ? <P>{t.fpl(Math.round(e.fplPct))}</P> : null}
      {e.medicalLikely ? (
        <Card style={{ borderColor: C.ink }}>
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
      <TextInput style={[s.input, { marginBottom: 14 }]} value={letter.subject} onChangeText={(subject) => onChange({ ...letter, subject })} multiline />
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
          {letter.subjectPatient ? <P style={{ fontWeight: "700" }}>{letter.subjectPatient}</P> : null}
          <P style={{ marginBottom: 0 }}>{letter.bodyPatient}</P>
        </Card>
      ) : null}
      {err ? <Text style={s.error}>{err}</Text> : null}
    </>
  );
}

// ---------- 5. Done ----------
function Done({ t, c, letters }) {
  const billing = c.bill?.billingPhone;
  const assist = c.hospital?.fap?.phone;
  const tel = (p) => openUrl("tel:" + p.replace(/[^0-9+]/g, ""));
  return (
    <>
      <H1>{t.doneTitle}</H1>
      <P>{t.doneBody}</P>
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
    </>
  );
}

const x = StyleSheet.create({
  stepRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  stepMark: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: C.line, alignItems: "center", justifyContent: "center", marginRight: 14 },
  stepDone: { borderColor: C.ink, backgroundColor: C.ink },
  stepWarn: { borderColor: C.red, backgroundColor: C.red },
  stepMarkText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  stepLabel: { fontSize: 19, color: C.ink, lineHeight: 25 },
  stepDetail: { fontSize: 16, color: C.muted, marginTop: 3, lineHeight: 22 },
  hName: { fontSize: 20, fontWeight: "700", color: C.ink },
  hCity: { fontSize: 16, color: C.muted, marginTop: 2 },
  totals: { flexDirection: "row", marginTop: 12 },
  kvValue: { fontSize: 22, fontWeight: "700", color: C.ink },
  count: { fontSize: 15, color: C.muted, marginBottom: 4 },
  evRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  evLabel: { fontSize: 16, color: C.muted, flex: 1, paddingRight: 10 },
  evValue: { fontSize: 18, color: C.ink, fontWeight: "600" },
  save: { fontSize: 21, color: C.red, fontWeight: "800", marginTop: 12 },
  badge: { fontSize: 15, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, color: C.muted, marginBottom: 6 },
  quote: { fontSize: 17, fontStyle: "italic", color: C.muted, lineHeight: 24 },
  stepper: { flexDirection: "row", alignItems: "center", marginTop: 24 },
  stepBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: C.ink, alignItems: "center", justifyContent: "center", backgroundColor: C.card },
  stepBtnText: { fontSize: 36, color: C.ink, fontWeight: "500", lineHeight: 40 },
  stepValue: { fontSize: 56, fontWeight: "800", color: C.ink },
  moneyRow: { flexDirection: "row", alignItems: "center", marginTop: 18 },
  dollar: { fontSize: 32, fontWeight: "700", color: C.ink, marginRight: 10 },
  moneyInput: { flex: 1, fontSize: 30, fontWeight: "700" },
  choice: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card, borderRadius: 14, padding: 20, marginTop: 12 },
  choiceOn: { borderColor: C.ink, borderWidth: 2.5 },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: C.muted, marginRight: 16 },
  radioOn: { borderColor: C.red, borderWidth: 8 },
  choiceText: { fontSize: 22, fontWeight: "600", color: C.ink },
  headline: { fontFamily: undefined, fontSize: 30, lineHeight: 38, fontWeight: "800", color: C.ink, marginBottom: 12 },
  letterBody: { minHeight: 320, fontSize: 17, lineHeight: 24 },
  row: { flexDirection: "row", marginTop: 14 },
});
