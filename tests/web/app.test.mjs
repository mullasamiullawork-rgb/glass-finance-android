// Web layer tests: loads every module in a simulated browser, seeds demo data, renders every screen,
// and runs the in-app self-test (calculations, transfers, recurring, bills, INR formatting, statement CSV).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

function boot(storage = {}) {
  const html = readFileSync("web/index.template.html", "utf8").replace("<!--SCRIPTS-->", "");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://localhost/", pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w, "crypto", { value: globalThis.crypto, configurable: true });
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.print = () => {};
  const mods = JSON.parse(readFileSync("web/modules.json", "utf8")).filter((m) => m !== "capacitor-core.js");
  for (const m of mods) w.eval(readFileSync("web/src/" + m, "utf8"));
  return w;
}
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test("boots, seeds sample data and renders every screen without errors", async () => {
  const w = boot(); await tick();
  const GF = w.GF;
  assert.ok(GF.store.data.transactions.length > 50, "sample transactions seeded");
  assert.ok(GF.store.hasSample());
  for (const name of ["home", "tx", "budget", "analytics", "more", "accounts", "goals", "savings", "bills", "recurring", "insights", "assistant", "search", "settings", "auto", "autotx"]) {
    w.location.hash = "#/" + name; GF.render();
    assert.ok(w.document.getElementById("view").innerHTML.length > 100, name + " rendered");
    assert.ok(!/coming in the next update/.test(w.document.getElementById("view").innerHTML), name + " is not a placeholder");
  }
});

test("in-app self-test passes", async () => {
  const w = boot(); await tick();
  const r = w.GF.selfTest();
  const failed = JSON.parse(JSON.stringify(r.filter((x) => !x[1]).map((x) => x[0])));
  assert.equal(r.length >= 12, true);
  assert.deepEqual(failed, []);
});

test("transfers never count as income or expense; balances add up", async () => {
  const w = boot(); await tick();
  const { GF } = w, C = GF.calc, d = GF.store.data;
  const before = C.totals(d.transactions), total0 = C.totalBalance(d);
  GF.store.upsert("transactions", { type: "transfer", amount: 100000, accountId: "acc_sbi", toAccountId: "acc_cash", dateTime: GF.D.isoDT(new Date()), categoryId: null });
  const after = C.totals(d.transactions);
  assert.equal(after.income, before.income); assert.equal(after.expense, before.expense);
  assert.equal(C.totalBalance(d), total0);
});

test("data persists across restart (localStorage) and clear sample works", async () => {
  const w = boot(); await tick();
  w.GF.store.upsert("accounts", { id: "acc_mine", name: "My Wallet", type: "cash", icon: "💵", color: "#10b981", opening: 0, archived: false });
  w.GF.store.upsert("transactions", { type: "expense", amount: 4200, accountId: "acc_mine", categoryId: "cat_food", dateTime: "2026-11-20T10:00", merchant: "Persist Test" });
  const saved = w.localStorage.getItem("glassfinance.v1");
  const w2 = boot({ "glassfinance.v1": saved }); await tick();
  assert.ok(w2.GF.store.data.transactions.some((t) => t.merchant === "Persist Test"));
  w2.GF.store.clearSample();
  assert.ok(!w2.GF.store.hasSample());
  assert.ok(w2.GF.store.data.transactions.some((t) => t.merchant === "Persist Test"), "user data kept");
});

test("assistant answers only from data and separates guidance", async () => {
  const w = boot(); await tick();
  const A = w.GF.assistant;
  const a = A.answer("How much did I spend this month?"); assert.match(a.data[0], /You spent ₹/); assert.equal(a.guidance, undefined);
  const b = A.answer("Can I afford to spend ₹5,000 this week?"); assert.ok(b.data.length && b.guidance && /General guidance/.test(b.guidance[0]));
  assert.equal(A.answer("what's the weather"), null);
});

test("search finds by merchant, amount, category, account and date", async () => {
  const w = boot(); await tick();
  const { GF } = w;
  GF.store.upsert("transactions", { type: "expense", amount: 50000, accountId: "acc_paytm", categoryId: "cat_shopping", dateTime: "2026-09-05T12:00", merchant: "Amazon", paymentMethod: "UPI" });
  for (const q of ["Amazon", "₹500", "Shopping", "September 5", "UPI", "Paytm"]) assert.ok(GF.searchTx(q).some((t) => t.merchant === "Amazon"), q);
});

