// "My bills": the case id and its secret token live only on this phone.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "recount.myBills.v1";

export async function loadBills() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function save(list) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or unavailable: the bill still works for this session.
  }
}

export async function rememberBill(bill) {
  const list = (await loadBills()).filter((b) => b.id !== bill.id);
  list.unshift({ hospitalName: null, createdAt: Date.now(), ...bill });
  await save(list.slice(0, 30));
}

export async function updateBill(id, fields) {
  const list = await loadBills();
  const i = list.findIndex((b) => b.id === id);
  if (i < 0) return;
  const next = { ...list[i], ...fields };
  if (JSON.stringify(next) === JSON.stringify(list[i])) return;
  list[i] = next;
  await save(list);
}

export async function forgetBill(id) {
  await save((await loadBills()).filter((b) => b.id !== id));
}
