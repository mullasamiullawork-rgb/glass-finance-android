/* Glass Finance — Settings, categories manager, export/backup/restore/import, erase. */
(function () {
  const GF = window.GF, D = GF.D, esc = GF.esc, $ = GF.$, $$ = GF.$$;
  GF.hooks.settingsSections = GF.hooks.settingsSections || [];
  const toggle = (id, on, label) => `<button class="toggle" role="switch" id="${id}" aria-checked="${on}" aria-label="${label}"></button>`;
  const row = (title, sub, right, act) => `<${act ? `button data-act="${act}"` : "div"} class="item"><span class="meta"><span class="t">${title}</span>${sub ? `<span class="s">${sub}</span>` : ""}</span>${right || (act ? `<span class="chev">${GF.icon("chev")}</span>` : "")}</${act ? "button" : "div"}>`;

  GF.screen("settings", {
    tab: "more",
    title: () => "Settings",
    render() {
      const s = GF.store.data.settings;
      return `${GF.topbar("Settings", { back: true })}
      <h2 class="h2">Profile</h2><div class="card glass"><label class="field" style="margin:0"><span>Your name</span><input class="input" id="st-name" value="${esc(s.name)}" maxlength="30" autocomplete="given-name"></label></div>
      <h2 class="h2">Appearance</h2><div class="card glass"><div class="seg" role="group" aria-label="Theme">${[["system", "System"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => `<button data-act="setTheme" data-v="${k}" aria-pressed="${s.theme === k}">${l}</button>`).join("")}</div></div>
      <h2 class="h2">Preferences</h2><div class="list glass">
        ${row("Haptics", "Small vibrations on taps, where supported", toggle("st-hap", s.haptics, "Haptics"))}
        ${row("Hide balances by default", "Show ₹•••• until you tap the eye", toggle("st-hide", s.hideBalances, "Hide balances by default"))}
        ${row("Categories", GF.store.data.categories.length + " categories", "", "catManager")}
      </div>
      ${GF.hooks.settingsSections.map((f) => f()).join("")}
      <h2 class="h2">Your data</h2><div class="list glass">
        ${row("Export", "CSV or JSON for a date range", "", "exportSheet")}
        ${row("Back up", "Everything, as one JSON file", "", "backup")}
        ${row("Restore", "From a Glass Finance backup", "", "restore")}
        ${row("Import transactions", "From a CSV or JSON file", "", "importFile")}
        ${GF.store.hasSample() ? row("Clear sample data", "Remove every demo item", "", "clearSample") : ""}
        ${row('<span class="exp">Erase all data</span>', "Start over with an empty app", "", "eraseAll")}
      </div>
      <p class="tiny muted" style="text-align:center">${GF.store.persistent ? "Saved on this device only (localStorage)." : "⚠ Storage unavailable — changes are kept only until you close this tab."} Schema v${GF.SCHEMA}.</p>`;
    },
    mount(root) {
      $("#st-name", root).onchange = (e) => { GF.store.setSettings({ name: e.target.value.trim() }); GF.toast("Name saved"); };
      [["st-hap", "haptics"], ["st-hide", "hideBalances"]].forEach(([id, k]) => ($("#" + id, root).onclick = () => { GF.store.setSettings({ [k]: !GF.store.data.settings[k] }); if (k === "hideBalances") GF.hidden = GF.store.data.settings.hideBalances; GF.haptic(); }));
    },
  });
  GF.acts.setTheme = (el) => { GF.store.setSettings({ theme: el.dataset.v }); GF.applyTheme(); };

  /* Categories manager */
  GF.acts.catManager = () => {
    const draw = (el) => {
      const d = GF.store.data;
      $(".sbody", el).innerHTML = `<div class="list" style="background:var(--glass-3)">${d.categories.map((c) => `<div class="item">${GF.catIcon(c)}<span class="meta"><span class="t">${esc(c.name)}</span><span class="s">${c.kind === "both" ? "Income and expense" : c.kind === "income" ? "Income" : "Expense"} · ${d.transactions.filter((t) => t.categoryId === c.id).length} uses</span></span><button class="iconbtn" data-ren="${c.id}" aria-label="Rename ${esc(c.name)}">${GF.icon("edit")}</button>${c.id === "cat_other" ? "" : `<button class="iconbtn" data-del="${c.id}" aria-label="Delete ${esc(c.name)}" style="color:var(--expense)">${GF.icon("trash")}</button>`}</div>`).join("")}</div>
      <h3 style="margin:16px 4px 8px;font-size:16px">New category</h3>
      <div class="row"><input class="input" id="cn-icon" value="🏷️" maxlength="4" style="width:64px;text-align:center" aria-label="Icon (emoji)"><input class="input" id="cn-name" placeholder="Name, e.g. Gym" maxlength="30"></div>
      <div class="seg" id="cn-kind" style="margin:10px 0"><button data-v="expense" aria-pressed="true">↓ Expense</button><button data-v="income" aria-pressed="false">↑ Income</button><button data-v="both" aria-pressed="false">Both</button></div>
      <button class="btn primary block" id="cn-add">Add category</button>`;
      let kind = "expense";
      $$("#cn-kind button", el).forEach((b) => (b.onclick = () => { kind = b.dataset.v; $$("#cn-kind button", el).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
      $("#cn-add", el).onclick = () => {
        const name = $("#cn-name", el).value.trim();
        if (!name) return GF.toast("Enter a name");
        if (d.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return GF.toast("That category already exists");
        const colors = ["#ff8a5b", "#3b82f6", "#ec4899", "#8b5cf6", "#0ea5e9", "#f59e0b", "#10b981", "#6366f1"];
        GF.store.upsert("categories", { name, icon: $("#cn-icon", el).value.trim() || "🏷️", kind, color: colors[d.categories.length % colors.length] });
        draw(el); GF.toast("Category added");
      };
      $$("[data-ren]", el).forEach((b) => (b.onclick = () => {
        const c = GF.cat(b.dataset.ren);
        const nn = prompt("Rename category", c.name);
        if (nn && nn.trim()) { c.name = nn.trim().slice(0, 30); GF.store.upsert("categories", c); draw(el); }
      }));
      $$("[data-del]", el).forEach((b) => (b.onclick = () => {
        const c = GF.cat(b.dataset.del), n = d.transactions.filter((t) => t.categoryId === c.id).length;
        if (!confirm(`Delete "${c.name}"?${n ? ` Its ${n} transaction${n > 1 ? "s" : ""} move to Other.` : ""} Its budgets are removed.`)) return;
        d.transactions.forEach((t) => { if (t.categoryId === c.id) t.categoryId = "cat_other"; });
        d.bills.forEach((t) => { if (t.categoryId === c.id) t.categoryId = "cat_other"; });
        d.recurring.forEach((t) => { if (t.categoryId === c.id) t.categoryId = "cat_other"; });
        d.budgets = d.budgets.filter((x) => x.categoryId !== c.id);
        GF.store.remove("categories", c.id);
        draw(el); GF.toast("Category deleted");
      }));
    };
    GF.sheet({ title: "Categories", body: "", mount: draw });
  };

  /* Export */
  const csvCell = (v) => { v = String(v ?? ""); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  GF.toCSV = (txs) => {
    const head = ["id", "date", "time", "type", "amount", "category", "account", "toAccount", "merchant", "note", "paymentMethod"];
    const lines = txs.map((t) => [t.id, t.dateTime.slice(0, 10), t.dateTime.slice(11, 16), t.type, GF.fromPaise(t.amount), t.type === "transfer" ? "" : GF.cat(t.categoryId).name, (GF.acc(t.accountId) || {}).name, (GF.acc(t.toAccountId) || {}).name, t.merchant, t.note, t.paymentMethod].map(csvCell).join(","));
    return [head.join(","), ...lines].join("\n");
  };
  GF.acts.exportSheet = () => {
    const d = GF.store.data, sorted = [...d.transactions].sort((a, b) => (a.dateTime < b.dateTime ? -1 : 1));
    const first = sorted[0] ? sorted[0].dateTime.slice(0, 10) : D.today();
    GF.sheet({
      title: "Export transactions",
      body: `<div class="grid2"><label class="field"><span>From</span><input class="input" type="date" id="ex-from" value="${first}"></label><label class="field"><span>To</span><input class="input" type="date" id="ex-to" value="${D.today()}"></label></div>
      <p class="small muted" id="ex-n"></p>
      <div class="grid2"><button class="btn primary" id="ex-csv">Download CSV</button><button class="btn primary" id="ex-json">Download JSON</button></div>
      <button class="btn block" id="ex-copy" style="margin-top:10px">${GF.icon("copy")} Copy CSV instead</button>`,
      mount(el) {
        const pick = () => sorted.filter((t) => GF.calc.inRange(t, $("#ex-from", el).value, $("#ex-to", el).value));
        const upd = () => ($("#ex-n", el).textContent = pick().length + " transactions in range. Amounts in rupees in CSV, paise in JSON.");
        upd(); $("#ex-from", el).onchange = upd; $("#ex-to", el).onchange = upd;
        const name = (ext) => `glassfinance-${$("#ex-from", el).value}-to-${$("#ex-to", el).value}.${ext}`;
        $("#ex-csv", el).onclick = () => GF.download(name("csv"), GF.toCSV(pick()), "text/csv");
        $("#ex-json", el).onclick = () => GF.download(name("json"), JSON.stringify({ schema: GF.SCHEMA, exported: new Date().toISOString(), transactions: pick() }, null, 2), "application/json");
        $("#ex-copy", el).onclick = () => GF.copySheet("CSV export", GF.toCSV(pick()));
      },
    });
  };
  GF.acts.backup = () => GF.download(`glassfinance-backup-${D.today()}.json`, JSON.stringify(GF.store.data, null, 1), "application/json");

  /* Restore */
  GF.restoreFrom = (obj) => {
    const err = GF.store.validate(obj);
    if (err) return GF.sheet({ title: "Can't restore", body: `<div class="errbox">${esc(err)}</div><p class="muted small">Pick a backup made with Glass Finance's Back up option.</p>` });
    GF.sheet({
      title: "Restore backup",
      body: `<p class="muted">The backup has ${obj.accounts.length} accounts and ${obj.transactions.length} transactions.</p>
      <div class="list" style="background:var(--glass-3)">${row("Replace everything", "Your current data is removed first", "", "")}${row("Merge", "Add new items; items with the same id are updated", "", "")}</div>
      <div class="grid2"><button class="btn danger" id="rs-rep">Replace</button><button class="btn primary" id="rs-mer">Merge</button></div>`,
      mount(el) {
        $("#rs-rep", el).onclick = () => GF.closeAll(async () => { if (await GF.confirm({ title: "Replace all data?", msg: "Everything on this device is replaced by the backup.", ok: "Replace", danger: true })) { GF.store.replaceAll(obj); GF.applyTheme(); GF.toast("Backup restored"); } });
        $("#rs-mer", el).onclick = () => GF.closeAll(() => { GF.store.mergeAll(obj); GF.toast("Backup merged"); });
      },
    });
  };
  GF.acts.restore = async () => {
    const f = await GF.readFile(".json,application/json");
    if (!f) return;
    let obj; try { obj = JSON.parse(f.text); } catch (e) { return GF.toast("That file isn't valid JSON"); }
    GF.restoreFrom(obj);
  };

  /* Import CSV / JSON transactions */
  GF.parseCSV = (text) => {
    const rows = []; let r = [], c = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { r.push(c); c = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; r.push(c); rows.push(r); r = []; c = ""; }
      else c += ch;
    }
    if (c || r.length) { r.push(c); rows.push(r); }
    return rows.filter((x) => x.some((v) => v.trim()));
  };
  const normDate = (s) => { s = (s || "").trim(); let m; if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[0]; if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) return `${m[3]}-${D.pad(m[2])}-${D.pad(m[1])}`; return null; };
  GF.importRows = (objs) => {
    const d = GF.store.data; let ok = 0, skip = 0, newAcc = 0;
    const findAcc = (name) => {
      if (!name) return null;
      let a = d.accounts.find((x) => x.name.toLowerCase() === String(name).trim().toLowerCase());
      if (!a) { a = { id: GF.uid(), name: String(name).trim(), type: "bank", icon: "🏦", color: "#64748b", opening: 0, archived: false }; d.accounts.push(a); newAcc++; }
      return a.id;
    };
    const findCat = (name) => (d.categories.find((x) => x.name.toLowerCase() === String(name || "").trim().toLowerCase()) || { id: "cat_other" }).id;
    objs.forEach((o) => {
      const type = String(o.type || "").toLowerCase().trim();
      const date = normDate(o.date || o.dateTime);
      const time = (o.time || (o.dateTime || "").slice(11, 16) || "12:00").trim();
      const amount = typeof o.amount === "number" && o.accountId ? Math.round(o.amount) : Math.abs(GF.toPaise(o.amount));
      const accountId = o.accountId && GF.acc(o.accountId) ? o.accountId : findAcc(o.account);
      const toAccountId = type === "transfer" ? (o.toAccountId && GF.acc(o.toAccountId) ? o.toAccountId : findAcc(o.toAccount)) : null;
      if (!["income", "expense", "transfer"].includes(type) || !date || !amount || !accountId || (type === "transfer" && (!toAccountId || toAccountId === accountId))) { skip++; return; }
      if (o.id && d.transactions.some((t) => t.id === o.id)) { skip++; return; } // already present
      const id = o.id ? String(o.id) : GF.uid();
      d.transactions.push({ id, type, amount, accountId, toAccountId, categoryId: type === "transfer" ? null : o.categoryId && d.categories.some((c) => c.id === o.categoryId) ? o.categoryId : findCat(o.category), dateTime: date + "T" + (/^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "12:00"), merchant: String(o.merchant || "").slice(0, 60), note: String(o.note || "").slice(0, 200), paymentMethod: GF.PAYMENT_METHODS.includes(o.paymentMethod) ? o.paymentMethod : "UPI", isSample: false });
      ok++;
    });
    GF.store.save();
    GF.sheet({ title: "Import finished", body: `<p><b>${ok}</b> transaction${ok === 1 ? "" : "s"} imported${skip ? `, <b>${skip}</b> skipped (missing type, date, amount or account)` : ""}.${newAcc ? ` ${newAcc} new account${newAcc > 1 ? "s were" : " was"} created.` : ""}</p><p class="small muted">CSV columns: date, time, type, amount, category, account, toAccount, merchant, note, paymentMethod.</p>` });
  };
  GF.acts.importFile = async () => {
    const f = await GF.readFile(".csv,.json,text/csv,application/json");
    if (!f) return;
    if (/\.json$/i.test(f.name) || f.text.trim().startsWith("{") || f.text.trim().startsWith("[")) {
      let obj; try { obj = JSON.parse(f.text); } catch (e) { return GF.toast("That file isn't valid JSON"); }
      if (obj && obj.accounts && obj.categories) return GF.restoreFrom(obj);
      const arr = Array.isArray(obj) ? obj : obj && obj.transactions;
      if (!Array.isArray(arr)) return GF.toast("No transactions found in that file");
      return GF.importRows(arr);
    }
    const rows = GF.parseCSV(f.text);
    if (rows.length < 2) return GF.toast("The CSV has no rows");
    const head = rows[0].map((h) => h.trim().replace(/^\ufeff/, ""));
    GF.importRows(rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))).map((o) => ({ ...o, id: o.id || undefined })));
  };

  GF.acts.eraseAll = async () => {
    if (await GF.confirm({ title: "Erase all data?", msg: "Every account, transaction, budget, goal, bill and recurring item on this device is deleted. Back up first if you might need it.", ok: "Erase everything", danger: true, typed: "DELETE" })) {
      GF.store.eraseAll(); GF.toast("All data erased"); GF.go("#/home");
    }
  };
})();
