/* Finance Tracker — Accounts and Budget. */
(function () {
  const GF = window.GF, D = GF.D, C = GF.calc, esc = GF.esc, $ = GF.$, $$ = GF.$$;
  const ICONS = ["💵", "🏦", "🐷", "📱", "💳", "👛", "🪙", "🏧", "💼", "🎓"];
  const COLORS = ["#10b981", "#2563eb", "#8b5cf6", "#0ea5e9", "#f43f5e", "#f59e0b", "#ec4899", "#64748b"];

  /* ---------- Accounts ---------- */
  const accItem = (a, bal) => `<a class="item" href="#/account/${a.id}" style="text-decoration:none;color:inherit"><span class="cat" style="background:${a.color}26">${a.icon}</span><span class="meta"><span class="t">${esc(a.name)}${a.isSample ? '<span class="demo">Demo</span>' : ""}</span><span class="s">${(GF.ACCOUNT_TYPES[a.type] || "").replace(/^\S+ /, "")}${a.archived ? " · Archived" : ""}</span></span><span class="r amt ${bal < 0 ? "exp" : ""}">${GF.fmt(bal)}</span><span class="chev">${GF.icon("chev")}</span></a>`;
  GF.screen("accounts", {
    tab: "more",
    title: () => "Accounts",
    render() {
      const d = GF.store.data, b = C.balances(d);
      const act = d.accounts.filter((a) => !a.archived), arch = d.accounts.filter((a) => a.archived);
      const assets = act.filter((a) => b[a.id] > 0).reduce((s, a) => s + b[a.id], 0), debts = act.filter((a) => b[a.id] < 0).reduce((s, a) => s + b[a.id], 0);
      return `${GF.topbar("Accounts", { back: true, right: `<button class="iconbtn glass" data-act="accountEdit" aria-label="Add account">${GF.icon("plus")}</button>` })}
      <section class="hero glass"><div class="lbl">Total across ${act.length} account${act.length === 1 ? "" : "s"}</div><div class="big amt">${GF.fmt(C.totalBalance(d))}</div>
      <div class="grid2"><div class="kpi"><span>You have</span><b class="amt">${GF.fmt(assets)}</b></div><div class="kpi"><span>You owe</span><b class="amt exp">${GF.fmt(-debts)}</b></div></div></section>
      <h2 class="h2">Active</h2>${act.length ? `<div class="list glass">${act.map((a) => accItem(a, b[a.id])).join("")}</div>` : `<div class="empty glass card"><p>No accounts yet.</p><button class="btn primary" data-act="accountEdit">Add account</button></div>`}
      ${arch.length ? `<h2 class="h2">Archived</h2><div class="list glass">${arch.map((a) => accItem(a, b[a.id])).join("")}</div>` : ""}`;
    },
  });

  GF.screen("account", {
    tab: "more",
    title: (id) => (GF.acc(id) || {}).name || "Account",
    render(id) {
      const d = GF.store.data, a = GF.acc(id);
      if (!a) return `${GF.topbar("Account", { back: true })}<div class="empty glass card"><p>This account no longer exists.</p><a class="btn" href="#/accounts">All accounts</a></div>`;
      const bal = C.accountBalance(a, d.transactions);
      const txs = d.transactions.filter((t) => t.accountId === id || t.toAccountId === id).sort((x, y) => (x.dateTime < y.dateTime ? 1 : -1));
      let inn = 0, out = 0;
      txs.forEach((t) => { if (t.type === "income" || (t.type === "transfer" && t.toAccountId === id)) inn += t.amount; else out += t.amount; });
      return `${GF.topbar(a.name, { back: true, sub: GF.ACCOUNT_TYPES[a.type] || "", right: `<button class="iconbtn glass" data-act="accountEdit" data-id="${a.id}" aria-label="Edit account">${GF.icon("edit")}</button>` })}
      <section class="hero glass"><div class="lbl">Balance${a.archived ? " · Archived" : ""}</div><div class="big amt ${bal < 0 ? "exp" : ""}">${GF.fmt(bal)}</div>
      <div class="kpis"><div class="kpi"><span>Opening</span><b class="amt">${GF.fmt(a.opening || 0)}</b></div><div class="kpi"><span>↑ Money in</span><b class="amt inc">+${GF.fmt(inn)}</b></div><div class="kpi"><span>↓ Money out</span><b class="amt exp">−${GF.fmt(out)}</b></div></div></section>
      <div class="list glass" style="margin-bottom:12px">
        <div class="item"><span class="meta"><span class="t">Calculated ledger balance</span><span class="s">Opening + money in − money out, from transactions in Finance Tracker</span></span><span class="r amt">${GF.fmt(bal)}</span></div>
        <button class="item" data-act="accountActual" data-id="${a.id}"><span class="meta"><span class="t">Actual bank balance</span><span class="s">${a.actualBalance != null ? "You entered it on " + D.short(a.actualBalanceAt.slice(0, 10)) + (a.actualBalance !== bal ? " · differs by " + GF.fmt(Math.abs(a.actualBalance - bal)) : " · matches") : "Tap to enter what your bank app shows"}</span></span><span class="r amt">${a.actualBalance != null ? GF.fmt(a.actualBalance) : "—"}</span></button>
        <div class="item"><span class="meta"><span class="t">Last synced bank balance</span><span class="s">${a.syncedBalance != null ? "From a " + esc(a.syncedSource || "bank alert") + ", " + D.short(a.syncedAt.slice(0, 10)) + " " + D.time(a.syncedAt) : "Appears when a bank alert or statement with a balance is detected. No live bank connection."}</span></span><span class="r amt">${a.syncedBalance != null ? GF.fmt(a.syncedBalance) : "—"}</span></div>
      </div>
      <div class="grid2" style="margin-bottom:6px"><button class="btn" data-act="accountArchive" data-id="${a.id}">${a.archived ? "Unarchive" : "Archive"}</button><button class="btn" style="color:var(--expense)" data-act="accountDelete" data-id="${a.id}">${GF.icon("trash")} Delete</button></div>
      <h2 class="h2">History <span class="small muted">${txs.length} entries</span></h2>
      ${txs.length ? `<div class="list glass">${txs.slice(0, 300).map((t) => GF.txRow(t, { accountId: id, showDate: true })).join("")}</div>` : `<div class="empty glass card"><p>No transactions in this account yet.</p></div>`}`;
    },
  });

  GF.acts.accountEdit = (el) => {
    const ex = el.dataset.id ? GF.acc(el.dataset.id) : null;
    const s = ex ? { ...ex } : { name: "", type: "bank", icon: "🏦", color: COLORS[1], opening: 0, archived: false };
    GF.closeAll(() => GF.sheet({
      title: ex ? "Edit account" : "New account",
      body: `<label class="field"><span>Name</span><input class="input" id="ac-name" value="${esc(s.name)}" placeholder="e.g. Kotak Bank" maxlength="40" autofocus></label>
      <label class="field"><span>Type</span></label><div class="chips" id="ac-type" style="margin-bottom:12px">${Object.entries(GF.ACCOUNT_TYPES).map(([k, v]) => `<button class="chip" data-v="${k}" aria-pressed="${s.type === k}">${v}</button>`).join("")}</div>
      <label class="field"><span>Icon</span></label><div class="chips" id="ac-icon" style="margin-bottom:12px">${ICONS.map((i) => `<button class="chip" data-v="${i}" aria-pressed="${s.icon === i}" aria-label="Icon ${i}">${i}</button>`).join("")}</div>
      <label class="field"><span>Colour</span></label><div class="chips" id="ac-color" style="margin-bottom:12px">${COLORS.map((c) => `<button class="chip" data-v="${c}" aria-pressed="${s.color === c}" aria-label="Colour ${c}" style="width:44px;background:${c}"></button>`).join("")}</div>
      ${s.type !== "cash" ? `<label class="field"><span>Bank name (optional)</span><input class="input" id="ac-bank" value="${esc(s.bankName || "")}" placeholder="e.g. SBI" maxlength="40"></label>
      <label class="field"><span>Last 4 digits of account/card (optional, links bank alerts)</span><input class="input" id="ac-mask" inputmode="numeric" value="${esc(s.mask || "")}" placeholder="e.g. 4321" maxlength="6"></label>` : ""}
      <label class="field"><span>Currency</span><input class="input" value="INR (₹)" disabled></label>
      <label class="field"><span>Opening balance (₹)${s.type === "credit" ? " — enter amount owed as negative" : ""}</span><input class="input amt" id="ac-open" inputmode="decimal" value="${GF.fromPaise(s.opening || 0)}"></label>
      <div class="errbox" id="ac-err" hidden></div>
      <button class="btn primary block" id="ac-save">${ex ? "Save changes" : "Add account"}</button>`,
      mount(sh) {
        ["type", "icon", "color"].forEach((k) => $$(`#ac-${k} .chip`, sh).forEach((b) => (b.onclick = () => { s[k] = b.dataset.v; $$(`#ac-${k} .chip`, sh).forEach((x) => x.setAttribute("aria-pressed", x === b)); if (k === "type") { const m = { cash: "💵", bank: "🏦", savings: "🐷", wallet: "📱", credit: "💳" }[s.type]; s.icon = m; $$("#ac-icon .chip", sh).forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === m)); } })));
        $("#ac-save", sh).onclick = () => {
          s.name = $("#ac-name", sh).value.trim();
          const raw = $("#ac-open", sh).value.trim();
          const e = $("#ac-err", sh);
          if (!s.name) { e.hidden = false; e.textContent = "Give the account a name."; return; }
          if (raw && isNaN(parseFloat(raw.replace(/,/g, "")))) { e.hidden = false; e.textContent = "Opening balance must be a number."; return; }
          s.opening = GF.toPaise(raw.replace(/,/g, "") || "0");
          s.currency = "INR";
          if ($("#ac-bank", sh)) { s.bankName = $("#ac-bank", sh).value.trim(); s.mask = $("#ac-mask", sh).value.replace(/\D/g, "").slice(-4); }
          GF.closeAll(() => { GF.store.upsert("accounts", s); GF.toast(ex ? "Account updated" : "Account added"); });
        };
      },
    }));
  };
  GF.acts.accountActual = (el) => {
    const a = GF.acc(el.dataset.id);
    GF.sheet({ title: "Actual bank balance", body: `<p class="small muted">Enter the balance your bank app or passbook shows. Finance Tracker never fetches it on its own.</p><label class="field"><span>Balance (₹)</span><input class="input amt" id="ab-v" inputmode="decimal" value="${a.actualBalance != null ? GF.fromPaise(a.actualBalance) : ""}"></label><button class="btn primary block" id="ab-s">Save</button>${a.actualBalance != null ? '<button class="btn block" id="ab-c" style="margin-top:8px">Clear</button>' : ""}`,
      mount(sh) {
        $("#ab-s", sh).onclick = () => { const v = $("#ab-v", sh).value.trim(); if (!v || isNaN(parseFloat(v.replace(/,/g, "")))) return GF.toast("Enter a number"); a.actualBalance = GF.toPaise(v.replace(/,/g, "")); a.actualBalanceAt = new Date().toISOString(); GF.closeAll(() => GF.store.upsert("accounts", a)); };
        const c = $("#ab-c", sh); if (c) c.onclick = () => { a.actualBalance = null; GF.closeAll(() => GF.store.upsert("accounts", a)); };
      } });
  };
  GF.acts.accountArchive = (el) => { const a = GF.acc(el.dataset.id); a.archived = !a.archived; GF.store.upsert("accounts", a); GF.toast(a.archived ? "Archived — hidden from totals" : "Unarchived"); };
  GF.acts.accountDelete = async (el) => {
    const a = GF.acc(el.dataset.id), d = GF.store.data;
    const n = d.transactions.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length;
    const ok = await GF.confirm({ title: `Delete ${esc(a.name)}?`, msg: n ? `This also deletes its ${n} transaction${n > 1 ? "s" : ""}, including transfers. Archive it instead to keep history.` : "This can't be undone.", ok: "Delete account", danger: true });
    if (!ok) return;
    d.transactions = d.transactions.filter((t) => t.accountId !== a.id && t.toAccountId !== a.id);
    GF.store.remove("accounts", a.id, true);
    GF.go("#/accounts");
    GF.store.save();
    GF.toast("Account deleted");
  };

  /* ---------- Budget ---------- */
  GF.budgetMonth = D.month(D.today());
  GF.screen("budget", {
    tab: "budget",
    title: () => "Budget",
    render() {
      const d = GF.store.data, mk = GF.budgetMonth, s = C.budgetSummary(d, mk);
      const isCur = mk === D.month(D.today());
      const budgeted = new Set(s.cats.map((c) => c.budget.categoryId));
      const other = C.byCategory(d.transactions, D.monthStart(mk), D.monthEnd(mk)).filter((r) => !budgeted.has(r.categoryId));
      const hasPrev = C.budgetsFor(d, D.addMonths(mk, -1)).length > 0;
      return `${GF.topbar("Budget", { right: `<button class="iconbtn glass" data-act="budgetEdit" aria-label="Edit budgets">${GF.icon("edit")}</button>` })}
      <div class="monthsw glass"><button class="iconbtn" data-act="budgetMonth" data-d="-1" aria-label="Previous month">${GF.icon("left")}</button><b>${D.monthLabel(mk)}</b><button class="iconbtn" data-act="budgetMonth" data-d="1" aria-label="Next month" ${isCur ? 'disabled style="opacity:.3"' : ""}>${GF.icon("chev")}</button></div>
      ${s.overall ? `<section class="card glass row" style="gap:18px">
        <div class="ring" style="width:140px;height:140px">${GF.ring(s.overall.pct, 140, 14, s.overall.state)}<div class="c"><b class="amt">${GF.pct(s.overall.pct)}</b><span class="tiny muted">of budget</span></div></div>
        <div><div class="small muted">Spent</div><div class="amt" style="font-size:24px;font-weight:700">${GF.fmt(s.overall.spent)}</div><div class="small muted amt">of ${GF.fmt(s.overall.limit)}</div>
        <div style="margin-top:8px"><span class="badge ${s.overall.state}">${s.overall.state === "over" ? "⚠ " : s.overall.state === "warning" ? "! " : "✓ "}${GF.stateText(s.overall)}</span></div>
        ${isCur && s.overall.remaining > 0 ? `<div class="tiny muted" style="margin-top:6px">${GF.fmt(Math.floor(s.overall.remaining / Math.max(1, D.diffDays(D.today(), D.monthEnd(mk)) + 1)))} a day for the rest of the month</div>` : ""}</div></section>`
      : `<div class="empty glass card"><div class="e">🎯</div><p>No budget for ${D.monthLabel(mk)}.</p><div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn primary" data-act="budgetEdit">Set budgets</button>${hasPrev ? '<button class="btn" data-act="budgetCopy">Copy last month</button>' : ""}</div></div>`}
      ${s.cats.length ? `<h2 class="h2">By category ${hasPrev ? '<button data-act="budgetCopy">Copy last month</button>' : ""}</h2><div class="list glass">${s.cats.map((c) => `<div class="item" style="flex-wrap:wrap;row-gap:8px">${GF.catIcon(c.category)}<span class="meta"><span class="t">${esc(c.category.name)}</span><span class="s amt">${GF.fmt(c.spent)} of ${GF.fmt(c.limit)}</span></span><span class="badge ${c.state}">${c.state === "over" ? "⚠ " : c.state === "warning" ? "! " : ""}${GF.stateText(c)}</span><span style="flex-basis:100%">${GF.bar(c.pct, c.state)}</span></div>`).join("")}</div>` : ""}
      ${other.length ? `<h2 class="h2">Not budgeted</h2><div class="list glass">${other.map((r) => { const c = GF.cat(r.categoryId); return `<div class="item">${GF.catIcon(c)}<span class="meta"><span class="t">${esc(c.name)}</span></span><span class="r amt">${GF.fmt(r.amount)}</span></div>`; }).join("")}</div>` : ""}`;
    },
  });
  GF.acts.budgetMonth = (el) => { const n = D.addMonths(GF.budgetMonth, +el.dataset.d); if (n > D.month(D.today())) return; GF.budgetMonth = n; GF.render(); };
  GF.acts.budgetCopy = async () => {
    const d = GF.store.data, mk = GF.budgetMonth, prev = C.budgetsFor(d, D.addMonths(mk, -1));
    if (!prev.length) return GF.toast("No budgets last month");
    if (C.budgetsFor(d, mk).length && !(await GF.confirm({ title: "Replace this month's budgets?", msg: `Copy ${D.monthLabel(D.addMonths(mk, -1))}'s budgets over ${D.monthLabel(mk)}.`, ok: "Copy" }))) return;
    d.budgets = d.budgets.filter((b) => b.month !== mk).concat(prev.map((b) => ({ ...b, id: GF.uid(), month: mk, isSample: false })));
    GF.store.save(); GF.toast("Copied last month's budgets");
  };
  GF.acts.budgetEdit = () => {
    const d = GF.store.data, mk = GF.budgetMonth, cur = C.budgetsFor(d, mk);
    const val = (cid) => { const b = cur.find((x) => (x.categoryId || null) === cid); return b ? GF.fromPaise(b.amount) : ""; };
    const cats = d.categories.filter((c) => c.kind !== "income");
    GF.sheet({
      title: "Budgets · " + D.monthLabel(mk),
      body: `<label class="field"><span>Overall monthly limit (₹)</span><input class="input amt" data-b="" inputmode="decimal" value="${val(null)}" placeholder="Leave empty to use the sum of categories"></label>
      <p class="small muted" style="margin:4px 4px 10px">Category limits — leave empty for no limit.</p>
      ${cats.map((c) => `<label class="field row" style="gap:10px">${GF.catIcon(c)}<span style="flex:1;margin:0;color:var(--text);font-size:15px">${esc(c.name)}</span><input class="input amt" style="width:130px" data-b="${c.id}" inputmode="decimal" value="${val(c.id)}" placeholder="—" aria-label="${esc(c.name)} limit"></label>`).join("")}
      <div class="errbox" id="be-err" hidden></div><button class="btn primary block" id="be-save">Save budgets</button>`,
      mount(el) {
        $("#be-save", el).onclick = () => {
          const out = [];
          for (const i of $$("[data-b]", el)) {
            const v = i.value.trim().replace(/,/g, "");
            if (!v) continue;
            const p = GF.toPaise(v);
            if (isNaN(parseFloat(v)) || p < 0) { const e = $("#be-err", el); e.hidden = false; e.textContent = "Budgets must be positive numbers."; return; }
            if (p > 0) out.push({ id: GF.uid(), month: mk, categoryId: i.dataset.b || null, amount: p, isSample: false });
          }
          GF.closeAll(() => { d.budgets = d.budgets.filter((b) => b.month !== mk).concat(out); GF.store.save(); GF.toast("Budgets saved"); });
        };
      },
    });
  };
})();
