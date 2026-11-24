/* Glass Finance — realistic Indian sample data for the last 6 months. Everything isSample. */
(function () {
  const GF = window.GF;
  GF.seed = function (data) {
    const D = GF.D;
    let s = 20240611;
    const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ri = (a, b) => Math.round(a + rnd() * (b - a));
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const P = (r) => r * 100;
    const S = { isSample: true };
    const today = D.today();
    const acc = (id, name, type, icon, color, opening) => ({ id: "acc_" + id, name, type, icon, color, opening: P(opening), archived: false, ...S });
    data.accounts = [
      acc("cash", "Cash", "cash", "💵", "#10b981", 2500),
      acc("sbi", "SBI Bank", "bank", "🏦", "#2563eb", 18000),
      acc("sav", "Savings", "savings", "🐷", "#8b5cf6", 40000),
      acc("paytm", "Paytm UPI", "wallet", "📱", "#0ea5e9", 1200),
      acc("hdfc", "HDFC Credit Card", "credit", "💳", "#f43f5e", 0),
    ];
    const txs = [];
    const add = (date, type, amount, o = {}) => {
      if (date > today) return;
      const dt = date + "T" + D.pad(o.h ?? ri(8, 22)) + ":" + D.pad(o.m ?? ri(0, 59));
      txs.push({ id: "tx_s" + txs.length, type, amount: P(amount), accountId: o.acc || "acc_sbi", toAccountId: o.to || null, categoryId: type === "transfer" ? null : o.cat, dateTime: dt, merchant: o.merchant || "", note: o.note || "", paymentMethod: o.pm || (type === "transfer" ? "Net Banking" : "UPI"), ...S });
    };
    const cm = D.month(today);
    for (let k = 5; k >= 0; k--) {
      const mk = D.addMonths(cm, -k);
      const days = Number(D.monthEnd(mk).slice(8));
      const day = (n) => mk + "-" + D.pad(Math.min(n, days));
      add(day(1), "income", 5000, { cat: "cat_allowance", merchant: "Monthly allowance", note: "From home", pm: "Net Banking", h: 9 });
      if (k % 2 === 1 || k === 0) add(day(ri(12, 24)), "income", pick([2500, 3500, 4000, 6000]), { cat: "cat_freelance", merchant: pick(["Logo design client", "Fiverr payout", "Website fix", "Tuition"]), pm: "UPI" });
      if (k === 3) add(day(20), "income", 1000, { cat: "cat_gifts", merchant: "Birthday gift", note: "From Nani", acc: "acc_cash", pm: "Cash" });
      add(day(2), "transfer", 1000, { acc: "acc_sbi", to: "acc_cash", merchant: "ATM withdrawal", pm: "Debit Card" });
      if (k % 2 === 0) add(day(16), "transfer", 1000, { acc: "acc_sbi", to: "acc_cash", merchant: "ATM withdrawal", pm: "Debit Card" });
      add(day(5), "transfer", 1500, { acc: "acc_sbi", to: "acc_sav", merchant: "Monthly saving", pm: "Net Banking" });
      add(day(3), "transfer", 2000, { acc: "acc_sbi", to: "acc_paytm", merchant: "Wallet top-up", pm: "UPI" });
      // Food
      for (let i = 0; i < 12; i++) add(day(ri(1, days)), "expense", ri(15, 30), { cat: "cat_food", merchant: pick(["Chai Point", "Tapri chai", "College canteen"]), acc: "acc_cash", pm: "Cash" });
      for (let i = 0; i < ri(5, 9); i++) add(day(ri(1, days)), "expense", ri(160, 460), { cat: "cat_food", merchant: pick(["Swiggy", "Zomato"]), acc: pick(["acc_paytm", "acc_sbi"]), pm: "UPI", note: pick(["", "Biryani", "Late night order", "Dosa"]) });
      // Transport
      for (let i = 0; i < 4; i++) add(day(ri(1, days)), "expense", ri(60, 150), { cat: "cat_transport", merchant: "Auto rickshaw", acc: "acc_paytm", pm: "UPI" });
      if (rnd() > 0.4) add(day(ri(5, 25)), "expense", ri(3, 5) * 100, { cat: "cat_transport", merchant: "Indian Oil petrol", acc: "acc_sbi", pm: "Debit Card", note: "Scooty" });
      // Education
      if (k % 3 === 0) add(day(ri(5, 20)), "expense", 1500, { cat: "cat_education", merchant: "Coursera", acc: "acc_hdfc", pm: "Credit Card" });
      if (rnd() > 0.5) add(day(ri(1, days)), "expense", ri(250, 450), { cat: "cat_education", merchant: pick(["Sapna Book House", "Amazon books"]), acc: "acc_sbi", pm: "UPI" });
      // Shopping on credit card, paid off next month
      const shop = k === 1 ? [ri(2200, 2600), ri(1000, 1400)] : k === 3 ? [ri(1500, 1800), ri(800, 1000)] : [ri(500, 1600)];
      shop.forEach((a) => add(day(ri(3, days)), "expense", a, { cat: "cat_shopping", merchant: pick(["Amazon", "AJIO", "Myntra"]), acc: "acc_hdfc", pm: "Credit Card" }));
      // Entertainment
      if (rnd() > 0.3) add(day(ri(6, days)), "expense", ri(250, 500), { cat: "cat_entertainment", merchant: "BookMyShow", acc: "acc_hdfc", pm: "Credit Card", note: "Movie with friends" });
      add(day(7), "expense", 119, { cat: "cat_subscriptions", merchant: "Spotify", acc: "acc_hdfc", pm: "Credit Card" });
      add(day(11), "expense", 129, { cat: "cat_subscriptions", merchant: "YouTube Premium", acc: "acc_sbi", pm: "UPI" });
      // Bills
      add(day(4), "expense", 299, { cat: "cat_bills", merchant: "Jio recharge", acc: "acc_paytm", pm: "UPI" });
      if (k > 0) add(day(ri(9, 14)), "expense", ri(600, 900), { cat: "cat_bills", merchant: "Electricity bill (MSEDCL)", acc: "acc_sbi", pm: "Net Banking" });
      if (rnd() > 0.5) add(day(ri(1, days)), "expense", ri(150, 400), { cat: "cat_health", merchant: pick(["Apollo Pharmacy", "MedPlus"]), acc: "acc_cash", pm: "Cash" });
      // Weekly bus pass
      for (let w = 1; w <= days; w += 7) add(day(w), "expense", 150, { cat: "cat_transport", merchant: "BEST weekly bus pass", acc: "acc_cash", pm: "Cash", h: 8 });
    }
    // Pay off each month's credit card spend on the 10th of the next month.
    const ccSpend = {};
    txs.forEach((t) => { if (t.accountId === "acc_hdfc" && t.type === "expense") { const m = t.dateTime.slice(0, 7); ccSpend[m] = (ccSpend[m] || 0) + t.amount; } });
    Object.entries(ccSpend).forEach(([m, amt]) => add(D.addMonths(m, 1) + "-10", "transfer", amt / 100, { acc: "acc_sbi", to: "acc_hdfc", merchant: "HDFC card bill", pm: "Net Banking", h: 10 }));
    data.transactions = txs.filter((t) => t.amount > 0).sort((a, b) => (a.dateTime < b.dateTime ? 1 : -1));

    // Budgets for every seeded month
    data.budgets = [];
    for (let k = 5; k >= 0; k--) {
      const mk = D.addMonths(cm, -k);
      [[null, 12000], ["cat_food", 5000], ["cat_transport", 2000], ["cat_shopping", 3000], ["cat_entertainment", 1000]].forEach(([c, a]) =>
        data.budgets.push({ id: "bud_" + mk + "_" + (c || "all"), month: mk, categoryId: c, amount: P(a), ...S }));
    }
    const contrib = (amounts) => amounts.map(([a, ago], i) => ({ id: "gc" + i + "_" + a + ago, amount: P(a), date: D.addDays(today, -ago), accountId: "acc_sav" }));
    data.goals = [
      { id: "goal_laptop", name: "New Laptop", icon: "💻", color: "#4f5cf0", target: P(80000), deadline: D.addMonths(cm, 5) + "-28", contributions: contrib([[20000, 160], [5000, 120], [5000, 70], [5000, 20]]), ...S },
      { id: "goal_iphone", name: "iPhone fund", icon: "📱", color: "#ec4899", target: P(60000), deadline: D.addMonths(cm, 10) + "-01", contributions: contrib([[8000, 90], [4000, 30]]), ...S },
      { id: "goal_emerg", name: "Emergency fund", icon: "🛟", color: "#10b981", target: P(25000), deadline: null, contributions: contrib([[6000, 150], [3000, 45]]), ...S },
    ];
    const bill = (id, name, amt, offset, cat, accId, extra = {}) => ({ id: "bill_" + id, name, amount: P(amt), dueDate: D.addDays(today, offset), categoryId: cat, accountId: accId, repeat: "monthly", paid: false, ...extra, ...S });
    data.bills = [
      bill("jio", "Jio prepaid", 299, 3, "cat_bills", "acc_paytm"),
      bill("elec", "Electricity", 780, -2, "cat_bills", "acc_sbi"),
      bill("net", "Internet (ACT Fibernet)", 589, 9, "cat_bills", "acc_sbi"),
      bill("spotify", "Spotify", 119, 14, "cat_subscriptions", "acc_hdfc", { autopay: true }),
      bill("coach", "Coaching fee", 3000, 21, "cat_education", "acc_sbi"),
    ];
    const nextOn = (dayN) => { const d = cm + "-" + D.pad(dayN); return d > today ? d : D.addMonths(cm, 1) + "-" + D.pad(dayN); };
    const rec = (id, name, type, amt, freq, next, cat, accId) => ({ id: "rec_" + id, name, type, amount: P(amt), frequency: freq, nextDate: next, categoryId: cat, accountId: accId, active: true, ...S });
    const dow = new Date().getDay();
    data.recurring = [
      rec("allow", "Allowance", "income", 5000, "monthly", nextOn(1), "cat_allowance", "acc_sbi"),
      rec("spotify", "Spotify", "expense", 119, "monthly", nextOn(7), "cat_subscriptions", "acc_hdfc"),
      rec("jio", "Jio recharge", "expense", 299, "monthly", nextOn(4), "cat_bills", "acc_paytm"),
      rec("bus", "Weekly bus pass", "expense", 150, "weekly", D.addDays(today, ((8 - dow) % 7) || 7), "cat_transport", "acc_cash"),
    ];
    data.meta.sampleBannerDismissed = false;
    return data;
  };
})();
