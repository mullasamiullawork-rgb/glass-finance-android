/* Glass Finance — Automatic Tracking dashboard, Automatic Transactions, statement import, UPI pay, diagnostics. */
(function () {
  const GF = window.GF, D = GF.D, esc = GF.esc, $ = GF.$, $$ = GF.$$;
  const A = GF.auto;
  const AT = () => GF.native && GF.native.AutoTrack;
  const ago = (ms) => { if (!ms) return "Never"; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "Just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : D.short(D.iso(new Date(ms))) + ", " + D.time(D.isoDT(new Date(ms))); };
  const dot = (ok, warn) => `<span aria-hidden="true" style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;background:${ok ? "var(--income)" : warn ? "var(--warning, #f59e0b)" : "var(--expense)"}"></span>`;
  const toggle = (id, on, label) => `<button class="toggle" role="switch" id="${id}" aria-checked="${on}" aria-label="${label}"></button>`;
  const vBadge = (v) => `<span class="badge ${v === "BANK_VERIFIED" ? "ok" : v === "CONFIRMED" ? "ok" : "warning"}">${v === "BANK_VERIFIED" ? "✓✓ Bank-verified" : v === "CONFIRMED" ? "✓ Confirmed" : "◔ Provisional"}</span>`;

  GF.hooks.moreItems.unshift(["auto", "⚡", "Automatic Tracking", "UPI and bank alerts, recorded for you"], ["autotx", "🧾", "Automatic Transactions", "Everything detected, with sources"]);

  /* ---------- AUTOMATIC TRACKING ---------- */
  GF.screen("auto", {
    tab: "more", title: () => "Automatic Tracking",
    render() {
      if (!A.available()) return `${GF.topbar("Automatic Tracking", { back: true })}<div class="empty glass card"><div class="e">📱</div><p><b>Works in the Android app.</b></p><p class="small">Reading UPI and bank alerts needs Android's notification access, so this screen is live only in the installed Glass Finance app. You can still import a bank statement.</p><button class="btn primary" data-act="importStatement">Import bank statement (CSV)</button></div>`;
      const s = A.status;
      if (!s) { A.refreshStatus().then(() => GF.render()); return `${GF.topbar("Automatic Tracking", { back: true })}<div class="card glass"><p class="muted">Checking status…</p></div>`; }
      const upi = s.apps.filter((a) => a.kind === "UPI_APP"), sms = s.apps.filter((a) => a.kind === "SMS_APP");
      const on = s.enabled && s.notificationAccess;
      const banks = [...new Set(GF.store.data.transactions.filter((t) => t.source === "auto" && t.auto && t.auto.sources && t.auto.sources.includes("BANK_SMS_NOTIFICATION")).map((t) => t.auto.app))];
      return `${GF.topbar("Automatic Tracking", { back: true, right: `<button class="iconbtn glass" data-act="autoRefresh" aria-label="Refresh">${GF.icon("refresh") || "↻"}</button>` })}
      <section class="hero glass">
        <div class="lbl">${dot(on, s.enabled && !s.notificationAccess)}${on ? (s.listenerConnected ? "Tracking is on" : "On · waiting for Android to connect the listener") : !s.enabled ? "Tracking is off" : "Needs notification access"}</div>
        <div class="big" style="font-size:22px;line-height:1.3">${on ? "Payments you send and receive are recorded automatically." : !s.enabled ? "Turn tracking on to record UPI payments automatically." : "Allow notification access so Glass Finance can see payment alerts."}</div>
        ${!s.notificationAccess ? `<button class="btn primary block" data-act="autoAccess" style="margin-top:12px">Allow notification access</button><p class="tiny muted" style="margin-top:8px">Android → Notification access → Glass Finance. If Android says "Restricted setting", open App info → ⋮ → Allow restricted settings first.</p>` : ""}
        <div class="kpis" style="margin-top:12px"><div class="kpi"><span>Last detection</span><b>${ago(s.lastDetection)}</b></div><div class="kpi"><span>Last bank sync</span><b>${s.lastBankSync ? ago(s.lastBankSync) : "Not connected"}</b></div></div>
      </section>
      <div class="grid3" style="margin:12px 0">
        <a class="card glass" href="#/autotx/EXPENSE" style="text-decoration:none;color:inherit"><div class="small muted">↓ Expenses</div><b class="num" style="font-size:24px">${s.autoExpenses}</b></a>
        <a class="card glass" href="#/autotx/INCOME" style="text-decoration:none;color:inherit"><div class="small muted">↑ Income</div><b class="num" style="font-size:24px">${s.autoIncome}</b></a>
        <a class="card glass" href="#/autotx/REFUND" style="text-decoration:none;color:inherit"><div class="small muted">↩ Refunds</div><b class="num" style="font-size:24px">${s.refunds}</b></a>
      </div>
      <div class="list glass">
        <a class="item" href="#/autotx/REVIEW" style="text-decoration:none;color:inherit"><span class="meta"><span class="t">Awaiting verification</span><span class="s">Pending, provisional or unclassified</span></span><span class="r num">${s.awaiting}</span><span class="chev">${GF.icon("chev")}</span></a>
        <div class="item"><span class="meta"><span class="t">Duplicate notifications prevented</span><span class="s">Same payment seen from another app or bank alert</span></span><span class="r num">${s.duplicatesPrevented}</span></div>
        <button class="item" data-act="autoDiag"><span class="meta"><span class="t">Detection errors</span><span class="s">Open diagnostics</span></span><span class="r num ${s.errors ? "exp" : ""}">${s.errors}</span><span class="chev">${GF.icon("chev")}</span></button>
      </div>
      <h2 class="h2">Payment apps</h2><div class="list glass">${upi.map((a) => `<div class="item"><span class="meta"><span class="t">${esc(a.name)}</span><span class="s">${a.installed ? "Installed" : "Not installed"}${a.enabled ? " · Tracked" : " · Off"}</span></span>${toggle("app-" + a.packageName.replace(/\W/g, "_"), a.enabled, "Track " + a.name)}</div>`).join("")}</div>
      <h2 class="h2">Bank alerts</h2><div class="list glass">
        <div class="item"><span class="meta"><span class="t">Read bank SMS alerts from notifications</span><span class="s">Debit/credit alerts only. OTPs, promotions and personal messages are discarded unread. No SMS permission is used.</span></span>${toggle("at-sms", s.trackBankSms, "Bank SMS alerts")}</div>
        ${sms.filter((a) => a.installed).map((a) => `<div class="item"><span class="meta"><span class="t">${esc(a.name)}</span><span class="s">${a.enabled ? "Watched for bank alerts" : "Off"}</span></span>${toggle("app-" + a.packageName.replace(/\W/g, "_"), a.enabled, "Watch " + a.name)}</div>`).join("")}
        <div class="item"><span class="meta"><span class="t">Banks seen in alerts</span><span class="s">${banks.length ? esc(banks.join(", ")) : "None yet"}</span></span></div>
      </div>
      <h2 class="h2">Bank transaction history</h2><div class="list glass">
        <button class="item" data-act="importStatement"><span class="meta"><span class="t">Import bank statement (CSV)</span><span class="s">Download a statement from your bank app or net banking, then import. Matching payments are upgraded to Bank-verified.</span></span><span class="chev">${GF.icon("chev")}</span></button>
        <button class="item" data-act="aaInfo"><span class="meta"><span class="t">Account Aggregator sync</span><span class="s">Not connected · needs an RBI-registered FIU partner</span></span><span class="chev">${GF.icon("chev")}</span></button>
      </div>
      <h2 class="h2">Settings</h2><div class="list glass">
        <div class="item"><span class="meta"><span class="t">Automatic tracking</span><span class="s">Record verified successful payments without asking</span></span>${toggle("at-on", s.enabled, "Automatic tracking")}</div>
        <div class="item"><span class="meta"><span class="t">Automatic categories</span><span class="s">Tea shop → Food, petrol → Transport… Your corrections are remembered.</span></span>${toggle("at-cat", s.autoCategorize, "Automatic categories")}</div>
        <button class="item" data-act="autoAccount"><span class="meta"><span class="t">Default account for UPI</span><span class="s">${esc((GF.acc(GF.store.data.settings.autoAccountId) || {}).name || "Auto: first bank account")} · accounts with matching last 4 digits are used first</span></span><span class="chev">${GF.icon("chev")}</span></button>
        <button class="item" data-act="upiPay"><span class="meta"><span class="t">Pay with UPI from Glass Finance</span><span class="s">Opens your UPI app; the result is recorded as pending until confirmed</span></span><span class="chev">${GF.icon("chev")}</span></button>
        <button class="item" data-act="autoDiag"><span class="meta"><span class="t">Detection diagnostics</span><span class="s">Recent outcomes and a format tester</span></span><span class="chev">${GF.icon("chev")}</span></button>
        <button class="item" data-act="autoClear"><span class="meta"><span class="t exp">Delete automatic tracking data</span><span class="s">Removes detected records, diagnostics and learned categories</span></span></button>
      </div>
      <p class="tiny muted" style="text-align:center;margin-top:14px">All detection runs on this phone. Notification text is read only for the apps above, never stored, and never sent anywhere.</p>`;
    },
    mount(root) {
      const s = A.status; if (!s || !A.available()) return;
      const set = async (patch) => { await AT().setConfig(patch); await A.refreshStatus(); GF.haptic(); GF.render(); };
      const t = (id, fn) => { const el = $("#" + id, root); if (el) el.onclick = fn; };
      t("at-on", () => set({ enabled: !s.enabled }));
      t("at-sms", () => set({ trackBankSms: !s.trackBankSms }));
      t("at-cat", () => set({ autoCategorize: !s.autoCategorize }));
      s.apps.forEach((a) => t("app-" + a.packageName.replace(/\W/g, "_"), () => {
        const off = new Set(s.apps.filter((x) => !x.enabled && (x.kind === "UPI_APP" || s.trackBankSms)).map((x) => x.packageName));
        a.enabled ? off.add(a.packageName) : off.delete(a.packageName);
        set({ disabledApps: [...off] });
      }));
    },
  });
  GF.acts.autoAccess = () => AT() && AT().openNotificationAccess();
  GF.acts.autoRefresh = async () => { await A.sync({ full: true }); await A.refreshStatus(); GF.toast("Up to date"); GF.render(); };
  GF.acts.autoAccount = () => {
    const d = GF.store.data, live = d.accounts.filter((a) => !a.archived);
    GF.sheet({ title: "Default account for UPI", body: `<p class="small muted">Used when a payment doesn't say which account it came from. Add the last 4 digits to an account (Accounts → Edit) to match bank alerts automatically.</p>
      <div class="list glass">${live.map((a) => `<button class="item" data-pick="${a.id}"><span class="cat" style="background:${a.color}26">${a.icon}</span><span class="meta"><span class="t">${esc(a.name)}</span><span class="s">${a.mask ? "…" + esc(a.mask) : ""}</span></span>${d.settings.autoAccountId === a.id ? "✓" : ""}</button>`).join("")}</div>
      <label class="field" style="margin-top:14px"><span>Self-transfers go to (other account)</span></label><div class="chips scroll" id="tr-to">${live.map((a) => `<button class="chip" data-v="${a.id}" aria-pressed="${d.settings.autoTransferToId === a.id}">${a.icon} ${esc(a.name)}</button>`).join("")}</div>`,
      mount(sh) {
        $$("[data-pick]", sh).forEach((b) => (b.onclick = () => { d.settings.autoAccountId = b.dataset.pick; GF.closeAll(async () => { GF.store.save(); await A.sync({ full: true }); GF.toast("Default account set"); }); }));
        $$("#tr-to .chip", sh).forEach((b) => (b.onclick = () => { d.settings.autoTransferToId = b.dataset.v; $$("#tr-to .chip", sh).forEach((x) => x.setAttribute("aria-pressed", x === b)); GF.store.save(true); A.sync({ full: true }); }));
      } });
  };
  GF.acts.autoClear = async () => {
    if (!(await GF.confirm({ title: "Delete automatic tracking data?", msg: "Detected records, diagnostics and learned merchant categories are deleted from this phone. Transactions already in your ledger are removed too.", ok: "Delete", danger: true }))) return;
    await AT().clearAutoData();
    GF.store.data.transactions = GF.store.data.transactions.filter((t) => t.source !== "auto");
    GF.store.data.meta.autoSyncedAt = 0; A.items = {};
    GF.store.save(); await A.refreshStatus(); GF.toast("Automatic tracking data deleted");
  };
  GF.acts.aaInfo = () => GF.sheet({ title: "Account Aggregator", body: `<p>India's Account Aggregator network (RBI NBFC-AA, e.g. Finvu, OneMoney, CAMS Finserv, Anumati) lets you share bank transactions by consent, without passwords.</p>
    <p class="small muted">To receive data, an app must be a regulated Financial Information User (FIU) or use one, such as Setu, Finarkein or a bank's FIU sandbox. That needs a business registration, a partner contract and API keys, so it isn't connected in this build. The code has a ready provider interface for it.</p>
    <p class="small"><b>Today:</b> import your bank's statement CSV. Glass Finance never asks for net-banking passwords or UPI PINs.</p>` });

  /* ---------- AUTOMATIC TRANSACTIONS ---------- */
  let filter = "ALL";
  GF.screen("autotx", {
    tab: "more", title: () => "Automatic Transactions",
    render(param) {
      if (param) filter = param;
      if (!A.available()) return `${GF.topbar("Automatic Transactions", { back: true })}<div class="empty glass card"><p>Available in the Android app.</p></div>`;
      const items = Object.values(A.items).filter((i) => !i.deleted).sort((a, b) => b.occurredAt - a.occurredAt);
      if (!A._loaded) { A._loaded = true; A.allItems().then(() => GF.render()); }
      const F = { ALL: () => true, EXPENSE: (i) => i.kind === "EXPENSE", INCOME: (i) => i.kind === "INCOME", REFUND: (i) => i.kind === "REFUND" || i.kind === "REVERSAL", REVIEW: (i) => i.status === "PENDING" || i.verification === "PROVISIONAL" || i.kind === "UNKNOWN" || !i.countsInLedger };
      const list = items.filter(F[filter] || F.ALL);
      return `${GF.topbar("Automatic Transactions", { back: true })}
      <div class="chips scroll" style="margin-bottom:12px">${[["ALL", "All"], ["EXPENSE", "↓ Expenses"], ["INCOME", "↑ Income"], ["REFUND", "↩ Refunds"], ["REVIEW", "Needs review"]].map(([k, l]) => `<button class="chip" data-act="autoFilter" data-v="${k}" aria-pressed="${filter === k}">${l}</button>`).join("")}</div>
      ${list.length ? `<div class="list glass">${list.map((i) => {
        const inc = i.direction === "CREDIT", cat = i.categoryId ? GF.cat(i.categoryId) : { icon: "❔", color: "#94a3b8", name: "Uncategorised" };
        return `<button class="item" data-act="autoDetail" data-id="${i.id}" style="flex-wrap:wrap;row-gap:6px">${GF.catIcon(cat, inc ? "inc" : "exp")}
          <span class="meta"><span class="t">${esc(i.counterparty || (inc ? "Unknown sender" : "Unknown merchant"))}</span><span class="s">${A.KIND[i.kind]} · ${esc(cat.name)} · ${esc(i.appName)} · ${D.short(D.iso(new Date(i.occurredAt)))}, ${D.time(D.isoDT(new Date(i.occurredAt)))}</span></span>
          <span class="r amt ${inc ? "inc" : "exp"}" ${i.status !== "SUCCESS" && !(i.kind === "REVERSAL") ? 'style="text-decoration:line-through;opacity:.6"' : ""}><span class="sr">${inc ? "Received" : "Sent"} </span>${inc ? "+" : "−"}${GF.fmt(i.amountPaise)}</span>
          <span class="row" style="flex-basis:100%;gap:6px;flex-wrap:wrap">${vBadge(i.verification)}${i.status !== "SUCCESS" ? `<span class="badge ${i.status === "FAILED" ? "over" : "warning"}">${A.STATUS[i.status]}</span>` : ""}${i.upiRef ? `<span class="tiny muted">Ref ${esc(i.upiRef)}</span>` : ""}${!i.countsInLedger ? `<span class="tiny muted">Not in balances</span>` : ""}</span></button>`;
      }).join("")}</div>` : `<div class="empty glass card"><div class="e">⚡</div><p><b>Nothing here yet.</b></p><p class="small">When you pay or get paid with a tracked UPI app, or your bank sends an alert, it appears here automatically.</p></div>`}`;
    },
  });
  GF.acts.autoFilter = (el) => { filter = el.dataset.v; GF.go("#/autotx/" + filter); };
  GF.acts.autoDetail = (el) => {
    const i = A.items[el.dataset.id]; if (!i) return;
    const d = GF.store.data, inc = i.direction === "CREDIT";
    const s = { kind: i.kind, categoryId: i.categoryId, counterparty: i.counterparty || "", note: i.note || "" };
    const kinds = ["EXPENSE", "INCOME", "REFUND", "TRANSFER", "REVERSAL", "UNKNOWN"];
    const draw = () => `<div class="amountbox"><div class="v amt ${inc ? "inc" : "exp"}">${inc ? "+" : "−"}${GF.fmt(i.amountPaise, { force: true })}</div></div>
      <div class="list glass" style="margin-bottom:12px">
        <div class="item"><span class="meta"><span class="t">Status</span><span class="s">${A.STATUS[i.status]}</span></span></div>
        <div class="item"><span class="meta"><span class="t">Verification</span><span class="s">${A.VERIF[i.verification]}</span></span></div>
        <div class="item"><span class="meta"><span class="t">Detected from</span><span class="s">${i.sources.map((x) => A.SOURCE[x] || x).join(" + ")} · ${esc(i.appName)}</span></span></div>
        <div class="item"><span class="meta"><span class="t">Date and time</span><span class="s">${new Date(i.occurredAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span></span></div>
        ${i.upiRef ? `<div class="item"><span class="meta"><span class="t">UPI reference</span><span class="s">${esc(i.upiRef)}</span></span></div>` : ""}
        ${i.txnId ? `<div class="item"><span class="meta"><span class="t">Transaction ID</span><span class="s">${esc(i.txnId)}</span></span></div>` : ""}
        ${i.bankName || i.accountHint ? `<div class="item"><span class="meta"><span class="t">Bank account</span><span class="s">${esc([i.bankName, i.accountHint ? "…" + i.accountHint : ""].filter(Boolean).join(" "))}</span></span></div>` : ""}
      </div>
      <label class="field"><span>${inc ? "Sender" : "Merchant or receiver"}</span><input class="input" id="ad-name" value="${esc(s.counterparty)}" maxlength="60"></label>
      <label class="field"><span>Type</span></label><div class="chips" id="ad-kind" style="margin-bottom:12px">${kinds.map((k) => `<button class="chip" data-v="${k}" aria-pressed="${s.kind === k}">${A.KIND[k]}</button>`).join("")}</div>
      <label class="field"><span>Category</span></label><div class="chips scroll" id="ad-cat" style="margin-bottom:12px">${d.categories.filter((c) => c.kind === "both" || c.kind === (s.kind === "EXPENSE" ? "expense" : "income")).map((c) => `<button class="chip" data-v="${c.id}" aria-pressed="${s.categoryId === c.id}">${c.icon} ${esc(c.name)}</button>`).join("")}</div>
      <label class="field"><span>Note</span><input class="input" id="ad-note" value="${esc(s.note)}" maxlength="200"></label>
      <button class="btn primary block" id="ad-save">Save corrections</button>
      <button class="btn danger block" id="ad-del" style="margin-top:8px">${GF.icon("trash")} Delete</button>`;
    GF.sheet({ title: "Automatic transaction", body: draw(), mount(sh) {
      const wire = () => {
        $$("#ad-kind .chip", sh).forEach((b) => (b.onclick = () => { s.counterparty = $("#ad-name", sh).value; s.note = $("#ad-note", sh).value; s.kind = b.dataset.v; $(".sbody", sh).innerHTML = draw(); wire(); }));
        $$("#ad-cat .chip", sh).forEach((b) => (b.onclick = () => { s.categoryId = b.dataset.v; $$("#ad-cat .chip", sh).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
        $("#ad-save", sh).onclick = async () => {
          s.counterparty = $("#ad-name", sh).value.trim(); s.note = $("#ad-note", sh).value.trim();
          await AT().update({ id: i.id, kind: s.kind, categoryId: s.categoryId || null, counterparty: s.counterparty || null, note: s.note, rememberCategory: true });
          const t = GF.store.get("transactions", i.id); if (t) { t.auto = { ...(t.auto || {}), userEdited: true }; t.categoryId = s.categoryId || t.categoryId; t.merchant = s.counterparty || t.merchant; }
          GF.closeAll(async () => { await A.sync(); GF.toast(s.counterparty && s.categoryId ? "Saved · " + s.counterparty + " will be categorised the same way next time" : "Saved"); GF.render(); });
        };
        $("#ad-del", sh).onclick = async () => {
          if (!(await GF.confirm({ title: "Delete this transaction?", msg: "It's removed from your ledger and won't come back if the same alert arrives again.", ok: "Delete", danger: true }))) return;
          await AT().update({ id: i.id, deleted: true });
          GF.closeAll(async () => { await A.sync(); GF.toast("Deleted"); GF.render(); });
        };
      };
      wire();
    } });
  };

  /* ---------- Diagnostics ---------- */
  GF.acts.autoDiag = async () => {
    const r = await AT().getDiagnostics();
    const s = A.status || (await A.refreshStatus());
    GF.sheet({ title: "Detection diagnostics", body: `<div class="list glass" style="margin-bottom:12px">
        <div class="item"><span class="meta"><span class="t">Notification access</span><span class="s">${s.notificationAccess ? "Granted" : "Not granted"} · listener ${s.listenerConnected ? "connected" : "not connected"}</span></span></div>
        <div class="item"><span class="meta"><span class="t">Listener last connected</span><span class="s">${ago(r.listenerConnectedAt)}${r.listenerDisconnectedAt > r.listenerConnectedAt ? " · disconnected " + ago(r.listenerDisconnectedAt) : ""}</span></span></div>
        <div class="item"><span class="meta"><span class="t">Outcomes</span><span class="s">${s.created} recorded · ${s.updated} upgraded · ${s.duplicatesPrevented} duplicates · ${s.ignored} not payments · ${s.errors} errors</span></span></div>
        <div class="item"><span class="meta"><span class="t">Learned merchant categories</span><span class="s">${r.rules}</span></span></div></div>
      <h2 class="h2">Test a notification format</h2>
      <p class="small muted">Paste the text of a payment notification to see what would be detected. Nothing is saved.</p>
      <div class="chips scroll" id="dg-app" style="margin-bottom:8px">${s.apps.map((a, n) => `<button class="chip" data-v="${a.packageName}" aria-pressed="${n === 0}">${esc(a.name)}</button>`).join("")}</div>
      <textarea class="input" id="dg-text" rows="3" placeholder="e.g. Paid ₹50 to Tea Stall. UPI Ref No 123456789012"></textarea>
      <button class="btn block" id="dg-run" style="margin-top:8px">Test</button><div id="dg-out" class="small" style="margin-top:8px"></div>
      <h2 class="h2">Recent activity</h2>
      ${r.log.length ? `<div class="list glass">${r.log.map((l) => `<div class="item"><span class="meta"><span class="t">${esc(l.app)} · ${l.outcome.toLowerCase()}</span><span class="s">${ago(l.at)}${l.reason ? " · " + esc(A.SOURCE[l.reason] || l.reason) : ""}</span></span></div>`).join("")}</div>` : `<p class="muted small">No notifications handled yet.</p>`}`,
      mount(sh) {
        let pkg = s.apps[0].packageName;
        $$("#dg-app .chip", sh).forEach((b) => (b.onclick = () => { pkg = b.dataset.v; $$("#dg-app .chip", sh).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
        $("#dg-run", sh).onclick = async () => {
          const o = await AT().testParse({ packageName: pkg, text: $("#dg-text", sh).value });
          $("#dg-out", sh).innerHTML = o.parsed ? `✓ ${A.KIND[o.kind]} · ${GF.fmt(o.amountPaise, { force: true })} · ${A.STATUS[o.status]}${o.counterparty ? " · " + esc(o.counterparty) : " · no name found"}${o.upiRef ? " · Ref " + esc(o.upiRef) : " · no reference"}${o.bank ? " · " + esc(o.bank) : ""}` : "✗ Not recognised as a payment (or filtered as OTP/promotion/request).";
        };
      } });
  };

  /* ---------- Bank statement CSV import (fallback for Account Aggregator) ---------- */
  const splitCsv = (line) => { const out = []; let cur = "", q = false; for (const ch of line) { if (ch === '"') q = !q; else if ((ch === "," || ch === "\t") && !q) { out.push(cur.trim()); cur = ""; } else cur += ch; } out.push(cur.trim()); return out; };
  const num = (v) => { v = String(v || "").replace(/[₹,\s]|Rs\.?|INR/gi, ""); if (!v || v === "-") return 0; const cr = /cr$/i.test(v), dr = /dr$/i.test(v); const n = parseFloat(v.replace(/(cr|dr)$/i, "")); return isNaN(n) ? 0 : Math.round(n * 100) * (dr ? -1 : 1) * (cr ? 1 : 1); };
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const parseDate = (s) => {
    s = String(s || "").trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return new Date(+m[1], m[2] - 1, +m[3], 12);
    if ((m = s.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2,4})/))) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, m[2] - 1, +m[1], 12); }
    if ((m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[A-Za-z]*[\s\-,]+(\d{2,4})/))) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, MON[m[2].toLowerCase()] - 1, +m[1], 12); }
    return null;
  };
  /** Parses common Indian bank statement CSVs: Date, Narration/Description, Withdrawal/Debit, Deposit/Credit, Balance (or a single Amount + Dr/Cr column). */
  GF.parseStatementCsv = (text) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const hi = lines.findIndex((l) => /date/i.test(l) && /(narration|description|particular|remark|details)/i.test(l));
    if (hi < 0) return { error: "Couldn't find a header row with Date and Description/Narration columns." };
    const h = splitCsv(lines[hi]).map((x) => x.toLowerCase());
    const col = (...re) => h.findIndex((x) => re.some((r) => r.test(x)));
    const ci = { date: col(/^(txn |transaction |value )?date/, /date/), desc: col(/narration|description|particular|remark|details/), dr: col(/withdraw|debit|dr\b/), cr: col(/deposit|credit|cr\b/), amt: col(/^amount/), type: col(/^(type|dr\s*\/\s*cr|cr\s*\/\s*dr)$/), bal: col(/balance/), ref: col(/ref|chq|cheque|utr/) };
    const rows = [];
    for (const l of lines.slice(hi + 1)) {
      const c = splitCsv(l), dt = parseDate(c[ci.date]);
      if (!dt) continue;
      let dr = ci.dr >= 0 ? Math.abs(num(c[ci.dr])) : 0, cr = ci.cr >= 0 ? Math.abs(num(c[ci.cr])) : 0;
      if (!dr && !cr && ci.amt >= 0) { const v = num(c[ci.amt]); const t = ci.type >= 0 ? c[ci.type] : ""; if (/cr/i.test(t)) cr = Math.abs(v); else if (/dr/i.test(t)) dr = Math.abs(v); else if (v < 0) dr = -v; else cr = v; }
      if (!dr && !cr) continue;
      const desc = c[ci.desc] || "";
      // UPI narration: UPI/<rrn>/<name>/<vpa>/... or UPI-<name>-<vpa>-<rrn>
      const parts = desc.split(/[\/\-]/).map((x) => x.trim()).filter(Boolean);
      const rrn = (desc.match(/\b(\d{12})\b/) || [])[1] || (ci.ref >= 0 && /^\d{12}$/.test((c[ci.ref] || "").trim()) ? c[ci.ref].trim() : "");
      const name = /^UPI/i.test(desc) ? parts.find((p, n) => n > 0 && !/^\d+$/.test(p) && !/@/.test(p) && !/^(UPI|P2A|P2M|DR|CR)$/i.test(p)) || "" : desc.slice(0, 40);
      rows.push({ occurredAt: dt.getTime(), amountPaise: dr || cr, direction: dr ? "DEBIT" : "CREDIT", description: desc.slice(0, 120), counterparty: name, ref: rrn, balancePaise: ci.bal >= 0 && c[ci.bal] ? Math.abs(num(c[ci.bal])) : null });
    }
    return { rows };
  };
  GF.acts.importStatement = async () => {
    const f = await GF.readFile(".csv,text/csv,text/plain");
    if (!f) return;
    const r = GF.parseStatementCsv(f.text);
    if (r.error) return GF.toast(r.error);
    if (!r.rows.length) return GF.toast("No transactions found in that file.");
    const bank = (GF.acc(GF.store.data.settings.autoAccountId) || {}).bankName || null;
    if (!(await GF.confirm({ title: `Import ${r.rows.length} statement rows?`, msg: `${GF.D.short(GF.D.iso(new Date(Math.min(...r.rows.map((x) => x.occurredAt)))))} to ${GF.D.short(GF.D.iso(new Date(Math.max(...r.rows.map((x) => x.occurredAt)))))}. Payments already recorded are matched and marked Bank-verified instead of being added twice.`, ok: "Import" }))) return;
    if (!AT()) return GF.toast("Statement reconciliation runs in the Android app.");
    const o = await AT().importStatement({ rows: r.rows, bankName: bank });
    await A.sync(); await A.refreshStatus();
    GF.toast(`${o.created} new · ${o.updated} verified · ${o.duplicates} already there`);
    GF.render();
  };

  /* ---------- Pay with UPI (Source D) ---------- */
  GF.acts.upiPay = () => GF.closeAll(() => GF.sheet({ title: "Pay with UPI", body: `<p class="small muted">Glass Finance opens your UPI app with these details. You enter your UPI PIN in that app — never here. The app's reply is recorded as provisional until a bank alert or statement confirms it. Some apps limit payments started from other apps.</p>
      <label class="field"><span>UPI ID</span><input class="input" id="up-vpa" placeholder="name@bank" autocomplete="off" autocapitalize="off"></label>
      <label class="field"><span>Name</span><input class="input" id="up-name" placeholder="e.g. Tea Stall" maxlength="40"></label>
      <label class="field"><span>Amount (₹)</span><input class="input amt" id="up-amt" inputmode="decimal"></label>
      <label class="field"><span>Note</span><input class="input" id="up-note" maxlength="50"></label><div class="errbox" id="up-err" hidden></div>
      <button class="btn primary block" id="up-go">Continue in UPI app</button>`,
    mount(sh) {
      $("#up-go", sh).onclick = async () => {
        const vpa = $("#up-vpa", sh).value.trim(), amt = $("#up-amt", sh).value.trim().replace(/,/g, ""), e = $("#up-err", sh);
        if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(vpa)) { e.hidden = false; e.textContent = "Enter a valid UPI ID, like name@okaxis."; return; }
        if (!(parseFloat(amt) > 0)) { e.hidden = false; e.textContent = "Enter an amount."; return; }
        try {
          const r = await AT().payUpi({ vpa, name: $("#up-name", sh).value.trim() || vpa, amount: parseFloat(amt).toFixed(2), note: $("#up-note", sh).value.trim() });
          GF.closeAll(async () => { await A.sync(); GF.toast(r.recorded ? "UPI app reported: " + r.status.toLowerCase() + " · recorded as provisional" : "Payment cancelled"); });
        } catch (err) { e.hidden = false; e.textContent = String(err.message || err); }
      };
    } }));

  /* Home: compact tracking status card. */
  GF.autoHomeCard = () => {
    if (!A.available() || !A.status) return "";
    const s = A.status, on = s.enabled && s.notificationAccess;
    return `<a class="card glass" href="#/auto" style="display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit;margin-bottom:12px"><span style="font-size:22px">⚡</span><span style="flex:1"><b>${on ? "Automatic tracking on" : "Set up automatic tracking"}</b><br><span class="small muted">${on ? "Last detection " + ago(s.lastDetection).toLowerCase() + (s.awaiting ? " · " + s.awaiting + " to review" : "") : "Record UPI payments without typing"}</span></span>${GF.icon("chev")}</a>`;
  };
})();
