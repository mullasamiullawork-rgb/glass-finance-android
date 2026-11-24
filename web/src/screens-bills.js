/* Glass Finance — Bills: due-state tabs, mark as paid (real expense + roll to next due date), add/edit/delete. */
(function () {
  const GF = window.GF, D = GF.D, C = GF.calc, esc = GF.esc, $ = GF.$, $$ = GF.$$;
  const REPEAT = { none: "One-time", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };
  const TABS = [["upcoming", "Upcoming"], ["due", "Due today"], ["overdue", "Overdue"], ["paid", "Paid"]];
  const BADGE = { upcoming: "", due: "warning", overdue: "over", paid: "ok" };
  let tab = "upcoming";
  const amtOk = (v) => { v = String(v).trim().replace(/,/g, ""); const n = parseFloat(v); return v && !isNaN(n) && n > 0 ? GF.toPaise(v) : 0; };

  /** Next due date for a recurring bill, keeping the day of month where it exists. */
  GF.nextDue = (iso, repeat) => {
    if (repeat === "weekly") return D.addDays(iso, 7);
    const n = repeat === "yearly" ? 12 : repeat === "monthly" ? 1 : 0;
    if (!n) return iso;
    const mk = D.addMonths(D.month(iso), n), end = D.monthEnd(mk);
    const day = mk + "-" + iso.slice(8, 10);
    return day > end ? end : day;
  };
  const isPaidRow = (b) => b.paid || !!b.lastPaid;
  const stateOf = (b) => C.billStatus(b).state;

  function row(b, inPaid) {
    const st = inPaid ? { state: "paid", label: "Paid " + D.short(b.paid ? b.paidOn || b.dueDate : b.lastPaid) } : C.billStatus(b);
    const cat = GF.cat(b.categoryId), a = GF.acc(b.accountId);
    const icon = { upcoming: "", due: "! ", overdue: "⚠ ", paid: "✓ " }[st.state];
    return `<div class="item" style="flex-wrap:wrap;row-gap:10px">${GF.catIcon(cat)}
      <span class="meta"><span class="t">${esc(b.name)}${b.isSample ? '<span class="demo">Demo</span>' : ""}</span><span class="s">${inPaid && !b.paid ? "Next due " : "Due "}${D.short(b.dueDate)} · ${REPEAT[b.repeat || "none"]}${b.autopay ? " · Autopay" : ""}${a ? " · " + esc(a.name) : ""}</span></span>
      <span class="r" style="text-align:right"><span class="amt" style="display:block;font-weight:700">${GF.fmt(b.amount)}</span><span class="badge ${BADGE[st.state]}">${icon}${st.label}</span></span>
      <span class="row" style="flex-basis:100%;gap:8px;justify-content:flex-end">
        ${!b.paid && !inPaid ? `<button class="btn primary" data-act="billPay" data-id="${b.id}">Mark as paid</button>` : ""}
        <button class="btn" data-act="billEdit" data-id="${b.id}" aria-label="Edit ${esc(b.name)}">${GF.icon("edit")} Edit</button></span></div>`;
  }

  GF.screen("bills", {
    tab: "more",
    title: () => "Bills",
    render() {
      const bills = GF.store.data.bills.slice();
      const by = { upcoming: [], due: [], overdue: [], paid: [] };
      bills.forEach((b) => { if (!b.paid) by[stateOf(b)].push(b); if (isPaidRow(b)) by.paid.push(b); });
      ["upcoming", "due", "overdue"].forEach((k) => by[k].sort((x, y) => (x.dueDate < y.dueDate ? -1 : 1)));
      by.paid.sort((x, y) => ((x.paidOn || x.lastPaid || "") < (y.paidOn || y.lastPaid || "") ? 1 : -1));
      const list = by[tab];
      const owed = [...by.due, ...by.overdue].reduce((s, b) => s + b.amount, 0);
      const month = by.upcoming.filter((b) => D.diffDays(D.today(), b.dueDate) <= 30).reduce((s, b) => s + b.amount, 0);
      const empty = { upcoming: "Nothing coming up.", due: "Nothing due today.", overdue: "Nothing overdue. Nice.", paid: "No bills paid yet." }[tab];
      return `${GF.topbar("Bills", { back: true, right: `<button class="iconbtn glass" data-act="billEdit" aria-label="Add bill">${GF.icon("plus")}</button>` })}
      <section class="hero glass"><div class="lbl">Due now</div><div class="big amt ${owed ? "exp" : ""}">${GF.fmt(owed)}</div>
        <div class="grid2"><div class="kpi"><span>Overdue</span><b>${by.overdue.length}</b></div><div class="kpi"><span>Next 30 days</span><b class="amt">${GF.fmt(month)}</b></div></div></section>
      <div class="seg" role="group" aria-label="Bill status" style="margin:12px 0">${TABS.map(([k, l]) => `<button data-act="billTab" data-v="${k}" aria-pressed="${tab === k}">${l}${by[k].length ? ` (${by[k].length})` : ""}</button>`).join("")}</div>
      ${list.length ? `<div class="list glass">${list.map((b) => row(b, tab === "paid")).join("")}</div>`
        : `<div class="empty glass card"><div class="e">🧾</div><p>${bills.length ? empty : "No bills yet. Add rent, phone, internet or fees to see what's due."}</p>${bills.length ? "" : '<button class="btn primary" data-act="billEdit">Add a bill</button>'}</div>`}`;
    },
  });
  GF.acts.billTab = (el) => { tab = el.dataset.v; GF.haptic(); GF.render(); };

  GF.acts.billPay = (el) => {
    const b = GF.store.get("bills", el.dataset.id);
    if (!b) return;
    const accs = GF.store.data.accounts.filter((a) => !a.archived);
    let accId = (accs.find((a) => a.id === b.accountId) || accs[0] || {}).id;
    const rec = b.repeat && b.repeat !== "none";
    GF.closeAll(() => GF.sheet({
      title: "Pay " + b.name,
      body: `<p class="amt" style="font-size:28px;font-weight:700;margin:0 4px 4px">${GF.fmt(b.amount)}</p>
      <p class="small muted" style="margin:0 4px 12px">Due ${D.short(b.dueDate)}. Records an expense${rec ? ` and moves the bill to ${D.short(GF.nextDue(b.dueDate, b.repeat))}` : ""}.</p>
      <label class="field"><span>Pay from</span></label><div class="chips" id="bp-acc" style="margin-bottom:12px">${accs.map((a) => `<button class="chip" data-v="${a.id}" aria-pressed="${a.id === accId}">${a.icon} ${esc(a.name)}</button>`).join("")}</div>
      <label class="field"><span>Paid on</span><input class="input" type="date" id="bp-date" value="${D.today()}" max="${D.today()}"></label>
      <div class="errbox" id="bp-err" hidden></div>
      <button class="btn primary block" id="bp-ok">Mark as paid</button>`,
      mount(sh) {
        $$("#bp-acc .chip", sh).forEach((x) => (x.onclick = () => { accId = x.dataset.v; $$("#bp-acc .chip", sh).forEach((y) => y.setAttribute("aria-pressed", y === x)); }));
        $("#bp-ok", sh).onclick = () => {
          const date = $("#bp-date", sh).value || D.today();
          if (!accId) { const e = $("#bp-err", sh); e.hidden = false; e.textContent = "Add an account first."; return; }
          const acc = GF.acc(accId);
          const tx = { type: "expense", amount: b.amount, accountId: accId, toAccountId: null, categoryId: b.categoryId || "cat_bills", dateTime: date + "T" + (date === D.today() ? D.isoDT(new Date()).slice(11) : "12:00"), merchant: b.name, note: "Bill due " + b.dueDate, paymentMethod: acc && acc.type === "cash" ? "Cash" : acc && acc.type === "credit" ? "Credit Card" : acc && acc.type === "wallet" ? "Wallet" : "UPI", billId: b.id, isSample: false };
          GF.closeAll(() => {
            GF.store.upsert("transactions", tx, true);
            b.lastPaid = date; b.lastTxId = tx.id; b.accountId = accId;
            if (rec) b.dueDate = GF.nextDue(b.dueDate, b.repeat); else { b.paid = true; b.paidOn = date; }
            GF.store.upsert("bills", b);
            (GF.hooks.afterTxSave || []).forEach((f) => f(tx));
            GF.haptic(12);
            GF.toast(rec ? `Paid · next due ${D.short(b.dueDate)}` : `${b.name} paid`);
          });
        };
      },
    }));
  };

  GF.acts.billEdit = (el) => {
    const ex = el.dataset.id ? GF.store.get("bills", el.dataset.id) : null;
    const d = GF.store.data, accs = d.accounts.filter((a) => !a.archived);
    const s = ex ? { ...ex } : { name: "", amount: 0, dueDate: D.addDays(D.today(), 7), repeat: "monthly", categoryId: "cat_bills", accountId: (accs[0] || {}).id, paid: false, autopay: false };
    const cats = d.categories.filter((c) => c.kind !== "income");
    const pick = (id, opts) => `<div class="chips" id="${id}" style="margin-bottom:12px">${opts.map(([v, l, on]) => `<button class="chip" data-v="${v}" aria-pressed="${on}">${l}</button>`).join("")}</div>`;
    GF.closeAll(() => GF.sheet({
      title: ex ? "Edit bill" : "New bill",
      body: `<label class="field"><span>Name</span><input class="input" id="bl-name" value="${esc(s.name)}" placeholder="e.g. Electricity" maxlength="40" autofocus></label>
      <label class="field"><span>Amount (₹)</span><input class="input amt" id="bl-amt" inputmode="decimal" value="${s.amount ? GF.fromPaise(s.amount) : ""}" placeholder="e.g. 799"></label>
      <label class="field"><span>Due date</span><input class="input" type="date" id="bl-date" value="${s.dueDate}"></label>
      <label class="field"><span>Repeats</span></label>${pick("bl-rep", Object.entries(REPEAT).map(([k, l]) => [k, l, (s.repeat || "none") === k]))}
      <label class="field"><span>Category</span></label>${pick("bl-cat", cats.map((c) => [c.id, c.icon + " " + esc(c.name), s.categoryId === c.id]))}
      <label class="field"><span>Usually paid from</span></label>${pick("bl-acc", accs.map((a) => [a.id, a.icon + " " + esc(a.name), s.accountId === a.id]))}
      ${ex && ex.paid ? `<p class="small muted" style="margin:0 4px 12px">Marked paid. Saving with a new due date makes it unpaid again.</p>` : ""}
      <div class="errbox" id="bl-err" hidden></div>
      <button class="btn primary block" id="bl-save">${ex ? "Save changes" : "Add bill"}</button>
      ${ex ? `<button class="btn block" id="bl-del" style="margin-top:10px;color:var(--expense)">${GF.icon("trash")} Delete bill</button>` : ""}`,
      mount(sh) {
        [["rep", "repeat"], ["cat", "categoryId"], ["acc", "accountId"]].forEach(([k, f]) => $$(`#bl-${k} .chip`, sh).forEach((b) => (b.onclick = () => { s[f] = b.dataset.v; $$(`#bl-${k} .chip`, sh).forEach((x) => x.setAttribute("aria-pressed", x === b)); })));
        $("#bl-save", sh).onclick = () => {
          const e = $("#bl-err", sh), fail = (m) => { e.hidden = false; e.textContent = m; GF.haptic(30); };
          s.name = $("#bl-name", sh).value.trim();
          s.amount = amtOk($("#bl-amt", sh).value);
          const nd = $("#bl-date", sh).value;
          if (!s.name) return fail("Give the bill a name.");
          if (!s.amount) return fail("Amount must be a number above zero.");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(nd)) return fail("Choose a due date.");
          if (ex && ex.paid && nd !== ex.dueDate) { s.paid = false; delete s.paidOn; }
          s.dueDate = nd;
          GF.closeAll(() => { GF.store.upsert("bills", s); GF.toast(ex ? "Bill updated" : "Bill added"); });
        };
        if (ex) $("#bl-del", sh).onclick = () => GF.closeAll(async () => {
          const ok = await GF.confirm({ title: `Delete ${esc(ex.name)}?`, msg: "Payments already recorded stay in your transactions.", ok: "Delete bill", danger: true });
          if (!ok) return;
          const removed = GF.store.remove("bills", ex.id);
          GF.toast("Bill deleted", { undo: () => GF.store.upsert("bills", removed) });
        });
      },
    }));
  };
})();
