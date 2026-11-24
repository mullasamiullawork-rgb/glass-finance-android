/* Glass Finance — Home and More screens. */
(function () {
  const GF = window.GF, D = GF.D, C = GF.calc, esc = GF.esc;

  GF.sampleBanner = () => {
    const d = GF.store.data;
    if (!GF.store.hasSample() || d.meta.sampleBannerDismissed) return "";
    return `<div class="banner glass" role="status"><p>👋 You're viewing sample data</p><div class="row"><button class="btn sm primary" data-act="clearSample">Clear sample data</button><button class="btn sm" data-act="keepExploring">Keep exploring</button></div></div>`;
  };
  GF.acts.clearSample = async () => {
    if (await GF.confirm({ title: "Clear sample data?", msg: "This removes every demo account, transaction, budget, goal, bill and recurring item. Anything you added yourself stays.", ok: "Clear sample data", danger: true })) {
      GF.store.clearSample(); GF.toast("Sample data cleared");
    }
  };
  GF.acts.keepExploring = () => { GF.store.data.meta.sampleBannerDismissed = true; GF.store.save(); };
  GF.acts.toggleHide = () => { GF.hidden = !GF.hidden; GF.haptic(); GF.render(); };

  const greeting = () => { const h = new Date().getHours(); return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
  let counted = false;

  GF.screen("home", {
    tab: "home",
    title: () => "Home",
    render() {
      const d = GF.store.data, txs = d.transactions, t = D.today(), mk = D.month(t);
      const bal = C.balances(d);
      const total = C.totalBalance(d);
      const m = C.totals(txs, D.monthStart(mk), D.monthEnd(mk));
      const all = C.totals(txs);
      const bs = C.budgetSummary(d, mk);
      const bills = d.bills.filter((b) => !b.paid).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)).slice(0, 3);
      const accts = d.accounts.filter((a) => !a.archived);
      const recent = [...txs].sort((a, b) => (a.dateTime < b.dateTime ? 1 : -1)).slice(0, 5);
      const eye = `<button class="iconbtn glass" data-act="toggleHide" aria-pressed="${GF.hidden}" aria-label="${GF.hidden ? "Show" : "Hide"} balances">${GF.icon(GF.hidden ? "eyeoff" : "eye")}</button>`;
      const name = d.settings.name ? ", " + esc(d.settings.name) : "";
      return `${GF.topbar(greeting() + (d.settings.name ? ", " + d.settings.name : ""), { sub: new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }), right: `<a class="iconbtn glass" href="#/search" aria-label="Search">${GF.icon("search")}</a>` + eye + `<a class="iconbtn glass" href="#/settings" aria-label="Settings">${GF.icon("gear")}</a>` })}
      ${GF.sampleBanner()}${GF.autoHomeCard ? GF.autoHomeCard() : ""}
      <section class="hero glass" aria-label="Total balance">
        <div class="lbl">Total balance</div>
        <div class="big amt" id="hero-bal">${GF.fmt(total)}</div>
        <div class="kpis">
          <div class="kpi"><span>↑ Income</span><b class="amt inc">+${GF.fmt(m.income)}</b></div>
          <div class="kpi"><span>↓ Expense</span><b class="amt exp">−${GF.fmt(m.expense)}</b></div>
          <div class="kpi"><span>Saved</span><b class="amt">${GF.fmt(m.savings)}</b></div>
        </div>
        <div class="between small muted" style="margin-top:12px"><span>${D.monthLabel(mk)} · savings rate <b class="amt" style="color:var(--text)">${m.rate == null ? "—" : GF.pct(m.rate)}</b></span></div>
        <div class="between tiny muted" style="margin-top:4px"><span>All time: <span class="inc">↑ ${GF.fmt(all.income)}</span> · <span class="exp">↓ ${GF.fmt(all.expense)}</span></span></div>
      </section>
      <h2 class="h2">Accounts <a href="#/accounts">See all</a></h2>
      <div class="carousel" role="list">
        ${accts.map((a) => `<button role="listitem" class="acard glass" data-act="nav" data-to="#/account/${a.id}"><span class="between"><span class="ico">${a.icon}</span>${a.isSample ? '<span class="demo">Demo</span>' : ""}</span><span><span class="small muted">${esc(a.name)}</span><br><b class="amt ${bal[a.id] < 0 ? "exp" : ""}">${GF.fmt(bal[a.id])}</b></span></button>`).join("")}
        <button role="listitem" class="acard glass" data-act="accountEdit" style="align-items:center;justify-content:center;flex-basis:40%">${GF.icon("plus")}<span class="small">Add account</span></button>
      </div>
      <h2 class="h2">Budget · ${D.monthLabel(mk, true)} <a href="#/budget">Details</a></h2>
      ${bs.overall ? `<a class="card glass row" href="#/budget" style="text-decoration:none;color:inherit">
        <div class="ring">${GF.ring(bs.overall.pct, 120, 12, bs.overall.state)}<div class="c"><b class="amt">${GF.pct(bs.overall.pct)}</b><span class="tiny muted">used</span></div></div>
        <div><div class="amt" style="font-size:20px;font-weight:700">${GF.fmt(bs.overall.spent)}</div><div class="small muted">of ${GF.fmt(bs.overall.limit)} spent</div>
        <div style="margin-top:8px"><span class="badge ${bs.overall.state}">${bs.overall.state === "over" ? "⚠ " : bs.overall.state === "warning" ? "! " : "✓ "}${GF.stateText(bs.overall)}</span></div></div></a>`
        : `<div class="card glass between"><span class="muted">No budget set for this month.</span><a class="btn sm" href="#/budget">Set budget</a></div>`}
      <h2 class="h2">Upcoming bills <a href="#/bills">All bills</a></h2>
      ${bills.length ? `<div class="list glass">${bills.map((b) => { const s = C.billStatus(b); return `<a class="item" href="#/bills" style="text-decoration:none;color:inherit">${GF.catIcon(GF.cat(b.categoryId))}<span class="meta"><span class="t">${esc(b.name)}${b.isSample ? '<span class="demo">Demo</span>' : ""}</span><span class="s">${D.short(b.dueDate)}${b.autopay ? " · Autopay" : ""}</span></span><span style="text-align:right"><b class="amt">${GF.fmt(b.amount)}</b><br><span class="badge ${s.state === "overdue" ? "over" : s.days <= 3 ? "warning" : ""}">${s.label}</span></span></a>`; }).join("")}</div>` : `<div class="card glass muted">No upcoming bills.</div>`}
      <h2 class="h2">Goals <a href="#/goals">All goals</a></h2>
      ${d.goals.length ? `<div class="list glass">${d.goals.map((g) => { const p = C.goalProgress(g); return `<a class="item" href="#/goals" style="text-decoration:none;color:inherit;flex-wrap:wrap"><span class="cat" style="background:${g.color}26">${g.icon}</span><span class="meta"><span class="t">${esc(g.name)}</span><span class="s amt">${GF.fmt(p.saved)} of ${GF.fmt(g.target)}</span></span><b class="amt">${GF.pct(p.pct)}</b><span style="flex-basis:100%">${GF.bar(p.pct, "goal")}</span></a>`; }).join("")}</div>` : `<div class="card glass muted">No goals yet.</div>`}
      ${GF.homeExtras ? GF.homeExtras() : ""}
      <h2 class="h2">Recent transactions <a href="#/tx">See all</a></h2>
      ${recent.length ? `<div class="list glass">${recent.map((t) => GF.txRow(t, { showDate: true })).join("")}</div>` : `<div class="empty glass card"><div class="e">🧾</div><p>No transactions yet. Tap + to add your first one.</p></div>`}`;
    },
    mount(root, p, same) {
      if (!counted && !same) { counted = true; GF.countUp(GF.$("#hero-bal", root), GF.calc.totalBalance(GF.store.data)); }
    },
  });

  /* More: hub for secondary screens. Later phases register screens with the same names. */
  GF.MORE = [
    ["accounts", "🏦", "Accounts", "Balances, add, archive"],
    ["goals", "🎯", "Goals", "Save towards things"],
    ["savings", "🐷", "Savings", "Savings rate and history"],
    ["bills", "🧾", "Bills", "Due dates and reminders"],
    ["recurring", "🔁", "Recurring", "Allowance, subscriptions, passes"],
    ["insights", "💡", "Insights", "Patterns in your spending"],
    ["assistant", "✨", "Assistant", "Ask about your money"],
    ["settings", "⚙️", "Settings", "Profile, theme, data"],
  ];
  GF.screen("more", {
    tab: "more",
    title: () => "More",
    render() {
      const items = [...GF.MORE, ...GF.hooks.moreItems];
      return `${GF.topbar("More")}<div class="list glass">${items.map(([id, ic, t, s]) => `<a class="item" href="#/${id}" style="text-decoration:none;color:inherit"><span class="cat" style="background:var(--glass-3)">${ic}</span><span class="meta"><span class="t">${t}</span><span class="s">${s}</span></span><span class="chev">${GF.icon("chev")}</span></a>`).join("")}</div>
      <p class="tiny muted" style="text-align:center">Glass Finance · data stays on this device${GF.store.persistent ? "" : " (not saved: storage unavailable)"}</p>`;
    },
  });

  /* Placeholder for screens not built yet (goals, savings, bills, recurring, insights, assistant…). */
  GF.screen("placeholder", {
    tab: "more",
    title: (p) => "Coming soon",
    render(p, name) {
      const m = GF.MORE.find((x) => x[0] === name);
      return `${GF.topbar(m ? m[2] : "Not found", { back: true })}<div class="empty glass card"><div class="e">${m ? m[1] : "🧭"}</div><p><b>${m ? m[2] + " is coming in the next update." : "This page doesn't exist."}</b></p><p class="small">${m ? esc(m[3]) + "." : ""}</p><a class="btn" href="#/home">Back to Home</a></div>`;
    },
  });
})();
