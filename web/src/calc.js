/* Finance Tracker — calculations, dates and formatting. dateTime is local "YYYY-MM-DDTHH:mm". */
(function () {
  const GF = window.GF;
  const pad = (n) => String(n).padStart(2, "0");
  const D = {
    pad,
    iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); },
    isoDT(d) { return D.iso(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); },
    parse(s) { const [a, b = "00:00"] = s.split("T"); const [y, m, d] = a.split("-").map(Number); const [h, mi] = b.split(":").map(Number); return new Date(y, m - 1, d, h || 0, mi || 0); },
    today() { return D.iso(new Date()); },
    addDays(iso, n) { const d = D.parse(iso); d.setDate(d.getDate() + n); return D.iso(d); },
    month(iso) { return iso.slice(0, 7); },
    addMonths(mk, n) { const [y, m] = mk.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + "-" + pad(d.getMonth() + 1); },
    monthStart(mk) { return mk + "-01"; },
    monthEnd(mk) { const [y, m] = mk.split("-").map(Number); return mk + "-" + pad(new Date(y, m, 0).getDate()); },
    monthLabel(mk, short) { const [y, m] = mk.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-IN", short ? { month: "short" } : { month: "long", year: "numeric" }); },
    dayLabel(iso) {
      const t = D.today();
      if (iso === t) return "Today";
      if (iso === D.addDays(t, -1)) return "Yesterday";
      return D.parse(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: iso.slice(0, 4) === t.slice(0, 4) ? undefined : "numeric" });
    },
    short(iso) { return D.parse(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); },
    time(dt) { return D.parse(dt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }); },
    diffDays(a, b) { return Math.round((D.parse(b) - D.parse(a)) / 864e5); },
  };
  GF.D = D;

  const nf0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  GF.hidden = false;
  /** Format paise as INR: ₹500, ₹1,250, ₹1,50,000. opts: {sign:true, force:true(ignore hide), abs:true} */
  GF.fmt = function (paise, opts = {}) {
    if (GF.hidden && !opts.force) return "₹••••";
    const v = opts.abs ? Math.abs(paise) : paise;
    const s = (v % 100 ? nf2 : nf0).format(Math.abs(v) / 100);
    if (opts.sign) return (v < 0 ? "−" : v > 0 ? "+" : "") + s;
    return v < 0 ? "−" + s : s;
  };
  GF.toPaise = (str) => { const n = parseFloat(String(str).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : Math.round(n * 100); };
  GF.fromPaise = (p) => (p % 100 ? (p / 100).toFixed(2) : String(p / 100));
  GF.pct = (n) => (isFinite(n) ? Math.round(n) + "%" : "—");

  const C = {
    inRange(t, from, to) { const d = t.dateTime.slice(0, 10); return (!from || d >= from) && (!to || d <= to); },
    accountBalance(acc, txs) {
      let b = acc.opening || 0;
      for (const t of txs) {
        if (t.type === "income" && t.accountId === acc.id) b += t.amount;
        else if (t.type === "expense" && t.accountId === acc.id) b -= t.amount;
        else if (t.type === "transfer") {
          if (t.accountId === acc.id) b -= t.amount;
          if (t.toAccountId === acc.id) b += t.amount;
        }
      }
      return b;
    },
    balances(data) {
      const m = {};
      data.accounts.forEach((a) => (m[a.id] = C.accountBalance(a, data.transactions)));
      return m;
    },
    totalBalance(data) {
      const b = C.balances(data);
      return data.accounts.filter((a) => !a.archived).reduce((s, a) => s + b[a.id], 0);
    },
    /** Totals exclude transfers. */
    totals(txs, from, to) {
      let income = 0, expense = 0;
      for (const t of txs) {
        if (!C.inRange(t, from, to)) continue;
        if (t.type === "income") income += t.amount;
        else if (t.type === "expense") expense += t.amount;
      }
      const savings = income - expense;
      return { income, expense, savings, rate: income > 0 ? (savings / income) * 100 : null };
    },
    byCategory(txs, from, to, type = "expense") {
      const m = {};
      for (const t of txs) if (t.type === type && C.inRange(t, from, to)) m[t.categoryId] = (m[t.categoryId] || 0) + t.amount;
      return Object.entries(m).map(([categoryId, amount]) => ({ categoryId, amount })).sort((a, b) => b.amount - a.amount);
    },
    budgetState(spent, limit) {
      const p = limit > 0 ? (spent / limit) * 100 : spent > 0 ? 100 : 0;
      return { spent, limit, remaining: limit - spent, pct: p, state: p > 100 ? "over" : p >= 80 ? "warning" : "ok" };
    },
    budgetsFor(data, mk) { return data.budgets.filter((b) => b.month === mk); },
    budgetSummary(data, mk) {
      const from = D.monthStart(mk), to = D.monthEnd(mk);
      const list = C.budgetsFor(data, mk);
      const spentBy = {};
      C.byCategory(data.transactions, from, to).forEach((r) => (spentBy[r.categoryId] = r.amount));
      const totalSpent = C.totals(data.transactions, from, to).expense;
      const overallB = list.find((b) => !b.categoryId);
      const cats = list.filter((b) => b.categoryId).map((b) => ({ budget: b, category: GF.cat(b.categoryId), ...C.budgetState(spentBy[b.categoryId] || 0, b.amount) }));
      const overallLimit = overallB ? overallB.amount : cats.reduce((s, c) => s + c.limit, 0);
      return { overall: overallLimit ? C.budgetState(totalSpent, overallLimit) : null, cats, totalSpent };
    },
    goalProgress(g) {
      const saved = (g.contributions || []).reduce((s, c) => s + c.amount, 0);
      const pct = g.target > 0 ? Math.min(100, (saved / g.target) * 100) : 0;
      return { saved, pct, remaining: Math.max(0, g.target - saved), done: saved >= g.target };
    },
    billStatus(b) {
      if (b.paid) return { state: "paid", days: 0, label: "Paid" };
      const days = D.diffDays(D.today(), b.dueDate);
      if (days < 0) return { state: "overdue", days, label: "Overdue by " + -days + (days === -1 ? " day" : " days") };
      if (days === 0) return { state: "due", days, label: "Due today" };
      return { state: "upcoming", days, label: "Due in " + days + (days === 1 ? " day" : " days") };
    },
    /** Named date ranges for analytics. Returns {from,to,prevFrom,prevTo,unit} */
    range(kind, custom) {
      const t = D.today(), mk = D.month(t);
      let from, to = t, unit;
      if (kind === "week") { from = D.addDays(t, -6); unit = "day"; }
      else if (kind === "month") { from = D.monthStart(mk); to = D.monthEnd(mk); unit = "week"; }
      else if (kind === "3m") { from = D.monthStart(D.addMonths(mk, -2)); to = D.monthEnd(mk); unit = "month"; }
      else if (kind === "6m") { from = D.monthStart(D.addMonths(mk, -5)); to = D.monthEnd(mk); unit = "month"; }
      else if (kind === "year") { from = D.monthStart(D.addMonths(mk, -11)); to = D.monthEnd(mk); unit = "month"; }
      else { from = (custom && custom.from) || D.addDays(t, -29); to = (custom && custom.to) || t; if (to < from) [from, to] = [to, from]; const n = D.diffDays(from, to) + 1; unit = n <= 14 ? "day" : n <= 92 ? "week" : "month"; }
      let prevFrom, prevTo;
      if (unit === "month" && kind !== "custom") {
        const n = Math.round(D.diffDays(from, to) / 30.4);
        prevTo = D.addDays(from, -1); prevFrom = D.monthStart(D.addMonths(D.month(from), -n));
      } else if (kind === "month") {
        const pm = D.addMonths(mk, -1); prevFrom = D.monthStart(pm); prevTo = D.monthEnd(pm);
      } else { const n = D.diffDays(from, to) + 1; prevTo = D.addDays(from, -1); prevFrom = D.addDays(from, -n); }
      return { from, to, prevFrom, prevTo, unit };
    },
    buckets(from, to, unit) {
      const out = [];
      if (unit === "day") for (let d = from; d <= to; d = D.addDays(d, 1)) out.push({ from: d, to: d, label: D.parse(d).toLocaleDateString("en-IN", { weekday: "narrow" }) + D.parse(d).getDate() });
      else if (unit === "week") for (let d = from; d <= to; d = D.addDays(d, 7)) { const e = D.addDays(d, 6) > to ? to : D.addDays(d, 6); out.push({ from: d, to: e, label: D.short(d) }); }
      else for (let m = D.month(from); m <= D.month(to); m = D.addMonths(m, 1)) out.push({ from: D.monthStart(m), to: D.monthEnd(m), label: D.monthLabel(m, true) });
      return out;
    },
    isDuplicate(data, tx) {
      const t0 = D.parse(tx.dateTime).getTime();
      return data.transactions.find((t) => t.id !== tx.id && t.type === tx.type && t.amount === tx.amount && t.accountId === tx.accountId && (t.categoryId || null) === (tx.categoryId || null) && Math.abs(D.parse(t.dateTime).getTime() - t0) <= 120000);
    },
  };
  GF.calc = C;
  GF.cat = (id) => GF.store.data.categories.find((c) => c.id === id) || GF.store.data.categories.find((c) => c.id === "cat_other") || { id: "cat_other", name: "Other", icon: "🧩", color: "#94a3b8" };
  GF.acc = (id) => GF.store.data.accounts.find((a) => a.id === id);
})();
