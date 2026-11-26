/* Finance Tracker — Quick Add / Edit transaction sheet. */
(function () {
  const GF = window.GF, D = GF.D, esc = GF.esc, $ = GF.$, $$ = GF.$$;
  const TYPES = [["income", "↑ Income"], ["expense", "↓ Expense"], ["transfer", "⇄ Transfer"]];
  const pmFor = (a) => (!a ? "UPI" : { cash: "Cash", wallet: "UPI", credit: "Credit Card", bank: "UPI", savings: "Net Banking" }[a.type] || "UPI");

  GF.openAdd = (opts = {}) => {
    const d = GF.store.data;
    const live = d.accounts.filter((a) => !a.archived);
    if (!live.length) {
      return GF.sheet({ title: "Add an account first", body: `<p class="muted">Transactions belong to an account, like Cash or your bank.</p><button class="btn primary block" data-act="accountEdit">Add account</button>` });
    }
    const editing = opts.id ? GF.store.get("transactions", opts.id) : null;
    const lastAcc = live.find((a) => a.id === d.settings.lastAccountId) || live[0];
    const s = editing
      ? { ...editing, amountStr: GF.fromPaise(editing.amount) }
      : { type: opts.type || "expense", amountStr: "", categoryId: null, accountId: lastAcc.id, toAccountId: null, dateTime: D.isoDT(new Date()), merchant: "", note: "", paymentMethod: pmFor(lastAcc) };
    let dupOk = false, err = "", warn = "";
    const cats = () => d.categories.filter((c) => c.kind === "both" || c.kind === s.type);
    const accChips = (key, exclude) => `<div class="chips scroll" data-acc="${key}">${live.map((a) => `<button class="chip" data-v="${a.id}" aria-pressed="${s[key] === a.id}" ${exclude === a.id ? 'aria-disabled="true" style="opacity:.4"' : ""}>${a.icon} ${esc(a.name)}</button>`).join("")}</div>`;
    const day = s.dateTime.slice(0, 10);

    function body() {
      const sign = s.type === "income" ? ["inc", "+"] : s.type === "expense" ? ["exp", "−"] : ["trf", "⇄ "];
      const today = D.today(), yest = D.addDays(today, -1), cur = s.dateTime.slice(0, 10);
      return `<div class="seg type" role="group" aria-label="Type">${TYPES.map(([v, l]) => `<button data-v="${v}" aria-pressed="${s.type === v}">${l}</button>`).join("")}</div>
      <div class="amountbox" aria-live="polite"><div class="v amt ${sign[0]}" id="qa-amt">${sign[1]}₹${s.amountStr ? Number(s.amountStr.split(".")[0]).toLocaleString("en-IN") + (s.amountStr.includes(".") ? "." + s.amountStr.split(".")[1] : "") : "0"}</div></div>
      ${!editing ? `<div class="chips scroll" id="qa-quick" aria-label="Quick amounts" style="margin:-4px 0 10px">${[20, 50, 100, 200, 500, 1000].map((v) => `<button class="chip" data-q="${v}">₹${v.toLocaleString("en-IN")}</button>`).join("")}</div>` : ""}
      <div class="keypad" role="group" aria-label="Amount keypad">${["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => `<button data-k="${k}" aria-label="${k === "⌫" ? "Delete digit" : k === "." ? "Decimal point" : k}">${k}</button>`).join("")}</div>
      ${s.type === "transfer"
        ? `<label class="field"><span>From</span></label>${accChips("accountId")}<label class="field" style="margin-top:12px"><span>To</span></label>${accChips("toAccountId", s.accountId)}`
        : `<label class="field"><span>Category</span></label><div class="catgrid">${cats().map((c) => `<button data-cat="${c.id}" aria-pressed="${s.categoryId === c.id}">${GF.catIcon(c)}<span>${esc(c.name)}</span></button>`).join("")}</div>
           <label class="field" style="margin-top:12px"><span>Account</span></label>${accChips("accountId")}`}
      <label class="field" style="margin-top:14px"><span>Date and time</span><input class="input" type="datetime-local" id="qa-dt" value="${s.dateTime}" max="${D.isoDT(new Date(Date.now() + 864e5 * 366))}"></label>
      <div class="chips" style="margin:-4px 0 12px"><button class="chip" data-day="${today}" aria-pressed="${cur === today}">Today</button><button class="chip" data-day="${yest}" aria-pressed="${cur === yest}">Yesterday</button></div>
      <label class="field"><span>${s.type === "income" ? "Source" : s.type === "transfer" ? "Description" : "Merchant"}</span><input class="input" id="qa-merchant" value="${esc(s.merchant)}" placeholder="${s.type === "income" ? "e.g. Allowance" : s.type === "transfer" ? "e.g. ATM withdrawal" : "e.g. Swiggy"}" autocomplete="off" maxlength="60"></label>
      ${(() => { const rec = GF.recentMerchants ? GF.recentMerchants(s.type) : []; return rec.length && !editing ? `<div class="chips scroll" id="qa-recent" aria-label="Recent" style="margin:-4px 0 12px">${rec.map((r) => `<button class="chip" data-m="${esc(r.merchant)}" data-c="${r.categoryId || ""}">${esc(r.merchant)}</button>`).join("")}</div>` : ""; })()}
      <label class="field"><span>Payment method</span></label><div class="chips" style="margin-bottom:12px" id="qa-pm">${GF.PAYMENT_METHODS.map((p) => `<button class="chip" data-v="${p}" aria-pressed="${s.paymentMethod === p}">${p}</button>`).join("")}</div>
      <label class="field"><span>Note</span><input class="input" id="qa-note" value="${esc(s.note)}" placeholder="Optional" maxlength="200"></label>
      ${err ? `<div class="errbox" role="alert">${err}</div>` : ""}${warn ? `<div class="warnbox" role="alert">${warn}</div>` : ""}
      <button class="btn primary block" id="qa-save" style="min-height:52px;font-size:17px">${dupOk ? "Save anyway" : editing ? "Save changes" : "Save"}</button>`;
    }
    function readInputs(el) {
      s.dateTime = $("#qa-dt", el).value || s.dateTime;
      s.merchant = $("#qa-merchant", el).value.trim();
      s.note = $("#qa-note", el).value.trim();
    }
    function setAmount(el) {
      const sign = s.type === "income" ? "+" : s.type === "expense" ? "−" : "⇄ ";
      const [i, f] = s.amountStr.split(".");
      $("#qa-amt", el).textContent = sign + "₹" + (s.amountStr ? Number(i || 0).toLocaleString("en-IN") + (f !== undefined ? "." + f : "") : "0");
    }
    function key(k, el) {
      let v = s.amountStr;
      if (k === "⌫" || k === "Backspace") v = v.slice(0, -1);
      else if (k === ".") { if (!v.includes(".")) v = (v || "0") + "."; }
      else if (/^\d$/.test(k)) {
        if (v.includes(".") && v.split(".")[1].length >= 2) return;
        if (!v.includes(".") && v.replace(/^0+/, "").length >= 9) return;
        v = v === "0" ? k : v + k;
      }
      s.amountStr = v; dupOk = false; setAmount(el); GF.haptic(4);
    }
    function draw(el) {
      const sb = $(".sbody", el), y = sb.scrollTop;
      sb.innerHTML = body();
      sb.scrollTop = y;
      $$(".seg button", sb).forEach((b) => (b.onclick = () => {
        readInputs(el); s.type = b.dataset.v; err = warn = ""; dupOk = false;
        if (s.type !== "transfer" && s.categoryId && !cats().some((c) => c.id === s.categoryId)) s.categoryId = null;
        if (s.type === "transfer") { s.categoryId = null; if (!s.toAccountId || s.toAccountId === s.accountId) s.toAccountId = (live.find((a) => a.id !== s.accountId) || {}).id || null; }
        draw(el);
      }));
      $$("[data-k]", sb).forEach((b) => (b.onclick = () => key(b.dataset.k, el)));
      $$("#qa-quick [data-q]", sb).forEach((b) => (b.onclick = () => { s.amountStr = b.dataset.q; dupOk = false; setAmount(el); GF.haptic(6); }));
      $$("#qa-recent [data-m]", sb).forEach((b) => (b.onclick = () => { readInputs(el); s.merchant = b.dataset.m; if (b.dataset.c && cats().some((c) => c.id === b.dataset.c)) s.categoryId = b.dataset.c; GF.haptic(); draw(el); }));
      $$("[data-cat]", sb).forEach((b) => (b.onclick = () => { readInputs(el); s.categoryId = b.dataset.cat; err = ""; GF.haptic(); draw(el); }));
      $$("[data-acc] .chip", sb).forEach((b) => (b.onclick = () => {
        const k = b.parentElement.dataset.acc;
        if (b.getAttribute("aria-disabled") === "true") return;
        readInputs(el); s[k] = b.dataset.v;
        if (k === "accountId" && s.type !== "transfer") s.paymentMethod = pmFor(GF.acc(s.accountId));
        if (k === "accountId" && s.type === "transfer" && s.toAccountId === s.accountId) s.toAccountId = (live.find((a) => a.id !== s.accountId) || {}).id || null;
        err = ""; draw(el);
      }));
      $$("[data-day]", sb).forEach((b) => (b.onclick = () => { readInputs(el); s.dateTime = b.dataset.day + "T" + (s.dateTime.slice(11, 16) || "12:00"); draw(el); }));
      $$("#qa-pm .chip", sb).forEach((b) => (b.onclick = () => { s.paymentMethod = b.dataset.v; $$("#qa-pm .chip", sb).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
      $("#qa-save", sb).onclick = () => save(el);
    }
    function save(el) {
      readInputs(el);
      const amount = GF.toPaise(s.amountStr);
      err = warn = "";
      if (!amount || amount <= 0) err = "Enter an amount above ₹0.";
      else if (!GF.acc(s.accountId)) err = "Choose an account.";
      else if (s.type !== "transfer" && !s.categoryId) err = "Choose a category.";
      else if (s.type === "transfer" && !s.toAccountId) err = "Choose the account to transfer to.";
      else if (s.type === "transfer" && s.toAccountId === s.accountId) err = "From and To accounts must be different.";
      else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s.dateTime)) err = "Choose a valid date and time.";
      const tx = {
        id: editing ? editing.id : undefined, type: s.type, amount, accountId: s.accountId,
        toAccountId: s.type === "transfer" ? s.toAccountId : null, categoryId: s.type === "transfer" ? null : s.categoryId,
        dateTime: s.dateTime.slice(0, 16), merchant: s.merchant, note: s.note, paymentMethod: s.paymentMethod,
        isSample: editing ? !!editing.isSample : false, createdAt: editing && editing.createdAt,
        ...(editing ? { source: editing.source, auto: editing.auto, billId: editing.billId, recurringId: editing.recurringId } : {}),
      };
      if (!err && !dupOk) {
        const dup = GF.calc.isDuplicate(GF.store.data, tx);
        if (dup) { warn = `Possible duplicate: a ${GF.fmt(dup.amount, { force: true })} ${dup.type} on the same account and category within 2 minutes (${D.time(dup.dateTime)}).`; dupOk = true; }
      }
      if (err || warn) { draw(el); GF.haptic(30); const b = $(".errbox,.warnbox", el); b && b.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      GF.store.data.settings.lastAccountId = s.accountId;
      GF.closeAll(() => {
        GF.store.upsert("transactions", tx);
        GF.haptic(12);
        GF.toast(`${editing ? "Updated" : "Saved"} ${s.type} of ${GF.fmt(amount, { force: true })}`);
        (GF.hooks.afterTxSave || []).forEach((f) => f(tx));
      });
    }
    GF.sheet({
      title: editing ? "Edit transaction" : "Add transaction",
      body: "",
      mount(el) {
        draw(el);
        el.addEventListener("keydown", (e) => {
          if (e.target.matches("input,textarea")) return;
          if (/^[\d.]$/.test(e.key) || e.key === "Backspace") { e.preventDefault(); key(e.key, el); }
        });
      },
    });
  };
  GF.acts.add = () => GF.openAdd();
})();
