/* Finance Tracker — Transactions: search, filter, sort, day groups, detail, delete + undo. */
(function () {
  const GF = window.GF, D = GF.D, esc = GF.esc, $ = GF.$, $$ = GF.$$;
  const blank = () => ({ q: "", type: "all", cats: [], accs: [], pms: [], from: "", to: "", min: "", max: "", sort: "newest" });
  GF.txState = blank();
  const SORTS = { newest: "Newest first", oldest: "Oldest first", highest: "Highest amount", lowest: "Lowest amount" };

  GF.filterTx = (st = GF.txState) => {
    const d = GF.store.data, q = st.q.trim().toLowerCase();
    const min = st.min ? GF.toPaise(st.min) : null, max = st.max ? GF.toPaise(st.max) : null;
    let out = d.transactions.filter((t) => {
      if (st.type !== "all" && t.type !== st.type) return false;
      if (st.cats.length && !st.cats.includes(t.categoryId)) return false;
      if (st.accs.length && !st.accs.includes(t.accountId) && !st.accs.includes(t.toAccountId)) return false;
      if (st.pms.length && !st.pms.includes(t.paymentMethod)) return false;
      if (!GF.calc.inRange(t, st.from, st.to)) return false;
      if (min != null && t.amount < min) return false;
      if (max != null && t.amount > max) return false;
      if (q) {
        const a = GF.acc(t.accountId), b = GF.acc(t.toAccountId);
        const hay = [t.merchant, t.note, t.type === "transfer" ? "transfer" : GF.cat(t.categoryId).name, a && a.name, b && b.name, t.paymentMethod, GF.fromPaise(t.amount)].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const s = st.sort;
    out.sort((a, b) => s === "oldest" ? (a.dateTime < b.dateTime ? -1 : 1) : s === "highest" ? b.amount - a.amount : s === "lowest" ? a.amount - b.amount : a.dateTime < b.dateTime ? 1 : -1);
    return out;
  };
  const activeCount = (st) => (st.type !== "all") + !!st.cats.length + !!st.accs.length + !!st.pms.length + !!(st.from || st.to) + !!(st.min || st.max);

  function listHTML() {
    const st = GF.txState, txs = GF.filterTx();
    if (!txs.length) return `<div class="empty glass card"><div class="e">🔍</div><p>${GF.store.data.transactions.length ? "No transactions match." : "No transactions yet. Tap + to add one."}</p>${activeCount(st) || st.q ? '<button class="btn" data-act="txClear">Clear search and filters</button>' : ""}</div>`;
    const t = GF.calc.totals(txs);
    const summary = `<p class="small muted" style="margin:4px 4px 0">${txs.length} transaction${txs.length > 1 ? "s" : ""} · <span class="inc">↑ ${GF.fmt(t.income)}</span> · <span class="exp">↓ ${GF.fmt(t.expense)}</span></p>`;
    if (st.sort === "highest" || st.sort === "lowest") return summary + `<div class="daygroup" style="margin-top:10px">${txs.map((x) => GF.txRow(x, { swipe: true, showDate: true })).join("")}</div>`;
    const groups = [];
    txs.forEach((x) => { const k = x.dateTime.slice(0, 10); const g = groups.at(-1); if (g && g.k === k) g.items.push(x); else groups.push({ k, items: [x] }); });
    return summary + groups.map((g) => {
      const tt = GF.calc.totals(g.items);
      const tot = [tt.income ? `<span class="inc">+${GF.fmt(tt.income)}</span>` : "", tt.expense ? `<span class="exp">−${GF.fmt(tt.expense)}</span>` : ""].filter(Boolean).join(" · ") || '<span>⇄ transfers</span>';
      return `<div class="dayhead"><span>${D.dayLabel(g.k)}</span><span class="amt">${tot}</span></div><div class="daygroup">${g.items.map((x) => GF.txRow(x, { swipe: true })).join("")}</div>`;
    }).join("");
  }
  GF.refreshTxList = () => { const l = $("#txlist"); if (l) l.innerHTML = listHTML(); const b = $("#fcount"); if (b) { const n = activeCount(GF.txState); b.textContent = n ? n : ""; b.hidden = !n; } };

  GF.screen("tx", {
    tab: "tx",
    title: () => "Transactions",
    render() {
      const st = GF.txState, n = activeCount(st);
      return `<header class="topbar" style="flex-wrap:wrap;padding-bottom:8px;background:linear-gradient(var(--bg) 75%,transparent)">
        <h1>Transactions</h1>
        <button class="iconbtn glass" data-act="txSort" aria-label="Sort: ${SORTS[st.sort]}">${GF.icon("sort")}</button>
        <button class="iconbtn glass" data-act="txFilter" aria-label="Filters" style="position:relative">${GF.icon("filter")}<span id="fcount" class="dir trf" style="position:absolute;top:-2px;right:-2px;width:18px;height:18px;border-radius:50%;font-size:11px;color:#fff;display:grid;place-items:center" ${n ? "" : "hidden"}>${n || ""}</span></button>
        <label class="search glass" style="flex-basis:100%">${GF.icon("search")}<span class="sr">Search transactions</span><input id="txq" type="search" placeholder="Search merchant, note, category, amount" value="${esc(st.q)}" autocomplete="off"></label>
      </header>
      ${GF.sampleBanner()}
      <div id="txlist">${listHTML()}</div>`;
    },
    mount(root) {
      let tm;
      $("#txq", root).addEventListener("input", (e) => { clearTimeout(tm); tm = setTimeout(() => { GF.txState.q = e.target.value; GF.refreshTxList(); }, 120); });
    },
  });
  GF.acts.txClear = () => { const s = GF.txState.sort; GF.txState = { ...blank(), sort: s }; GF.render(); };

  GF.acts.txSort = () => GF.sheet({
    title: "Sort by",
    body: `<div class="list" style="background:var(--glass-3)">${Object.entries(SORTS).map(([k, v]) => `<button class="item" data-sort="${k}" aria-pressed="${GF.txState.sort === k}"><span class="meta"><span class="t">${v}</span></span>${GF.txState.sort === k ? "✓" : ""}</button>`).join("")}</div>`,
    mount(el) { $$("[data-sort]", el).forEach((b) => (b.onclick = () => { GF.txState.sort = b.dataset.sort; GF.closeSheet(); GF.refreshTxList(); })); },
  });

  const chipSet = (name, items, sel) => `<div class="chips" data-group="${name}">${items.map(([v, l]) => `<button class="chip" data-v="${esc(v)}" aria-pressed="${sel.includes(v)}">${l}</button>`).join("")}</div>`;
  GF.acts.txFilter = () => {
    const d = GF.store.data, st = JSON.parse(JSON.stringify(GF.txState));
    GF.sheet({
      title: "Filters",
      body: `<label class="field"><span>Type</span></label><div class="seg type" data-group="type" style="margin-bottom:14px">${[["all", "All"], ["income", "↑ Income"], ["expense", "↓ Expense"], ["transfer", "⇄ Transfer"]].map(([v, l]) => `<button data-v="${v}" aria-pressed="${st.type === v}">${l}</button>`).join("")}</div>
      <label class="field"><span>Category</span></label>${chipSet("cats", d.categories.map((c) => [c.id, c.icon + " " + esc(c.name)]), st.cats)}
      <label class="field" style="margin-top:14px"><span>Account</span></label>${chipSet("accs", d.accounts.map((a) => [a.id, a.icon + " " + esc(a.name)]), st.accs)}
      <label class="field" style="margin-top:14px"><span>Payment method</span></label>${chipSet("pms", GF.PAYMENT_METHODS.map((p) => [p, p]), st.pms)}
      <div class="grid2" style="margin-top:14px"><label class="field"><span>From date</span><input class="input" type="date" id="f-from" value="${st.from}"></label><label class="field"><span>To date</span><input class="input" type="date" id="f-to" value="${st.to}"></label></div>
      <div class="grid2"><label class="field"><span>Min amount (₹)</span><input class="input" inputmode="decimal" id="f-min" value="${esc(st.min)}" placeholder="0"></label><label class="field"><span>Max amount (₹)</span><input class="input" inputmode="decimal" id="f-max" value="${esc(st.max)}" placeholder="Any"></label></div>
      <div class="grid2" style="margin-top:6px"><button class="btn" id="f-reset">Reset</button><button class="btn primary" id="f-apply">Show results</button></div>`,
      mount(el) {
        $$('[data-group="type"] button', el).forEach((b) => (b.onclick = () => { st.type = b.dataset.v; $$('[data-group="type"] button', el).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
        ["cats", "accs", "pms"].forEach((g) => $$(`[data-group="${g}"] .chip`, el).forEach((b) => (b.onclick = () => {
          const v = b.dataset.v, on = st[g].includes(v);
          st[g] = on ? st[g].filter((x) => x !== v) : [...st[g], v];
          b.setAttribute("aria-pressed", !on);
        })));
        $("#f-reset", el).onclick = () => { GF.txState = { ...blank(), q: GF.txState.q, sort: GF.txState.sort }; GF.closeSheet(); GF.refreshTxList(); };
        $("#f-apply", el).onclick = () => {
          Object.assign(st, { from: $("#f-from", el).value, to: $("#f-to", el).value, min: $("#f-min", el).value.trim(), max: $("#f-max", el).value.trim() });
          GF.txState = st; GF.closeSheet(); GF.refreshTxList();
        };
      },
    });
  };

  /* Detail sheet */
  GF.acts.txDetail = (el) => {
    const t = GF.store.get("transactions", el.dataset.id);
    if (!t) return;
    const [cls, sign, label] = GF.signOf(t);
    const a = GF.acc(t.accountId), b = GF.acc(t.toAccountId), c = GF.cat(t.categoryId);
    const row = (k, v) => (v ? `<div class="item" style="min-height:48px"><span class="meta s">${k}</span><span class="r" style="font-weight:600">${v}</span></div>` : "");
    GF.sheet({
      title: label,
      body: `<div class="amountbox"><div class="v amt ${cls}">${sign}${GF.fmt(t.amount)}</div><p class="muted" style="margin:4px 0 0">${esc(GF.txTitle(t))}${t.isSample ? ' <span class="demo">Demo</span>' : ""}</p></div>
      <div class="list" style="background:var(--glass-3)">
        ${t.type === "transfer" ? row("From", esc(a ? a.name : "Deleted account")) + row("To", esc(b ? b.name : "Deleted account")) : row("Category", c.icon + " " + esc(c.name)) + row("Account", esc(a ? a.name : "Deleted account"))}
        ${row("Date", D.dayLabel(t.dateTime.slice(0, 10)) + ", " + D.time(t.dateTime))}
        ${row("Merchant", esc(t.merchant))}${row("Payment method", esc(t.paymentMethod))}${row("Note", esc(t.note))}
      </div>
      <div class="grid2"><button class="btn" data-act="txEdit" data-id="${t.id}">${GF.icon("edit")} Edit</button><button class="btn danger" data-act="txDelete" data-id="${t.id}">${GF.icon("trash")} Delete</button></div>`,
    });
  };
  GF.acts.txEdit = (el) => {
    const id = el.dataset.id;
    GF.closeAll(() => GF.openAdd({ id }));
  };
  GF.deleteTx = async (id) => {
    const t = GF.store.get("transactions", id);
    if (!t) return;
    GF.closeAll(async () => {
      const ok = await GF.confirm({ title: "Delete transaction?", msg: `${esc(GF.txTitle(t))} · ${GF.fmt(t.amount, { force: true })}. You can undo this for a few seconds.`, ok: "Delete", danger: true });
      if (!ok) return GF.closeSwipes();
      const removed = GF.store.remove("transactions", id);
      GF.haptic(15);
      GF.toast("Transaction deleted", { undo: () => GF.store.upsert("transactions", removed) });
    });
  };
  GF.acts.txDelete = (el) => GF.deleteTx(el.dataset.id);
})();
