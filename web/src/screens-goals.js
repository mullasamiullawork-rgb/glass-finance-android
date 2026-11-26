/* Finance Tracker — Goals: progress rings, create/edit/delete, add money (optionally as a real transfer to Savings). */
(function () {
  const GF = window.GF, D = GF.D, C = GF.calc, esc = GF.esc, $ = GF.$, $$ = GF.$$;
  const ICONS = ["🎯", "💻", "📱", "🛟", "✈️", "🎮", "🚲", "🎓", "🏠", "🎁"];
  const COLORS = ["#4f5cf0", "#ec4899", "#10b981", "#f59e0b", "#0ea5e9", "#8b5cf6"];
  const amtOk = (v) => { v = String(v).trim().replace(/,/g, ""); const n = parseFloat(v); return v && !isNaN(n) && n > 0 ? GF.toPaise(v) : 0; };
  const savingsAcc = () => GF.store.data.accounts.find((a) => a.type === "savings" && !a.archived);

  /** Months left until the deadline (at least 1), or null without one. */
  function monthsLeft(deadline) {
    if (!deadline) return null;
    const days = D.diffDays(D.today(), deadline);
    return days <= 0 ? 1 : Math.max(1, Math.ceil(days / 30.44));
  }

  function goalCard(g) {
    const p = C.goalProgress(g), m = monthsLeft(g.deadline);
    const late = g.deadline && D.diffDays(D.today(), g.deadline) < 0;
    const perMonth = !p.done && m ? Math.ceil(p.remaining / m / 100) * 100 : 0;
    const badge = p.done ? `<span class="badge ok">✓ Reached</span>` : late ? `<span class="badge over">⚠ Past target date</span>` : perMonth ? `<span class="badge">${GF.fmt(perMonth)}/month needed</span>` : `<span class="badge">No target date</span>`;
    return `<section class="card glass" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <div class="ring" style="width:96px;height:96px">${GF.ring(p.pct, 96, 10, p.done ? "ok" : late ? "warning" : "ok")}<div class="c"><b style="font-size:18px">${GF.pct(p.pct)}</b></div></div>
      <div style="flex:1;min-width:180px">
        <div class="row" style="gap:8px;align-items:center"><span aria-hidden="true" style="font-size:20px">${g.icon || "🎯"}</span><b style="font-size:17px;flex:1">${esc(g.name)}${g.isSample ? '<span class="demo">Demo</span>' : ""}</b>
          <button class="iconbtn" data-act="goalEdit" data-id="${g.id}" aria-label="Edit ${esc(g.name)}">${GF.icon("edit")}</button></div>
        <div style="margin:6px 0 8px">${badge}</div>
        <div class="kpis"><div class="kpi"><span>Saved</span><b class="amt inc">${GF.fmt(p.saved)}</b></div><div class="kpi"><span>Target</span><b class="amt">${GF.fmt(g.target)}</b></div><div class="kpi"><span>Remaining</span><b class="amt">${GF.fmt(p.remaining)}</b></div></div>
        <p class="small muted" style="margin:8px 0">${g.deadline ? "Target date " + D.short(g.deadline) + " " + g.deadline.slice(0, 4) : "No target date"} · ${(g.contributions || []).length} contribution${(g.contributions || []).length === 1 ? "" : "s"}</p>
        ${p.done ? "" : `<button class="btn primary" data-act="goalAdd" data-id="${g.id}">${GF.icon("plus")} Add money</button>`}
      </div></section>`;
  }

  GF.screen("goals", {
    tab: "more",
    title: () => "Goals",
    render() {
      const gs = GF.store.data.goals;
      const tot = gs.reduce((s, g) => s + C.goalProgress(g).saved, 0), tgt = gs.reduce((s, g) => s + g.target, 0);
      const open = gs.filter((g) => !C.goalProgress(g).done), done = gs.filter((g) => C.goalProgress(g).done);
      return `${GF.topbar("Goals", { back: true, right: `<button class="iconbtn glass" data-act="goalEdit" aria-label="New goal">${GF.icon("plus")}</button>` })}
      ${gs.length ? `<section class="hero glass"><div class="lbl">Saved across ${gs.length} goal${gs.length === 1 ? "" : "s"}</div><div class="big amt">${GF.fmt(tot)}</div><div class="small muted amt">of ${GF.fmt(tgt)} · ${done.length} reached</div></section>
        ${open.map(goalCard).join("")}${done.length ? `<h2 class="h2">Reached</h2>${done.map(goalCard).join("")}` : ""}`
      : `<div class="empty glass card"><div class="e">🎯</div><p>No goals yet. Save towards a laptop, a trip or an emergency fund.</p><button class="btn primary" data-act="goalEdit">Create a goal</button></div>`}`;
    },
  });

  GF.acts.goalEdit = (el) => {
    const ex = el.dataset.id ? GF.store.get("goals", el.dataset.id) : null;
    const s = ex ? { ...ex } : { name: "", icon: ICONS[0], color: COLORS[0], target: 0, deadline: D.addMonths(D.month(D.today()), 6) + "-01", contributions: [] };
    GF.closeAll(() => GF.sheet({
      title: ex ? "Edit goal" : "New goal",
      body: `<label class="field"><span>Name</span><input class="input" id="gl-name" value="${esc(s.name)}" placeholder="e.g. New laptop" maxlength="40" autofocus></label>
      <label class="field"><span>Icon</span></label><div class="chips" id="gl-icon" style="margin-bottom:12px">${ICONS.map((i) => `<button class="chip" data-v="${i}" aria-pressed="${s.icon === i}" aria-label="Icon ${i}">${i}</button>`).join("")}</div>
      <label class="field"><span>Target (₹)</span><input class="input amt" id="gl-target" inputmode="decimal" value="${s.target ? GF.fromPaise(s.target) : ""}" placeholder="e.g. 80000"></label>
      <label class="field"><span>Target date (optional)</span><input class="input" type="date" id="gl-date" value="${s.deadline || ""}"></label>
      <div class="errbox" id="gl-err" hidden></div>
      <button class="btn primary block" id="gl-save">${ex ? "Save changes" : "Create goal"}</button>
      ${ex ? `<button class="btn block" id="gl-del" style="margin-top:10px;color:var(--expense)">${GF.icon("trash")} Delete goal</button>` : ""}`,
      mount(sh) {
        $$("#gl-icon .chip", sh).forEach((b) => (b.onclick = () => { s.icon = b.dataset.v; $$("#gl-icon .chip", sh).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
        $("#gl-save", sh).onclick = () => {
          const e = $("#gl-err", sh), fail = (m) => { e.hidden = false; e.textContent = m; GF.haptic(30); };
          s.name = $("#gl-name", sh).value.trim();
          s.target = amtOk($("#gl-target", sh).value);
          s.deadline = $("#gl-date", sh).value || null;
          if (!s.name) return fail("Give the goal a name.");
          if (!s.target) return fail("Target must be a number above zero.");
          GF.closeAll(() => { GF.store.upsert("goals", s); GF.toast(ex ? "Goal updated" : "Goal created"); });
        };
        if (ex) $("#gl-del", sh).onclick = () => GF.closeAll(async () => {
          const n = (ex.contributions || []).length;
          const ok = await GF.confirm({ title: `Delete ${esc(ex.name)}?`, msg: `Its ${n} contribution record${n === 1 ? "" : "s"} go too. Transfers already made stay in your transactions.`, ok: "Delete goal", danger: true });
          if (!ok) return;
          const removed = GF.store.remove("goals", ex.id);
          GF.toast("Goal deleted", { undo: () => GF.store.upsert("goals", removed) });
        });
      },
    }));
  };

  GF.acts.goalAdd = (el) => {
    const g = GF.store.get("goals", el.dataset.id);
    if (!g) return;
    const sav = savingsAcc();
    const from = GF.store.data.accounts.filter((a) => !a.archived && (!sav || a.id !== sav.id));
    const s = { move: false, from: (from.find((a) => a.id === GF.store.data.settings.lastAccountId) || from[0] || {}).id };
    const rem = C.goalProgress(g).remaining;
    GF.closeAll(() => GF.sheet({
      title: "Add money · " + g.name,
      body: `<p class="small muted amt" style="margin:0 4px 10px">${GF.fmt(rem)} to go</p>
      <label class="field"><span>Amount (₹)</span><input class="input amt" id="ga-amt" inputmode="decimal" placeholder="e.g. 2000" autofocus></label>
      <label class="field"><span>Date</span><input class="input" type="date" id="ga-date" value="${D.today()}" max="${D.today()}"></label>
      ${sav && from.length ? `<div class="row" style="gap:12px;margin:6px 4px 12px"><span style="flex:1"><b style="font-size:15px">Also move from an account to ${esc(sav.name)}</b><span class="small muted" style="display:block">Records a real transfer transaction</span></span><button class="toggle" role="switch" id="ga-move" aria-checked="false" aria-label="Also move money to ${esc(sav.name)}"></button></div>
      <div id="ga-from" hidden><label class="field"><span>From account</span></label><div class="chips" style="margin-bottom:12px">${from.map((a) => `<button class="chip" data-v="${a.id}" aria-pressed="${a.id === s.from}">${a.icon} ${esc(a.name)}</button>`).join("")}</div></div>`
      : `<p class="small muted" style="margin:6px 4px 12px">Add a Savings account to also record a real transfer.</p>`}
      <div class="errbox" id="ga-err" hidden></div>
      <button class="btn primary block" id="ga-save">Add contribution</button>`,
      mount(sh) {
        const t = $("#ga-move", sh);
        if (t) t.onclick = () => { s.move = !s.move; t.setAttribute("aria-checked", s.move); $("#ga-from", sh).hidden = !s.move; GF.haptic(); };
        $$("#ga-from .chip", sh).forEach((b) => (b.onclick = () => { s.from = b.dataset.v; $$("#ga-from .chip", sh).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
        $("#ga-save", sh).onclick = () => {
          const e = $("#ga-err", sh), fail = (m) => { e.hidden = false; e.textContent = m; GF.haptic(30); };
          const amount = amtOk($("#ga-amt", sh).value), date = $("#ga-date", sh).value || D.today();
          if (!amount) return fail("Amount must be a number above zero.");
          if (date > D.today()) return fail("The date can't be in the future.");
          if (s.move && !s.from) return fail("Pick the account to move money from.");
          GF.closeAll(() => {
            const c = { id: GF.uid(), amount, date, accountId: sav ? sav.id : null };
            if (s.move) {
              const tx = { type: "transfer", amount, accountId: s.from, toAccountId: sav.id, categoryId: null, dateTime: date + "T" + (date === D.today() ? D.isoDT(new Date()).slice(11) : "12:00"), merchant: "Goal: " + g.name, note: "", paymentMethod: "Net Banking", goalId: g.id, isSample: false };
              GF.store.upsert("transactions", tx, true);
              c.txId = tx.id;
              (GF.hooks.afterTxSave || []).forEach((f) => f(tx));
            }
            g.contributions = [...(g.contributions || []), c];
            GF.store.upsert("goals", g);
            GF.haptic(12);
            GF.toast(C.goalProgress(g).done ? `🎉 ${g.name} reached!` : `Added ${GF.fmt(amount)} to ${g.name}${s.move ? " · transfer recorded" : ""}`);
          });
        };
      },
    }));
  };
})();
