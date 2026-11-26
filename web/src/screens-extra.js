/* Glass Finance — Savings, Recurring (engine + screen), Insights, offline Assistant, global Search,
   PIN lock, encrypted backup, PDF summary, notification/security settings, providers, self-test. */
(function () {
  const GF = window.GF, D = GF.D, C = GF.calc, esc = GF.esc, $ = GF.$, $$ = GF.$$;
  const mkNow = () => D.month(D.today());
  const monthTotals = (mk) => C.totals(GF.store.data.transactions, D.monthStart(mk), D.monthEnd(mk));
  const bars = (vals, labels, cls = "") => {
    const max = Math.max(1, ...vals.map(Math.abs)), w = 300, h = 120, bw = w / vals.length;
    return `<svg viewBox="0 0 ${w} ${h + 18}" class="chart ${cls}" role="img" aria-label="Bar chart">${vals.map((v, i) => { const bh = Math.max(2, (Math.abs(v) / max) * h); return `<rect x="${i * bw + bw * 0.18}" y="${h - bh}" width="${bw * 0.64}" height="${bh}" rx="6" fill="${v < 0 ? "var(--expense)" : "var(--accent, #6366f1)"}" opacity=".85"><title>${labels[i]}: ${GF.fmt(v, { force: true })}</title></rect><text x="${i * bw + bw / 2}" y="${h + 14}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".6">${labels[i]}</text>`; }).join("")}</svg>`;
  };

  /* ================= SAVINGS ================= */
  GF.screen("savings", {
    tab: "more", title: () => "Savings",
    render() {
      const d = GF.store.data, b = C.balances(d), mk = mkNow();
      const inSavings = d.accounts.filter((a) => !a.archived && a.type === "savings").reduce((s, a) => s + b[a.id], 0);
      const goalSaved = d.goals.reduce((s, g) => s + C.goalProgress(g).saved, 0);
      const cur = monthTotals(mk), prev = monthTotals(D.addMonths(mk, -1));
      const months = [...Array(6)].map((_, i) => D.addMonths(mk, i - 5));
      const hist = months.map((m) => monthTotals(m).savings);
      const lines = [];
      if (prev.income || prev.expense) { const diff = cur.savings - prev.savings; lines.push(diff === 0 ? "You saved the same as last month." : `You saved ${GF.fmt(Math.abs(diff), { force: true })} ${diff > 0 ? "more" : "less"} this month than last month.`); }
      if (cur.rate != null) lines.push(`You've saved ${GF.pct(cur.rate)} of your income this month.`);
      const avg = hist.slice(0, 5).filter((x, i) => { const t = monthTotals(months[i]); return t.income || t.expense; });
      if (avg.length >= 2) lines.push(`Your average monthly savings over the previous ${avg.length} months was ${GF.fmt(Math.round(avg.reduce((s, x) => s + x, 0) / avg.length), { force: true })}.`);
      return `${GF.topbar("Savings", { back: true })}
      <section class="hero glass"><div class="lbl">In savings accounts</div><div class="big amt">${GF.fmt(inSavings)}</div>
        <div class="kpis"><div class="kpi"><span>Saved this month</span><b class="amt ${cur.savings < 0 ? "exp" : "inc"}">${GF.fmt(cur.savings)}</b></div><div class="kpi"><span>Savings rate</span><b>${cur.rate == null ? "—" : GF.pct(cur.rate)}</b></div><div class="kpi"><span>Put towards goals</span><b class="amt">${GF.fmt(goalSaved)}</b></div></div>
        <p class="tiny muted" style="margin-top:8px">Saved = income − expenses (transfers excluded). Goal money is tracked separately and isn't added to account totals.</p></section>
      ${lines.length ? `<div class="list glass" style="margin-top:12px">${lines.map((l) => `<div class="item"><span class="cat" style="background:var(--glass-3)">💬</span><span class="meta"><span class="t" style="white-space:normal">${l}</span></span></div>`).join("")}</div>` : `<div class="card glass"><p class="muted">Not enough data yet — add income and expenses to see savings trends.</p></div>`}
      <h2 class="h2">Last 6 months</h2><div class="card glass chartbox">${bars(hist, months.map((m) => D.monthLabel(m, true)))}</div>
      <h2 class="h2">Goals <a href="#/goals">Manage</a></h2>
      ${d.goals.length ? `<div class="list glass">${d.goals.map((g) => { const p = C.goalProgress(g); return `<a class="item" href="#/goals" style="text-decoration:none;color:inherit;flex-wrap:wrap"><span class="meta"><span class="t">${esc(g.name)}</span><span class="s">${GF.fmt(p.saved)} of ${GF.fmt(g.target)}</span></span><span class="r">${GF.pct(p.pct)}</span><div style="flex-basis:100%">${GF.bar(p.pct, p.done ? "ok" : "ok")}</div></a>`; }).join("")}</div>` : `<div class="card glass"><p class="muted">No goals yet.</p></div>`}`;
    },
  });

  /* ================= RECURRING ================= */
  const FREQ = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly", custom: "Custom" };
  GF.nextRecurring = (iso, r) => {
    const n = Math.max(1, r.interval || 1);
    if (r.frequency === "daily") return D.addDays(iso, 1);
    if (r.frequency === "weekly") return D.addDays(iso, 7);
    if (r.frequency === "custom") return r.unit === "months" ? GF.nextDue(iso, "monthly").replace(/^.{7}/, D.addMonths(D.month(iso), n)) : D.addDays(iso, (r.unit === "weeks" ? 7 : 1) * n);
    return GF.nextDue(iso, r.frequency === "yearly" ? "yearly" : "monthly");
  };
  /** Posts due auto-post occurrences up to today. Idempotent: each occurrence has a deterministic id. */
  GF.runRecurring = (data = GF.store.data, today = D.today()) => {
    let posted = 0;
    for (const r of data.recurring) {
      if (!r.active || !r.autoPost || !r.nextDate) continue;
      let guard = 0;
      while (r.nextDate <= today && (!r.endDate || r.nextDate <= r.endDate) && guard++ < 400) {
        const id = "rec_" + r.id + "_" + r.nextDate;
        if (!data.transactions.some((t) => t.id === id) && !(r.skipped || []).includes(r.nextDate)) {
          data.transactions.push({ id, type: r.type, amount: r.amount, accountId: r.accountId, toAccountId: r.type === "transfer" ? r.toAccountId : null, categoryId: r.type === "transfer" ? null : r.categoryId, dateTime: r.nextDate + "T09:00", merchant: r.name, note: "Recurring", paymentMethod: "UPI", recurringId: r.id, isSample: !!r.isSample, createdAt: new Date().toISOString() });
          posted++;
        }
        r.nextDate = GF.nextRecurring(r.nextDate, r);
      }
    }
    return posted;
  };
  GF.hooks.boot.push(() => { const n = GF.runRecurring(); if (n) { GF.store.save(true); setTimeout(() => GF.toast(`${n} recurring transaction${n > 1 ? "s" : ""} posted`), 900); } });
  GF.hooks.resume = GF.hooks.resume || [];
  GF.hooks.resume.push(() => { if (GF.runRecurring()) GF.store.save(); });

  GF.screen("recurring", {
    tab: "more", title: () => "Recurring",
    render() {
      const d = GF.store.data, list = [...d.recurring].sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
      const soon = list.filter((r) => r.active && !r.autoPost && r.nextDate <= D.addDays(D.today(), 7));
      const row = (r) => { const cls = r.type === "income" ? "inc" : r.type === "expense" ? "exp" : "trf"; return `<div class="item" style="flex-wrap:wrap;row-gap:8px">${GF.catIcon(r.type === "transfer" ? { icon: "⇄", color: "#3b82f6" } : GF.cat(r.categoryId), cls)}<span class="meta"><span class="t">${esc(r.name)}${r.isSample ? '<span class="demo">Demo</span>' : ""}</span><span class="s">${r.frequency === "custom" ? "Every " + r.interval + " " + r.unit : FREQ[r.frequency]} · next ${D.short(r.nextDate)}${r.active ? "" : " · Paused"}${r.autoPost ? " · Auto-post" : ""}</span></span><span class="r amt ${cls}">${r.type === "income" ? "+" : r.type === "expense" ? "−" : ""}${GF.fmt(r.amount)}</span>
        <span class="row" style="flex-basis:100%;gap:8px;justify-content:flex-end">${!r.autoPost && r.active ? `<button class="btn sm primary" data-act="recPost" data-id="${r.id}">Post now</button><button class="btn sm" data-act="recSkip" data-id="${r.id}">Skip</button>` : ""}<button class="btn sm" data-act="recEdit" data-id="${r.id}">${GF.icon("edit")} Edit</button></span></div>`; };
      return `${GF.topbar("Recurring", { back: true, right: `<button class="iconbtn glass" data-act="recEdit" aria-label="Add recurring">${GF.icon("plus")}</button>` })}
      ${soon.length ? `<h2 class="h2">Due in the next 7 days</h2><div class="list glass">${soon.map(row).join("")}</div>` : ""}
      <h2 class="h2">All recurring</h2>${list.length ? `<div class="list glass">${list.map(row).join("")}</div>` : `<div class="empty glass card"><div class="e">🔁</div><p>No recurring items yet.</p><button class="btn primary" data-act="recEdit">Add recurring</button></div>`}
      <p class="tiny muted" style="text-align:center">Auto-post items are added on their date when you open the app (missed dates are caught up once each).</p>`;
    },
  });
  const postOne = (r) => { const d = GF.store.data, id = "rec_" + r.id + "_" + r.nextDate; if (!d.transactions.some((t) => t.id === id)) d.transactions.push({ id, type: r.type, amount: r.amount, accountId: r.accountId, toAccountId: r.toAccountId || null, categoryId: r.type === "transfer" ? null : r.categoryId, dateTime: D.isoDT(new Date()), merchant: r.name, note: "Recurring", paymentMethod: "UPI", recurringId: r.id, isSample: !!r.isSample }); r.nextDate = GF.nextRecurring(r.nextDate, r); GF.store.save(); };
  GF.acts.recPost = (el) => { postOne(GF.store.get("recurring", el.dataset.id)); GF.haptic(12); GF.toast("Posted"); };
  GF.acts.recSkip = (el) => { const r = GF.store.get("recurring", el.dataset.id); (r.skipped = r.skipped || []).push(r.nextDate); r.nextDate = GF.nextRecurring(r.nextDate, r); GF.store.save(); GF.toast("Skipped to " + D.short(r.nextDate)); };
  GF.acts.recEdit = (el) => {
    const d = GF.store.data, ex = el.dataset.id ? GF.store.get("recurring", el.dataset.id) : null, live = d.accounts.filter((a) => !a.archived);
    const s = ex ? { ...ex } : { name: "", type: "expense", amount: 0, frequency: "monthly", interval: 1, unit: "days", nextDate: D.today(), endDate: "", categoryId: null, accountId: (live[0] || {}).id, toAccountId: null, active: true, autoPost: true };
    const draw = () => `<div class="seg" id="re-type">${["expense", "income", "transfer"].map((t) => `<button data-v="${t}" aria-pressed="${s.type === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div>
      <label class="field" style="margin-top:12px"><span>Name</span><input class="input" id="re-name" value="${esc(s.name)}" placeholder="e.g. Rent" maxlength="40"></label>
      <label class="field"><span>Amount (₹)</span><input class="input amt" id="re-amt" inputmode="decimal" value="${s.amount ? GF.fromPaise(s.amount) : ""}"></label>
      <label class="field"><span>Repeats</span></label><div class="chips" id="re-freq" style="margin-bottom:8px">${Object.entries(FREQ).map(([k, v]) => `<button class="chip" data-v="${k}" aria-pressed="${s.frequency === k}">${v}</button>`).join("")}</div>
      ${s.frequency === "custom" ? `<div class="row" style="gap:8px;margin-bottom:12px"><span>Every</span><input class="input" id="re-int" inputmode="numeric" style="width:70px" value="${s.interval}"><div class="chips" id="re-unit">${["days", "weeks", "months"].map((u) => `<button class="chip" data-v="${u}" aria-pressed="${s.unit === u}">${u}</button>`).join("")}</div></div>` : ""}
      ${s.type !== "transfer" ? `<label class="field"><span>Category</span></label><div class="chips scroll" id="re-cat" style="margin-bottom:12px">${d.categories.filter((c) => c.kind === "both" || c.kind === s.type).map((c) => `<button class="chip" data-v="${c.id}" aria-pressed="${s.categoryId === c.id}">${c.icon} ${esc(c.name)}</button>`).join("")}</div>` : ""}
      <label class="field"><span>${s.type === "transfer" ? "From account" : "Account"}</span></label><div class="chips scroll" id="re-acc" style="margin-bottom:12px">${live.map((a) => `<button class="chip" data-v="${a.id}" aria-pressed="${s.accountId === a.id}">${a.icon} ${esc(a.name)}</button>`).join("")}</div>
      ${s.type === "transfer" ? `<label class="field"><span>To account</span></label><div class="chips scroll" id="re-to" style="margin-bottom:12px">${live.map((a) => `<button class="chip" data-v="${a.id}" aria-pressed="${s.toAccountId === a.id}">${a.icon} ${esc(a.name)}</button>`).join("")}</div>` : ""}
      <div class="grid2"><label class="field"><span>Next date</span><input class="input" type="date" id="re-next" value="${s.nextDate}"></label><label class="field"><span>Ends (optional)</span><input class="input" type="date" id="re-end" value="${s.endDate || ""}"></label></div>
      <div class="list glass" style="margin-bottom:12px"><div class="item"><span class="meta"><span class="t">Post automatically</span><span class="s">Otherwise it waits for "Post now"</span></span><button class="toggle" role="switch" id="re-auto" aria-checked="${s.autoPost}" aria-label="Post automatically"></button></div>
      <div class="item"><span class="meta"><span class="t">Active</span></span><button class="toggle" role="switch" id="re-act" aria-checked="${s.active}" aria-label="Active"></button></div></div>
      <div class="errbox" id="re-err" hidden></div><button class="btn primary block" id="re-save">${ex ? "Save" : "Add recurring"}</button>${ex ? `<button class="btn danger block" id="re-del" style="margin-top:8px">${GF.icon("trash")} Delete</button>` : ""}`;
    GF.closeAll(() => GF.sheet({ title: ex ? "Edit recurring" : "New recurring", body: draw(), mount(sh) {
      const read = () => { s.name = $("#re-name", sh).value.trim(); s.amount = GF.toPaise($("#re-amt", sh).value.replace(/,/g, "")); s.nextDate = $("#re-next", sh).value || s.nextDate; s.endDate = $("#re-end", sh).value; const i = $("#re-int", sh); if (i) s.interval = Math.max(1, parseInt(i.value) || 1); };
      const wire = () => {
        const pick = (id, key, redraw) => $$(`#${id} [data-v]`, sh).forEach((b) => (b.onclick = () => { read(); s[key] = b.dataset.v; if (redraw) { $(".sbody", sh).innerHTML = draw(); wire(); } else $$(`#${id} [data-v]`, sh).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
        pick("re-type", "type", true); pick("re-freq", "frequency", true); pick("re-unit", "unit"); pick("re-cat", "categoryId"); pick("re-acc", "accountId"); pick("re-to", "toAccountId");
        $("#re-auto", sh).onclick = (e) => { s.autoPost = !s.autoPost; e.currentTarget.setAttribute("aria-checked", s.autoPost); };
        $("#re-act", sh).onclick = (e) => { s.active = !s.active; e.currentTarget.setAttribute("aria-checked", s.active); };
        $("#re-save", sh).onclick = () => {
          read(); const e = $("#re-err", sh), err = !s.name ? "Give it a name." : !(s.amount > 0) ? "Enter an amount." : s.type !== "transfer" && !s.categoryId ? "Choose a category." : !s.accountId ? "Choose an account." : s.type === "transfer" && (!s.toAccountId || s.toAccountId === s.accountId) ? "Choose a different To account." : "";
          if (err) { e.hidden = false; e.textContent = err; return; }
          GF.closeAll(() => { GF.store.upsert("recurring", s); const n = GF.runRecurring(); if (n) GF.store.save(); GF.toast(ex ? "Saved" : "Recurring added" + (n ? ` · ${n} posted` : "")); });
        };
        const del = $("#re-del", sh); if (del) del.onclick = async () => { if (await GF.confirm({ title: "Delete recurring item?", msg: "Transactions already posted stay.", ok: "Delete", danger: true })) GF.closeAll(() => { GF.store.remove("recurring", s.id); GF.toast("Deleted"); }); };
      };
      wire();
    } }));
  };

  /* ================= INSIGHTS ================= */
  GF.insights = () => {
    const d = GF.store.data, mk = mkNow(), pm = D.addMonths(mk, -1), out = [];
    const today = D.today(), dayN = +today.slice(8, 10), daysIn = +D.monthEnd(mk).slice(8, 10);
    const cur = C.totals(d.transactions, D.monthStart(mk), today);
    const prevSame = C.totals(d.transactions, D.monthStart(pm), D.addDays(D.monthStart(pm), Math.min(dayN, +D.monthEnd(pm).slice(8, 10)) - 1));
    if (prevSame.expense > 0 && cur.expense > 0) { const ch = ((cur.expense - prevSame.expense) / prevSame.expense) * 100; out.push(["📈", `Your spending is ${Math.abs(Math.round(ch))}% ${ch >= 0 ? "higher" : "lower"} than at this point last month (${GF.fmt(cur.expense, { force: true })} vs ${GF.fmt(prevSame.expense, { force: true })}).`]); }
    const cats = C.byCategory(d.transactions, D.monthStart(mk), today);
    if (cats.length) out.push(["🏷️", `${GF.cat(cats[0].categoryId).name} is your highest expense category this month at ${GF.fmt(cats[0].amount, { force: true })}.`]);
    const bs = C.budgetSummary(d, mk);
    if (bs.overall) out.push([bs.overall.remaining >= 0 ? "✅" : "⚠️", bs.overall.remaining >= 0 ? `You are ${GF.fmt(bs.overall.remaining, { force: true })} under your monthly budget.` : `You are ${GF.fmt(-bs.overall.remaining, { force: true })} over your monthly budget.`]);
    if (bs.overall && bs.overall.remaining > 0) { const left = daysIn - dayN + 1; out.push(["🧮", `To stay on budget, keep spending under ${GF.fmt(Math.floor(bs.overall.remaining / left), { force: true })} a day for the ${left} day${left > 1 ? "s" : ""} left.`]); }
    if (cur.rate != null && cur.income > 0) out.push(["🐷", `You saved ${GF.pct(cur.rate)} of your income this month.`]);
    const sub = (from, to) => d.transactions.filter((t) => t.type === "expense" && t.categoryId === "cat_subscriptions" && C.inRange(t, from, to)).reduce((s, t) => s + t.amount, 0);
    const sNow = sub(D.monthStart(mk), D.monthEnd(mk)), sPrev = sub(D.monthStart(pm), D.monthEnd(pm));
    if (sNow && sPrev && sNow !== sPrev) out.push(["📺", `Your subscription spending ${sNow > sPrev ? "increased" : "decreased"} this month: ${GF.fmt(sNow, { force: true })} vs ${GF.fmt(sPrev, { force: true })}.`]);
    const big = d.transactions.filter((t) => t.type === "expense" && C.inRange(t, D.monthStart(mk), today)).sort((a, b) => b.amount - a.amount)[0];
    if (big) out.push(["💸", `Biggest expense this month: ${GF.fmt(big.amount, { force: true })} — ${GF.txTitle(big)} on ${D.short(big.dateTime.slice(0, 10))}.`]);
    const pc = {}; C.byCategory(d.transactions, D.monthStart(pm), D.monthEnd(pm)).forEach((r) => (pc[r.categoryId] = r.amount));
    const inc = cats.map((r) => ({ id: r.categoryId, diff: r.amount - (pc[r.categoryId] || 0) })).filter((r) => pc[r.id] && r.diff > 0).sort((a, b) => b.diff - a.diff)[0];
    if (inc) out.push(["🔺", `${GF.cat(inc.id).name} is up ${GF.fmt(inc.diff, { force: true })} on last month.`]);
    return out;
  };
  GF.screen("insights", {
    tab: "more", title: () => "Insights",
    render() { const ins = GF.insights(); return `${GF.topbar("Insights", { back: true })}${ins.length ? `<div class="list glass">${ins.map(([i, t]) => `<div class="item"><span class="cat" style="background:var(--glass-3)">${i}</span><span class="meta"><span class="t" style="white-space:normal;font-weight:500">${esc(t)}</span></span></div>`).join("")}</div>` : `<div class="empty glass card"><div class="e">💡</div><p>Not enough data yet. Insights appear once you have a few transactions.</p></div>`}<p class="tiny muted" style="text-align:center">Calculated from your own transactions on this phone. Nothing is estimated or invented.</p>`; },
  });
  GF.homeExtras = () => {
    const ins = GF.insights().slice(0, 3), d = GF.store.data;
    const up = d.recurring.filter((r) => r.active && r.nextDate <= D.addDays(D.today(), 7)).sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1)).slice(0, 3);
    return (ins.length ? `<h2 class="h2">Insights <a href="#/insights">All</a></h2><div class="list glass">${ins.map(([i, t]) => `<div class="item"><span class="cat" style="background:var(--glass-3)">${i}</span><span class="meta"><span class="t" style="white-space:normal;font-weight:500;font-size:14px">${esc(t)}</span></span></div>`).join("")}</div>` : "")
      + (up.length ? `<h2 class="h2">Upcoming recurring <a href="#/recurring">All</a></h2><div class="list glass">${up.map((r) => `<a class="item" href="#/recurring" style="text-decoration:none;color:inherit"><span class="meta"><span class="t">${esc(r.name)}</span><span class="s">${D.dayLabel(r.nextDate)}${r.autoPost ? " · auto" : ""}</span></span><span class="r amt ${r.type === "income" ? "inc" : "exp"}">${r.type === "income" ? "+" : "−"}${GF.fmt(r.amount)}</span></a>`).join("")}</div>` : "");
  };

  /* ================= OFFLINE ASSISTANT =================
     AssistantProvider interface: { answer(question, data) → {data: [lines], guidance: [lines]} | null }.
     A cloud LLM provider can be added later behind explicit user consent; this local one never invents data. */
  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  GF.assistant = {
    period(q) {
      const t = D.today(), mk = D.month(t), y = t.slice(0, 4);
      if (/\btoday\b/.test(q)) return { from: t, to: t, label: "today" };
      if (/\byesterday\b/.test(q)) { const y1 = D.addDays(t, -1); return { from: y1, to: y1, label: "yesterday" }; }
      if (/\blast week\b/.test(q)) return { from: D.addDays(t, -13), to: D.addDays(t, -7), label: "last week" };
      if (/\bthis week\b|\bweek\b/.test(q)) return { from: D.addDays(t, -6), to: t, label: "the last 7 days" };
      if (/\blast month\b|\bprevious month\b/.test(q)) { const p = D.addMonths(mk, -1); return { from: D.monthStart(p), to: D.monthEnd(p), label: D.monthLabel(p) }; }
      if (/\blast year\b/.test(q)) { const ly = +y - 1; return { from: ly + "-01-01", to: ly + "-12-31", label: String(ly) }; }
      if (/\bthis year\b|\byear\b/.test(q)) return { from: y + "-01-01", to: t, label: y };
      const mi = MONTHS.findIndex((m) => new RegExp("\\b" + m + "\\b|\\b" + m.slice(0, 3) + "\\b").test(q));
      if (mi >= 0) { const yr = (q.match(/\b(20\d\d)\b/) || [])[1] || (mi + 1 > +mk.slice(5) ? String(+y - 1) : y); const m = yr + "-" + D.pad(mi + 1); return { from: D.monthStart(m), to: D.monthEnd(m), label: D.monthLabel(m) }; }
      if (/\ball time\b|\bever\b|\btotal\b/.test(q)) return { from: null, to: null, label: "all time" };
      return { from: D.monthStart(mk), to: D.monthEnd(mk), label: "this month (" + D.monthLabel(mk) + ")" };
    },
    answer(raw) {
      const q = raw.toLowerCase(), d = GF.store.data, p = this.period(q), F = (v) => GF.fmt(v, { force: true });
      const cat = d.categories.find((c) => q.includes(c.name.toLowerCase()) || q.includes(c.name.toLowerCase().split(/[ &]/)[0]));
      const acc = d.accounts.find((a) => q.includes(a.name.toLowerCase()));
      const inP = (t) => C.inRange(t, p.from, p.to) && (!acc || t.accountId === acc.id || t.toAccountId === acc.id);
      const exp = d.transactions.filter((t) => t.type === "expense" && inP(t) && (!cat || t.categoryId === cat.id));
      const sum = (a) => a.reduce((s, t) => s + t.amount, 0);
      const top3 = (a) => [...a].sort((x, y) => y.amount - x.amount).slice(0, 3).map((t) => `${F(t.amount)} · ${GF.txTitle(t)} · ${D.short(t.dateTime.slice(0, 10))}`);
      const amtM = q.match(/(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.\d+)?)\s*(k)?/i);
      if (/afford|can i (spend|buy)/.test(q) && amtM) {
        const want = Math.round(parseFloat(amtM[1].replace(/,/g, "")) * (amtM[2] ? 1000 : 1) * 100), mk = mkNow(), bs = C.budgetSummary(d, mk);
        const dayN = +D.today().slice(8, 10), left = +D.monthEnd(mk).slice(8, 10) - dayN + 1, total = C.totalBalance(d);
        const lines = [`Spendable balance across accounts: ${F(total)}.`];
        if (bs.overall) { const safeWeek = Math.floor(Math.max(0, bs.overall.remaining) / left) * Math.min(7, left); lines.push(`Monthly budget left: ${F(bs.overall.remaining)} (${left} days to go), about ${F(safeWeek)} for the next 7 days.`, want <= safeWeek ? `${F(want)} fits within that weekly pace.` : want <= bs.overall.remaining ? `${F(want)} is within the month's remaining budget but above the weekly pace, leaving ${F(bs.overall.remaining - want)} for the rest of the month.` : `${F(want)} is more than the budget you have left this month by ${F(want - bs.overall.remaining)}.`); }
        else lines.push("No budget is set for this month, so I can only compare against your balance.");
        return { data: lines, guidance: ["General guidance: keep a cushion for bills due soon and avoid dipping into emergency savings for non-essentials."] };
      }
      if (/biggest|largest|highest (single )?(expense|payment)|most expensive/.test(q)) {
        const t = [...exp].sort((a, b) => b.amount - a.amount)[0];
        return t ? { data: [`Biggest expense ${p.label}${cat ? " in " + cat.name : ""}: ${F(t.amount)} — ${GF.txTitle(t)} on ${D.short(t.dateTime.slice(0, 10))} (${GF.cat(t.categoryId).name}).`] } : { data: [`No expenses found ${p.label}.`] };
      }
      if (/where.*(spend|spending)|most on|top categor|spending the most/.test(q)) {
        const rows = C.byCategory(d.transactions, p.from, p.to).slice(0, 3);
        return rows.length ? { data: [`Top categories ${p.label}:`, ...rows.map((r, i) => `${i + 1}. ${GF.cat(r.categoryId).name} — ${F(r.amount)}`)] } : { data: [`No expenses found ${p.label}.`] };
      }
      if (/save|saving/.test(q)) {
        const t = C.totals(d.transactions, p.from, p.to);
        return { data: [`${p.label[0].toUpperCase() + p.label.slice(1)}: income ${F(t.income)}, expenses ${F(t.expense)}, so you ${t.savings >= 0 ? "saved" : "overspent by"} ${F(Math.abs(t.savings))}${t.rate != null ? ` (${GF.pct(t.rate)} of income)` : ""}. Transfers aren't counted.`] };
      }
      if (/earn|income|receiv|got paid/.test(q)) {
        const inc = d.transactions.filter((t) => t.type === "income" && inP(t) && (!cat || t.categoryId === cat.id));
        return { data: [`Income ${p.label}${cat ? " from " + cat.name : ""}: ${F(sum(inc))} across ${inc.length} transaction${inc.length === 1 ? "" : "s"}.`, ...top3(inc)] };
      }
      if (/balance|how much (money )?do i have/.test(q)) {
        const b = C.balances(d);
        return { data: acc ? [`${acc.name} ledger balance: ${F(b[acc.id])}.`] : [`Total ledger balance: ${F(C.totalBalance(d))}.`, ...d.accounts.filter((a) => !a.archived).map((a) => `${a.name}: ${F(b[a.id])}`)] };
      }
      if (/how many|count|number of/.test(q)) return { data: [`${exp.length} expense${exp.length === 1 ? "" : "s"} ${p.label}${cat ? " in " + cat.name : ""}.`] };
      if (/spen|spent|expense|cost|pay|paid/.test(q) || cat) {
        return { data: [`You spent ${F(sum(exp))} ${p.label}${cat ? " on " + cat.name : ""}${acc ? " from " + acc.name : ""} across ${exp.length} transaction${exp.length === 1 ? "" : "s"}.`, ...(exp.length ? ["Largest:", ...top3(exp)] : [])] };
      }
      return null;
    },
  };
  const chat = [];
  const SUG = ["How much did I spend this month?", "What was my biggest expense?", "How much did I save last month?", "Where am I spending the most?", "How much did I spend on food this year?", "Can I afford to spend ₹5,000 this week?"];
  GF.screen("assistant", {
    tab: "more", title: () => "Assistant",
    render() {
      return `${GF.topbar("Assistant", { back: true, sub: "Works offline on your data" })}
      <div id="as-log" aria-live="polite">${chat.length ? chat.map((m) => m.q ? `<div class="card glass" style="margin-left:15%;background:var(--accent-soft, rgba(99,102,241,.18))"><b>${esc(m.q)}</b></div>` : `<div class="card glass" style="margin-right:6%">${m.a ? `<div class="tiny muted" style="margin-bottom:4px">📊 From your data</div>${m.a.data.map((l) => `<div>${esc(l)}</div>`).join("")}${m.a.guidance ? `<div class="tiny muted" style="margin:10px 0 4px">💡 General guidance (not from your data)</div>${m.a.guidance.map((l) => `<div class="small">${esc(l)}</div>`).join("")}` : ""}` : `<div>I couldn't work that out from your data. Try asking about spending, income, savings, your biggest expense, top categories, balances or affordability, with a period like "last month" or "in September".</div>`}</div>`).join("") : `<div class="card glass"><p>Ask about your money. Every number comes from the transactions on this phone, and general advice is labelled separately.</p></div>`}</div>
      <div class="chips scroll" style="margin:10px 0">${SUG.map((s) => `<button class="chip" data-act="askSug" data-q="${esc(s)}">${esc(s)}</button>`).join("")}</div>
      <form id="as-form" class="row" style="gap:8px;position:sticky;bottom:calc(96px + env(safe-area-inset-bottom))"><input class="input glass" id="as-q" placeholder="Ask a question…" autocomplete="off" style="flex:1" aria-label="Question"><button class="btn primary" aria-label="Ask">Ask</button></form>`;
    },
    mount(root) { $("#as-form", root).onsubmit = (e) => { e.preventDefault(); ask($("#as-q", root).value); }; const l = $("#as-log", root); l.lastElementChild && l.lastElementChild.scrollIntoView({ block: "end" }); },
  });
  const ask = (q) => { q = String(q || "").trim(); if (!q) return; chat.push({ q }, { a: GF.assistant.answer(q) }); GF.render(); };
  GF.acts.askSug = (el) => ask(el.dataset.q);

  /* ================= GLOBAL SEARCH ================= */
  let sq = "";
  GF.searchTx = (raw) => {
    const q = raw.trim().toLowerCase(); if (!q) return [];
    const d = GF.store.data, num = q.replace(/[₹,\s]|rs\.?/g, "");
    const isAmt = /^\d+(\.\d+)?$/.test(num) && num.length > 0;
    let dateRx = null; const m = q.match(/^(\d{1,2})\s+([a-z]+)|^([a-z]+)\s+(\d{1,2})$/);
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(q)) dateRx = q;
    else if (m) { const mo = MONTHS.findIndex((x) => x.startsWith((m[2] || m[3]).slice(0, 3))); if (mo >= 0) dateRx = "-" + D.pad(mo + 1) + "-" + D.pad(+(m[1] || m[4])); }
    const monthOnly = MONTHS.findIndex((x) => q === x || q === x.slice(0, 3));
    return d.transactions.filter((t) => {
      if (isAmt && (t.amount === Math.round(parseFloat(num) * 100) || String(t.amount / 100).startsWith(num))) return true;
      if (dateRx && t.dateTime.includes(dateRx)) return true;
      if (monthOnly >= 0 && t.dateTime.slice(5, 7) === D.pad(monthOnly + 1)) return true;
      const a = GF.acc(t.accountId), b = GF.acc(t.toAccountId);
      const hay = [t.merchant, t.note, t.paymentMethod, t.type, t.categoryId && GF.cat(t.categoryId).name, a && a.name, b && b.name, t.auto && t.auto.app, t.auto && t.auto.ref].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    }).sort((x, y) => (x.dateTime < y.dateTime ? 1 : -1));
  };
  GF.screen("search", {
    tab: "tx", title: () => "Search",
    render() {
      return `${GF.topbar("Search", { back: true })}<input class="input glass search" id="gs-q" type="search" value="${esc(sq)}" placeholder="Amazon, ₹500, Food, September 5, UPI…" aria-label="Search transactions" autofocus>
      <div id="gs-res" style="margin-top:12px"></div>`;
    },
    mount(root) {
      const inp = $("#gs-q", root), res = $("#gs-res", root); let tm;
      const run = () => {
        sq = inp.value; const r = GF.searchTx(sq);
        res.innerHTML = !sq.trim() ? `<p class="muted small">Search merchant, amount, category, date, account, notes or UPI reference.</p>` : r.length ? `<p class="small muted">${r.length} result${r.length > 1 ? "s" : ""}</p><div class="list glass">${r.slice(0, 200).map((t) => GF.txRow(t, { showDate: true })).join("")}</div>` : `<div class="empty glass card"><p>No matches for “${esc(sq)}”.</p></div>`;
        const term = sq.trim(); if (term && !/^[₹\d]/.test(term)) $$(".t", res).forEach((el) => { el.innerHTML = el.innerHTML.replace(new RegExp("(" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); });
      };
      inp.oninput = () => { clearTimeout(tm); tm = setTimeout(run, 100); };
      run(); setTimeout(() => inp.focus(), 50);
    },
  });

  /* ================= PIN LOCK + PRIVACY ================= */
  const sha = async (s) => { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("glassfinance:" + s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); };
  let hiddenAt = 0, locked = false;
  GF.lock = () => new Promise((resolve) => {
    if (!GF.store.data.settings.pin || locked) return resolve();
    locked = true; let entry = "";
    const el = document.createElement("div");
    el.className = "lockscreen"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Enter PIN");
    el.style.cssText = "position:fixed;inset:0;z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);background:color-mix(in srgb, var(--bg, #0b1020) 70%, transparent)";
    const draw = (msg = "Enter your PIN") => { el.innerHTML = `<div style="font-size:40px">🔒</div><b style="font-size:20px">${msg}</b><div style="display:flex;gap:14px" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<span style="width:14px;height:14px;border-radius:50%;border:2px solid currentColor;${i < entry.length ? "background:currentColor" : ""}"></span>`).join("")}</div><div class="keypad glass" style="width:min(320px,86vw);border-radius:28px;padding:10px">${["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k) => k ? `<button data-k="${k}" aria-label="${k === "⌫" ? "Delete" : k}">${k}</button>` : "<span></span>").join("")}</div>`; $$("[data-k]", el).forEach((b) => (b.onclick = () => press(b.dataset.k))); };
    const press = async (k) => {
      GF.haptic(4);
      if (k === "⌫") entry = entry.slice(0, -1); else if (entry.length < 4) entry += k;
      draw();
      if (entry.length === 4) { if ((await sha(entry)) === GF.store.data.settings.pin) { el.remove(); locked = false; resolve(); } else { entry = ""; GF.haptic(40); draw("Wrong PIN, try again"); } }
    };
    draw(); document.body.append(el);
    if (GF.store.data.settings.biometric !== false && GF.native && GF.native.AutoTrack && GF.native.AutoTrack.checkBiometric) {
      GF.native.AutoTrack.checkBiometric().then((res) => {
        if (!res || !res.available || !locked) return;
        const bioBtn = document.createElement("button");
        bioBtn.className = "btn glass";
        bioBtn.textContent = "👆 Unlock with Biometrics";
        const tryBio = () => GF.native.AutoTrack.authenticateBiometric({ title: "Unlock Glass Finance", subtitle: "Verify your identity to view your finances" })
          .then((r) => { if (r && r.authenticated && locked) { el.remove(); locked = false; resolve(); } })
          .catch(() => {});
        bioBtn.onclick = tryBio;
        el.append(bioBtn);
        tryBio();
      }).catch(() => {});
    }
  });
  GF.hooks.boot.push(() => GF.lock());
  document.addEventListener("visibilitychange", () => {
    const shield = document.getElementById("privacy-shield") || Object.assign(document.createElement("div"), { id: "privacy-shield" });
    if (document.hidden) { hiddenAt = Date.now(); shield.style.cssText = "position:fixed;inset:0;z-index:998;backdrop-filter:blur(40px);-webkit-backdrop-filter:blur(40px);background:rgba(10,14,30,.6)"; document.body.append(shield); }
    else { shield.remove(); if (GF.store.data.settings.pin && Date.now() - hiddenAt > 60000) GF.lock(); }
  });

  /* ================= ENCRYPTED BACKUP (AES-GCM, PBKDF2) ================= */
  const b64 = (u8) => btoa(String.fromCharCode(...u8)), unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const keyFrom = async (pass, salt) => crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  GF.encryptBackup = async (obj, pass) => { const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(pass, salt), new TextEncoder().encode(JSON.stringify(obj)))); return JSON.stringify({ format: "glassfinance-encrypted", v: 1, kdf: "PBKDF2-SHA256-210000", salt: b64(salt), iv: b64(iv), data: b64(ct) }); };
  GF.decryptBackup = async (text, pass) => { const e = JSON.parse(text); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(e.iv) }, await keyFrom(pass, unb64(e.salt)), unb64(e.data)); return JSON.parse(new TextDecoder().decode(pt)); };
  const askPass = (title, confirm) => new Promise((res) => GF.sheet({ title, body: `<label class="field"><span>Password</span><input class="input" type="password" id="pw1" autocomplete="new-password"></label>${confirm ? `<label class="field"><span>Repeat password</span><input class="input" type="password" id="pw2" autocomplete="new-password"></label>` : ""}<p class="tiny muted">There's no way to recover a forgotten backup password.</p><div class="errbox" id="pw-e" hidden></div><button class="btn primary block" id="pw-ok">Continue</button>`, onClose: () => res(null),
    mount(sh) { $("#pw-ok", sh).onclick = () => { const a = $("#pw1", sh).value, b = confirm ? $("#pw2", sh).value : a, e = $("#pw-e", sh); if (a.length < 6) { e.hidden = false; e.textContent = "Use at least 6 characters."; return; } if (a !== b) { e.hidden = false; e.textContent = "Passwords don't match."; return; } const v = a; res(v); GF.closeSheet(); }; } }));
  GF.acts.encBackup = async () => { const p = await askPass("Encrypted backup", true); if (!p) return; const txt = await GF.encryptBackup({ ...GF.store.data, exportedAt: new Date().toISOString() }, p); GF.download("glass-finance-" + D.today() + ".gfbackup", txt, "application/octet-stream"); };
  GF.acts.encRestore = async () => {
    const f = await GF.readFile(".gfbackup,.json,application/octet-stream,application/json"); if (!f) return;
    let obj; try { const j = JSON.parse(f.text); if (j.format !== "glassfinance-encrypted") return GF.toast("Not an encrypted Glass Finance backup — use Restore."); } catch (e) { return GF.toast("Unreadable file."); }
    const p = await askPass("Backup password"); if (!p) return;
    try { obj = await GF.decryptBackup(f.text, p); } catch (e) { return GF.toast("Wrong password or damaged file."); }
    const err = GF.store.validate(obj); if (err) return GF.toast(err);
    if (await GF.confirm({ title: "Replace everything with this backup?", msg: `${obj.transactions.length} transactions, ${obj.accounts.length} accounts. Current data on this phone is replaced.`, ok: "Restore", danger: true })) { GF.store.replaceAll(obj); GF.toast("Restored"); }
  };

  /* ================= PDF SUMMARY ================= */
  GF.acts.pdfSummary = () => {
    const opts = [["month", "This month"], ["last", "Last month"], ["year", "This year"], ["all", "All time"]];
    GF.sheet({ title: "PDF summary", body: `<div class="list glass">${opts.map(([k, l]) => `<button class="item" data-r="${k}"><span class="meta"><span class="t">${l}</span></span><span class="chev">${GF.icon("chev")}</span></button>`).join("")}</div><p class="tiny muted">Opens Android's print dialog — choose "Save as PDF".</p>`,
      mount(sh) { $$("[data-r]", sh).forEach((b) => (b.onclick = () => { const mk = mkNow(), t = D.today(); const r = { month: [D.monthStart(mk), D.monthEnd(mk)], last: [D.monthStart(D.addMonths(mk, -1)), D.monthEnd(D.addMonths(mk, -1))], year: [t.slice(0, 4) + "-01-01", t], all: [null, null] }[b.dataset.r]; GF.closeAll(() => printSummary(r[0], r[1], b.textContent.trim())); })); } });
  };
  function printSummary(from, to, label) {
    const d = GF.store.data, T = C.totals(d.transactions, from, to), F = (v) => GF.fmt(v, { force: true }), bal = C.balances(d);
    const txs = d.transactions.filter((t) => C.inRange(t, from, to)).sort((a, b) => (a.dateTime < b.dateTime ? -1 : 1));
    if (GF.native && GF.native.AutoTrack && GF.native.AutoTrack.exportPdfSummary) {
      const lines = [
        "## Overview",
        "Income: " + F(T.income) + "   Expense: " + F(T.expense) + "   Savings: " + F(T.savings) + "   Transactions: " + txs.length,
        "",
        "## Account Balances",
        ...d.accounts.map((a) => a.name + ": " + F(bal[a.id] ?? 0)),
        "",
        "## Transactions",
        ...txs.slice(0, 120).map((t) => {
          const cat = GF.cat(t.categoryId || t.category), acc = GF.acc(t.accountId);
          const sign = t.type === "income" ? "+" : t.type === "expense" ? "-" : "";
          return D.short(t.dateTime) + " | " + (t.merchant || t.note || cat.name) + " | " + acc.name + " | " + sign + F(t.amount);
        }),
      ];
      const sub = (from ? D.short(from) + " " + from.slice(0, 4) + " to " + D.short(to) + " " + to.slice(0, 4) : "All time") + " · Generated " + new Date().toLocaleString("en-IN");
      GF.native.AutoTrack.exportPdfSummary({ title: "Glass Finance – " + label, subtitle: sub, fileName: "GlassFinance-" + label.replace(/\s+/g, "-") + ".pdf", lines })
        .then(() => GF.toast("PDF summary ready to save or share"))
        .catch(() => {});
      return;
    }
    const html = `<div id="print-root"><h1>Glass Finance — ${esc(label)}</h1><p>${from ? D.short(from) + " " + from.slice(0, 4) + " to " + D.short(to) + " " + to.slice(0, 4) : "All time"} · generated ${new Date().toLocaleString("en-IN")}</p>
      <table><tr><th>Income</th><th>Expenses</th><th>Saved</th><th>Savings rate</th></tr><tr><td>${F(T.income)}</td><td>${F(T.expense)}</td><td>${F(T.savings)}</td><td>${T.rate == null ? "—" : GF.pct(T.rate)}</td></tr></table>
      <h2>Spending by category</h2><table><tr><th>Category</th><th>Amount</th><th>Share</th></tr>${C.byCategory(d.transactions, from, to).map((r) => `<tr><td>${esc(GF.cat(r.categoryId).name)}</td><td>${F(r.amount)}</td><td>${T.expense ? GF.pct((r.amount / T.expense) * 100) : "—"}</td></tr>`).join("")}</table>
      <h2>Account balances (ledger, today)</h2><table><tr><th>Account</th><th>Balance</th></tr>${d.accounts.filter((a) => !a.archived).map((a) => `<tr><td>${esc(a.name)}</td><td>${F(bal[a.id])}</td></tr>`).join("")}</table>
      <h2>Transactions (${txs.length})</h2><table><tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th>Amount</th></tr>${txs.map((t) => `<tr><td>${t.dateTime.replace("T", " ")}</td><td>${esc(GF.txTitle(t))}</td><td>${t.type === "transfer" ? "Transfer" : esc(GF.cat(t.categoryId).name)}</td><td>${esc((GF.acc(t.accountId) || {}).name || "")}${t.type === "transfer" ? " → " + esc((GF.acc(t.toAccountId) || {}).name || "") : ""}</td><td>${t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}${F(t.amount)}</td></tr>`).join("")}</table></div>`;
    const st = document.createElement("style"); st.id = "print-style";
    st.textContent = "@media print{body>*:not(#print-root){display:none!important}#print-root{display:block!important;color:#000;background:#fff;font:12px system-ui}#print-root table{width:100%;border-collapse:collapse;margin:8px 0 16px}#print-root th,#print-root td{border-bottom:1px solid #ccc;padding:4px;text-align:left}}#print-root{display:none}";
    document.head.append(st); document.body.insertAdjacentHTML("beforeend", html);
    setTimeout(() => { window.print(); setTimeout(() => { $("#print-root") && $("#print-root").remove(); st.remove(); }, 1000); }, 100);
  }

  /* ================= SETTINGS SECTIONS ================= */
  const tg = (id, on, label) => `<button class="toggle" role="switch" id="${id}" aria-checked="${!!on}" aria-label="${label}"></button>`;
  const it = (t, s, r, act) => `<${act ? `button data-act="${act}"` : "div"} class="item"><span class="meta"><span class="t">${t}</span>${s ? `<span class="s">${s}</span>` : ""}</span>${r || (act ? `<span class="chev">${GF.icon("chev")}</span>` : "")}</${act ? "button" : "div"}>`;
  GF.hooks.settingsSections.push(() => {
    const s = GF.store.data.settings;
    return `<h2 class="h2">Automatic tracking</h2><div class="list glass">${it("Automatic Tracking", GF.auto && GF.auto.available() ? "UPI apps, bank alerts, diagnostics" : "Available in the Android app", "", "goAuto")}${it("Import bank statement", "CSV from your bank; matching payments become Bank-verified", "", "importStatement")}</div>
    <h2 class="h2">Currency</h2><div class="list glass">${it("Currency", "Indian Rupee (₹ INR) · more currencies later", "<span class='small muted'>₹</span>")}</div>
    <h2 class="h2">Notifications</h2><div class="list glass">${it("Bill reminders", (GF.native && GF.native.isNative ? "Scheduled on your phone, " : "Shown when you open the app, ") + (s.reminderDays ?? 1) + " day before due", tg("st-billrem", s.billReminders, "Bill reminders"))}${it("Budget alerts", "When a category passes 80% or 100%", tg("st-budal", s.budgetAlerts !== false, "Budget alerts"))}</div>
    <h2 class="h2">Security & privacy</h2><div class="list glass">${it("PIN lock", s.pin ? "On · asks after 1 minute away" : "Off", "", "pinSetup")}${it("Encrypted backup", "Password-protected AES-256 file", "", "encBackup")}${it("Restore encrypted backup", "", "", "encRestore")}${it("PDF summary", "Print or save a report", "", "pdfSummary")}</div>
    <p class="tiny muted" style="margin:6px 4px">PIN lock is a privacy lock on this app, not disk encryption. Android's device encryption protects data at rest. Data never leaves the phone unless you export or share it. Screenshots are blocked in the Android app.</p>
    <h2 class="h2">Coming later</h2><div class="list glass">${GF.providers.list().map((p) => it(p.name, p.note, "<span class='small muted'>Not connected</span>")).join("")}</div>
    <h2 class="h2">About</h2><div class="list glass">${it("Run self-test", "Checks calculations, transfers, recurring, bills and formatting", "", "selfTest")}${it("Glass Finance 1.0", "Made for Sami · data stays on this device")}</div>`;
  });
  GF.acts.goAuto = () => GF.go("#/auto");
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("#st-billrem,#st-budal"); if (!t) return;
    const s = GF.store.data.settings;
    if (t.id === "st-billrem") { const on = !s.billReminders; if (on && GF.requestNotifyPermission && !(await GF.requestNotifyPermission())) return GF.toast("Notifications are blocked for Glass Finance in Android settings."); if (on && !GF.native?.isNative && "Notification" in window && Notification.permission === "default") await Notification.requestPermission(); GF.store.setSettings({ billReminders: on }); GF.scheduleBillReminders && GF.scheduleBillReminders(); }
    else GF.store.setSettings({ budgetAlerts: s.budgetAlerts === false });
  });
  GF.acts.pinSetup = () => {
    const s = GF.store.data.settings;
    let first = null;
    GF.sheet({ title: s.pin ? "PIN lock" : "Set a 4-digit PIN", body: `${s.pin ? `<button class="btn block" id="pn-change">Change PIN</button><button class="btn danger block" id="pn-off" style="margin-top:8px">Turn off PIN lock</button>` : ""}<div id="pn-new" ${s.pin ? "hidden" : ""}><label class="field"><span id="pn-l">New PIN</span><input class="input" id="pn-v" type="password" inputmode="numeric" maxlength="4" autocomplete="off" style="letter-spacing:12px;font-size:24px;text-align:center"></label><button class="btn primary block" id="pn-ok">Next</button></div>`,
      mount(sh) {
        const ch = $("#pn-change", sh), off = $("#pn-off", sh);
        if (ch) ch.onclick = () => { $("#pn-new", sh).hidden = false; };
        if (off) off.onclick = () => GF.closeAll(() => { GF.store.setSettings({ pin: null }); GF.toast("PIN lock off"); });
        $("#pn-ok", sh).onclick = async () => { const v = $("#pn-v", sh).value; if (!/^\d{4}$/.test(v)) return GF.toast("Enter 4 digits"); if (!first) { first = v; $("#pn-v", sh).value = ""; $("#pn-l", sh).textContent = "Repeat the PIN"; $("#pn-ok", sh).textContent = "Turn on PIN lock"; return; } if (v !== first) { first = null; $("#pn-v", sh).value = ""; $("#pn-l", sh).textContent = "PINs didn't match — new PIN"; return; } const h = await sha(v); GF.closeAll(() => { GF.store.setSettings({ pin: h }); GF.toast("PIN lock on"); }); };
      } });
  };
  /* Budget alerts after each expense. */
  GF.hooks.afterTxSave = GF.hooks.afterTxSave || [];
  GF.hooks.afterTxSave.push((tx) => {
    if (tx.type !== "expense" || GF.store.data.settings.budgetAlerts === false) return;
    const bs = C.budgetSummary(GF.store.data, D.month(tx.dateTime)); const c = bs.cats.find((x) => x.budget.categoryId === tx.categoryId);
    if (c && c.pct >= 80) setTimeout(() => GF.toast(`${c.category.name}: ${c.state === "over" ? "over budget by " + GF.fmt(-c.remaining, { force: true }) : Math.round(c.pct) + "% of budget used"}`), 1600);
  });
  GF.hooks.boot.push(() => {
    const d = GF.store.data; if (!d.settings.billReminders) return;
    GF.scheduleBillReminders && GF.scheduleBillReminders();
    const due = d.bills.filter((b) => !b.paid && ["due", "overdue"].includes(C.billStatus(b).state));
    if (due.length) setTimeout(() => GF.toast(`${due.length} bill${due.length > 1 ? "s" : ""} due or overdue · ${due.map((b) => b.name).slice(0, 2).join(", ")}`), 1200);
  });

  /* ================= FUTURE PROVIDERS (interfaces only — no fake integrations) ================= */
  GF.providers = {
    registry: [
      { id: "account-aggregator", name: "Bank sync (Account Aggregator)", note: "Needs an RBI-regulated FIU partner and consent flow" },
      { id: "upi-autoimport", name: "UPI auto-import", note: "Live in the Android app via notifications" },
      { id: "receipt-ocr", name: "Receipt scanning (OCR)", note: "On-device ML Kit text recognition planned" },
      { id: "cloud-sync", name: "Cloud sync", note: "End-to-end encrypted, opt-in" },
      { id: "net-worth", name: "Net worth & investments", note: "Groww/Zerodha imports" },
      { id: "loans", name: "Loans and EMI tracking", note: "" }, { id: "credit-score", name: "Credit score", note: "" }, { id: "family", name: "Family finance", note: "" },
    ].map((p) => ({ ...p, isAvailable: () => false })),
    list() { return this.registry.filter((p) => p.id !== "upi-autoimport" || !(GF.auto && GF.auto.available())); },
  };

  /* ================= SELF-TEST ================= */
  GF.selfTest = () => {
    const R = [], ok = (name, cond) => R.push([name, !!cond]);
    const acc = [{ id: "a", opening: 100000 }, { id: "b", opening: 0 }];
    const tx = [{ id: "1", type: "income", amount: 50000, accountId: "a", dateTime: "2026-01-05T10:00" }, { id: "2", type: "expense", amount: 20000, accountId: "a", categoryId: "cat_food", dateTime: "2026-01-06T10:00" }, { id: "3", type: "transfer", amount: 30000, accountId: "a", toAccountId: "b", dateTime: "2026-01-07T10:00" }];
    const T = C.totals(tx, "2026-01-01", "2026-01-31");
    ok("Totals exclude transfers", T.income === 50000 && T.expense === 20000);
    const bA = C.accountBalance(acc[0], tx), bB = C.accountBalance(acc[1], tx);
    ok("Balance = opening + income − expense − transfer out", bA === 100000 + 50000 - 20000 - 30000);
    ok("Transfer moves money between two accounts only", bB === 30000 && bA + bB === 100000 + 50000 - 20000);
    const tx2 = tx.map((t) => (t.id === "2" ? { ...t, amount: 25000 } : t));
    ok("Editing a transaction updates the balance", C.accountBalance(acc[0], tx2) === bA - 5000);
    ok("Deleting a transaction updates the balance", C.accountBalance(acc[0], tx.filter((t) => t.id !== "2")) === bA + 20000);
    const b = C.budgetState(4100, 5000); ok("Budget remaining and %", b.remaining === 900 && Math.round(b.pct) === 82 && b.state === "warning");
    ok("Over budget state", C.budgetState(5450, 5000).state === "over");
    const g = C.goalProgress({ target: 8000000, contributions: [{ amount: 3500000 }] }); ok("Goal remaining", g.remaining === 4500000 && Math.round(g.pct) === 44);
    const data = { transactions: [], recurring: [{ id: "r", active: true, autoPost: true, frequency: "monthly", nextDate: "2026-01-15", type: "expense", amount: 11900, accountId: "a", categoryId: "cat_subscriptions", name: "Spotify" }] };
    const n1 = GF.runRecurring(data, "2026-03-20"); data.recurring[0].nextDate = "2026-01-15"; const n2 = GF.runRecurring(data, "2026-03-20");
    ok("Recurring posts missed dates once (idempotent)", n1 === 3 && n2 === 0 && data.transactions.length === 3);
    ok("Recurring month-end safe", GF.nextDue("2026-01-31", "monthly") === "2026-02-28");
    ok("Bill rolls to next due date", GF.nextDue("2026-11-04", "monthly") === "2026-12-04");
    const h = GF.hidden; GF.hidden = false;
    ok("INR formatting", [50000, 125000, 2500000, 15000000].map((v) => GF.fmt(v)).join("|") === "₹500|₹1,250|₹25,000|₹1,50,000");
    GF.hidden = h;
    const st = GF.parseStatementCsv("Txn Date,Narration,Withdrawal Amt,Deposit Amt,Closing Balance\n24/11/2026,UPI/432112345678/SRI SAI TEA/sai@ybl/Pay,50.00,,1950.00\n25/11/2026,UPI/732154698712/RAVI KUMAR/ravi@okaxis,,1000.00,2950.00");
    ok("Bank statement CSV parsing", st.rows && st.rows.length === 2 && st.rows[0].direction === "DEBIT" && st.rows[0].amountPaise === 5000 && st.rows[0].ref === "432112345678" && st.rows[1].direction === "CREDIT" && st.rows[0].counterparty === "SRI SAI TEA");
    return R;
  };
  GF.acts.selfTest = () => { const r = GF.selfTest(), pass = r.filter((x) => x[1]).length; GF.sheet({ title: `Self-test: ${pass}/${r.length} passed`, body: `<div class="list glass">${r.map(([n, p]) => `<div class="item"><span class="meta"><span class="t">${p ? "✅" : "❌"} ${esc(n)}</span></span></div>`).join("")}</div>` }); };
})();