test("automatic records mirror into the ledger idempotently; failed/pending never count", async () => {
  const w = boot(); await tick();
  const { GF } = w;
  const base = { direction: "DEBIT", kind: "EXPENSE", counterparty: "Sri Sai Tea Stall", upiRef: "432112345678", appName: "Paytm", sources: ["UPI_APP_NOTIFICATION"], verification: "PROVISIONAL", categoryId: "cat_food", occurredAt: Date.now(), userEdited: false, deleted: false };
  GF.auto.mirror({ ...base, id: "auto_1", amountPaise: 5000, status: "SUCCESS", countsInLedger: true });
  GF.auto.mirror({ ...base, id: "auto_1", amountPaise: 5000, status: "SUCCESS", countsInLedger: true, verification: "CONFIRMED", sources: ["UPI_APP_NOTIFICATION", "BANK_SMS_NOTIFICATION"] });
  const rows = GF.store.data.transactions.filter((t) => t.id === "auto_1");
  assert.equal(rows.length, 1); assert.equal(rows[0].type, "expense"); assert.equal(rows[0].auto.verification, "CONFIRMED");
  GF.auto.mirror({ ...base, id: "auto_2", amountPaise: 9900, status: "FAILED", countsInLedger: false });
  GF.auto.mirror({ ...base, id: "auto_3", amountPaise: 9900, status: "PENDING", countsInLedger: false });
  assert.ok(!GF.store.data.transactions.some((t) => t.id === "auto_2" || t.id === "auto_3"));
  GF.auto.mirror({ ...base, id: "auto_1", amountPaise: 5000, status: "REVERSED", countsInLedger: false });
  assert.ok(!GF.store.data.transactions.some((t) => t.id === "auto_1"), "reversed payment leaves the ledger");
  GF.auto.mirror({ ...base, id: "auto_4", direction: "CREDIT", kind: "INCOME", amountPaise: 100000, status: "SUCCESS", countsInLedger: true, categoryId: "cat_received" });
  const inc = GF.store.data.transactions.find((t) => t.id === "auto_4");
  assert.equal(inc.type, "income"); assert.equal(inc.categoryId, "cat_received");
});

test("encrypted backup round-trips and rejects a wrong password", async () => {
  const w = boot(); await tick();
  const { GF } = w;
  Object.defineProperty(w, "crypto", { value: globalThis.crypto, configurable: true });
  const enc = await GF.encryptBackup({ hello: "world", n: 1 }, "secret123");
  assert.ok(!enc.includes("world"));
  assert.equal(JSON.stringify(await GF.decryptBackup(enc, "secret123")), JSON.stringify({ hello: "world", n: 1 }));
  await assert.rejects(() => GF.decryptBackup(enc, "wrong-pass"));
});

test("auto-track mirrors REFUND and incomplete TRANSFER safely", async () => {
  const w = boot(); await tick();
  const { GF } = w;
  GF.auto.mirror({ id: "auto_ref", direction: "CREDIT", kind: "REFUND", amountPaise: 25000, status: "SUCCESS", countsInLedger: true, counterparty: "Swiggy", appName: "PhonePe", sources: ["UPI_APP_NOTIFICATION"], verification: "PROVISIONAL", categoryId: "cat_refunds", occurredAt: Date.now() });
  const refTx = GF.store.data.transactions.find((t) => t.id === "auto_ref");
  assert.equal(refTx.type, "income");
  assert.equal(refTx.categoryId, "cat_refunds");

  GF.auto.mirror({ id: "auto_trf", direction: "DEBIT", kind: "TRANSFER", amountPaise: 200000, status: "SUCCESS", countsInLedger: true, counterparty: "Self", appName: "Paytm", sources: ["UPI_APP_NOTIFICATION"], verification: "PROVISIONAL", occurredAt: Date.now() });
  const trfTx = GF.store.data.transactions.find((t) => t.id === "auto_trf");
  assert.equal(trfTx.type, null);
});

test("mergeAll preserves existing records and lock resolves when no PIN is set", async () => {
  const w = boot(); await tick();
  const { GF } = w;
  await GF.lock();
  const count0 = GF.store.data.transactions.length;
  GF.store.mergeAll({ transactions: [{ id: "tx_merged_1", type: "expense", amount: 1500, accountId: "acc_cash", categoryId: "cat_food", dateTime: "2026-11-25T12:00", merchant: "Merge Chai" }] });
  assert.equal(GF.store.data.transactions.length, count0 + 1);
  assert.ok(GF.store.data.transactions.some((t) => t.id === "tx_merged_1"));
});
