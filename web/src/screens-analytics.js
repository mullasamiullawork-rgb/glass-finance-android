/* Finance Tracker — Analytics with hand-drawn SVG charts. */
(function () {
  const GF = window.GF, D = GF.D, C = GF.calc, esc = GF.esc, $ = GF.$;
  GF.an = { kind: "month", from: D.addDays(D.today(), -29), to: D.today() };
  const KINDS = [["week", "Week"], ["month", "Month"], ["3m", "3M"], ["6m", "6M"], ["year", "Year"], ["custom", "Custom"]];
  const compact = (p) => { const r = p / 100; return GF.hidden ? "•" : r >= 1e5 ? "₹" + +(r / 1e5).toFixed(1) + "L" : r >= 1e3 ? "₹" + +(r / 1e3).toFixed(1) + "k" : "₹" + Math.round(r); };
  const niceMax = (v) => { if (v <= 0) return 100000; const e = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].map((m) => m * e).find((x) => x >= v); };

  function barChart(r) {
    const txs = GF.store.data.transactions, bs = C.buckets(r.from, r.to, r.unit);
    const data = bs.map((b) => ({ ...b, ...C.totals(txs, b.from, b.to) }));
    const max = niceMax(Math.max(...data.map((x) => Math.max(x.income, x.expense))));
    const W = 340, H = 190, L = 40, B = 22, T = 8, cw = (W - L) / data.length, bw = Math.min(16, cw * 0.32);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    let g = "";
    for (let i = 0; i <= 4; i++) { const v = (max * i) / 4; g += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${compact(v)}</text>`; }
    const step = Math.ceil(data.length / 8);
    data.forEach((d, i) => {
      const x = L + i * cw + cw / 2;
      g += `<g><title>${esc(d.label)}: income ${GF.fmt(d.income)}, expense ${GF.fmt(d.expense)}</title>
        <rect x="${x - bw - 1}" y="${y(d.income)}" width="${bw}" height="${Math.max(0, H - B - y(d.income))}" rx="3" fill="var(--income)"/>
        <rect x="${x + 1}" y="${y(d.expense)}" width="${bw}" height="${Math.max(0, H - B - y(d.expense))}" rx="3" fill="url(#hatch)" stroke="var(--expense)" stroke-width="1"/></g>`;
      if (i % step === 0) g += `<text x="${x}" y="${H - 6}" text-anchor="middle">${esc(d.label)}</text>`;
    });
    const tot = C.totals(txs, r.from, r.to);
    return `<div class="chartbox"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Income ${GF.fmt(tot.income)} and expense ${GF.fmt(tot.expense)} by ${r.unit}">
      <defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--expense)" opacity=".55"/><line x1="0" y1="0" x2="0" y2="5" stroke="var(--expense)" stroke-width="3"/></pattern></defs>${g}</svg></div>
      <div class="legend"><span><i style="background:var(--income)"></i>↑ Income (solid)</span><span><i style="background:url(#hatch);background:repeating-linear-gradient(45deg,var(--expense) 0 2px,transparent 2px 4px);border:1px solid var(--expense)"></i>↓ Expense (striped)</span></div>`;
  }

  function donut(rows, total) {
    if (!total) return `<p class="muted">No spending in this period.</p>`;
    const top = rows.slice(0, 6), rest = rows.slice(6).reduce((s, x) => s + x.amount, 0);
    const parts = top.map((x) => ({ c: GF.cat(x.categoryId), amount: x.amount }));
    if (rest) parts.push({ c: { name: "Everything else", color: "#94a3b8", icon: "…" }, amount: rest });
    const R = 54, CIRC = 2 * Math.PI * R;
    let off = 0, arcs = "";
    parts.forEach((p) => { const len = (p.amount / total) * CIRC; arcs += `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${p.c.color}" stroke-width="22" stroke-dasharray="${Math.max(0, len - 1.5)} ${CIRC}" stroke-dashoffset="${-off}"><title>${esc(p.c.name)} ${GF.fmt(p.amount)}</title></circle>`; off += len; });
    return `<div class="donutwrap"><svg viewBox="0 0 140 140" role="img" aria-label="Spending by category">${arcs}</svg>
      <ul style="list-style:none;margin:0;padding:0;flex:1;font-size:13px">${parts.map((p) => `<li class="between" style="padding:3px 0"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${p.c.color};margin-right:6px"></i>${p.c.icon} ${esc(p.c.name)}</span><b class="amt">${GF.pct((p.amount / total) * 100)}</b></li>`).join("")}</ul></div>`;
  }

  const delta = (cur, prev, goodUp) => {
    if (!prev) return `<span class="d muted">${cur ? "New" : "—"}</span>`;
    const ch = ((cur - prev) / Math.abs(prev)) * 100, up = ch >= 0, good = up === goodUp;
    return `<span class="d ${Math.abs(ch) < 0.5 ? "muted" : good ? "inc" : "exp"}">${up ? "▲" : "▼"} ${Math.abs(Math.round(ch))}%</span>`;
  };

  GF.screen("analytics", {
    tab: "analytics",
    title: () => "Analytics",
    render() {
      const a = GF.an, r = C.range(a.kind, { from: a.from, to: a.to }), txs = GF.store.data.transactions;
      const cur = C.totals(txs, r.from, r.to), prev = C.totals(txs, r.prevFrom, r.prevTo);
      const rows = C.byCategory(txs, r.from, r.to), prevRows = C.byCategory(txs, r.prevFrom, r.prevTo);
      const prevMap = Object.fromEntries(prevRows.map((x) => [x.categoryId, x.amount]));
      const maxCat = rows[0] ? rows[0].amount : 1;
      return `${GF.topbar("Analytics", { sub: `${D.short(r.from)} – ${D.short(r.to)} ${r.to.slice(0, 4)}` })}
      <div class="seg" role="group" aria-label="Range" style="margin-bottom:12px">${KINDS.map(([k, l]) => `<button data-act="anKind" data-k="${k}" aria-pressed="${a.kind === k}">${l}</button>`).join("")}</div>
      ${a.kind === "custom" ? `<div class="grid2"><label class="field"><span>From</span><input class="input" type="date" id="an-from" value="${a.from}"></label><label class="field"><span>To</span><input class="input" type="date" id="an-to" value="${a.to}"></label></div>` : ""}
      <div class="grid2" style="margin-bottom:14px">
        <div class="card glass" style="margin:0"><div class="small muted">↑ Income</div><div class="amt inc" style="font-size:20px;font-weight:700">+${GF.fmt(cur.income)}</div></div>
        <div class="card glass" style="margin:0"><div class="small muted">↓ Expense</div><div class="amt exp" style="font-size:20px;font-weight:700">−${GF.fmt(cur.expense)}</div></div>
        <div class="card glass" style="margin:0"><div class="small muted">Net savings</div><div class="amt" style="font-size:20px;font-weight:700">${GF.fmt(cur.savings)}</div></div>
        <div class="card glass" style="margin:0"><div class="small muted">Savings rate</div><div class="amt" style="font-size:20px;font-weight:700">${cur.rate == null ? "—" : GF.pct(cur.rate)}</div></div>
      </div>
      <section class="card glass"><h3 style="margin:0 0 10px;font-size:16px">Income vs expense</h3>${barChart(r)}</section>
      <section class="card glass"><h3 style="margin:0 0 10px;font-size:16px">Where the money went</h3>${donut(rows, cur.expense)}</section>
      <h2 class="h2">Highest categories</h2>
      ${rows.length ? `<div class="list glass">${rows.slice(0, 8).map((x) => { const c = GF.cat(x.categoryId); return `<div class="item" style="flex-wrap:wrap;row-gap:6px">${GF.catIcon(c)}<span class="meta"><span class="t">${esc(c.name)}</span><span class="s">${GF.pct((x.amount / cur.expense) * 100)} of spending · ${delta(x.amount, prevMap[x.categoryId], false).replace('class="d', 'class="d tiny')}</span></span><b class="amt">${GF.fmt(x.amount)}</b><span style="flex-basis:100%"><div class="bar"><i style="width:${(x.amount / maxCat) * 100}%;background:${c.color}"></i></div></span></div>`; }).join("")}</div>` : `<div class="card glass muted">No expenses in this period.</div>`}
      <h2 class="h2">Compared with previous period</h2>
      <section class="card glass"><p class="small muted" style="margin:0 0 10px">${D.short(r.prevFrom)} – ${D.short(r.prevTo)} ${r.prevTo.slice(0, 4)}</p>
        <div class="cmp"><span class="small muted">Metric</span><span class="small muted">Before → now</span><span class="small muted">Change</span>
        <span>↑ Income</span><span class="amt small">${GF.fmt(prev.income)} → ${GF.fmt(cur.income)}</span>${delta(cur.income, prev.income, true)}
        <span>↓ Expense</span><span class="amt small">${GF.fmt(prev.expense)} → ${GF.fmt(cur.expense)}</span>${delta(cur.expense, prev.expense, false)}
        <span>Savings</span><span class="amt small">${GF.fmt(prev.savings)} → ${GF.fmt(cur.savings)}</span>${delta(cur.savings, prev.savings, true)}</div>
        <p class="tiny muted" style="margin:10px 0 0">Green means better for you, coral means worse. Transfers are not counted.</p></section>`;
    },
    mount(root) {
      const f = $("#an-from", root), t = $("#an-to", root);
      if (f) [f, t].forEach((i) => (i.onchange = () => { if (f.value && t.value) { GF.an.from = f.value; GF.an.to = t.value; GF.render(); } }));
    },
  });
  GF.acts.anKind = (el) => { GF.an.kind = el.dataset.k; GF.haptic(); GF.render(); };
})();
