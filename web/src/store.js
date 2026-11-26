/* Finance Tracker — data layer. Amounts are integer paise. */
(function () {
  const GF = (window.GF = window.GF || {});
  GF.hooks = GF.hooks || { afterSave: [], beforeRender: [], screens: {}, moreItems: [] };
  const KEY = "glassfinance.v1";
  const SCHEMA = 2;
  const COLLECTIONS = ["accounts", "categories", "transactions", "budgets", "goals", "recurring", "bills"];
  GF.COLLECTIONS = COLLECTIONS;

  GF.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  GF.DEFAULT_CATEGORIES = [
    ["food", "Food", "🍔", "expense", "#ff8a5b"],
    ["transport", "Transportation", "🚌", "expense", "#3b82f6"],
    ["shopping", "Shopping", "🛍️", "expense", "#ec4899"],
    ["entertainment", "Entertainment", "🎬", "expense", "#8b5cf6"],
    ["education", "Education", "📚", "expense", "#0ea5e9"],
    ["bills", "Bills & Utilities", "💡", "expense", "#f59e0b"],
    ["health", "Health", "💊", "expense", "#10b981"],
    ["subscriptions", "Subscriptions", "📺", "expense", "#6366f1"],
    ["allowance", "Allowance", "💰", "income", "#16a34a"],
    ["freelance", "Freelance", "💻", "income", "#14b8a6"],
    ["gifts", "Gifts", "🎁", "income", "#f43f5e"],
    ["other", "Other", "🧩", "both", "#94a3b8"],
  ].map(([id, name, icon, kind, color]) => ({ id: "cat_" + id, name, icon, kind, color, system: id === "other" }));

  GF.PAYMENT_METHODS = ["Cash", "UPI", "Debit Card", "Credit Card", "Net Banking", "Wallet"];
  GF.ACCOUNT_TYPES = { cash: "💵 Cash", bank: "🏦 Bank", savings: "🐷 Savings", wallet: "📱 Wallet", credit: "💳 Credit card" };

  function emptyData() {
    return {
      schema: SCHEMA,
      accounts: [],
      categories: [...GF.DEFAULT_CATEGORIES, ...GF.EXTRA_CATEGORIES].map((c) => ({ ...c })),
      transactions: [],
      budgets: [],
      goals: [],
      recurring: [],
      bills: [],
      settings: { name: "Sami", theme: "system", haptics: true, hideBalances: false, currency: "INR", pin: null },
      meta: { created: new Date().toISOString(), sampleBannerDismissed: false, seeded: false },
    };
  }
  GF.emptyData = emptyData;

  // Migrations keyed by target schema version: hook for later phases.
  GF.migrations = GF.migrations || {};
  GF.EXTRA_CATEGORIES = [
    { id: "cat_groceries", name: "Groceries", icon: "🛒", kind: "expense", color: "#22c55e" },
    { id: "cat_travel", name: "Travel", icon: "✈️", kind: "expense", color: "#06b6d4" },
    { id: "cat_salary", name: "Salary", icon: "💼", kind: "income", color: "#15803d" },
    { id: "cat_business", name: "Business", icon: "🏪", kind: "income", color: "#0d9488" },
    { id: "cat_interest", name: "Interest", icon: "🏦", kind: "income", color: "#0891b2" },
    { id: "cat_received", name: "Money received", icon: "📥", kind: "income", color: "#059669" },
    { id: "cat_refunds", name: "Refunds", icon: "↩️", kind: "income", color: "#7c3aed" },
  ];
  GF.migrations[2] = (d) => { (d.categories || []).length && GF.EXTRA_CATEGORIES.forEach((c) => { if (!d.categories.some((x) => x.id === c.id)) d.categories.push({ ...c }); }); return d; };
  function migrate(d) {
    while ((d.schema || 0) < SCHEMA) {
      const next = (d.schema || 0) + 1;
      if (GF.migrations[next]) d = GF.migrations[next](d);
      d.schema = next;
    }
    const base = emptyData();
    COLLECTIONS.forEach((c) => { if (!Array.isArray(d[c])) d[c] = base[c]; });
    d.settings = { ...base.settings, ...(d.settings || {}) };
    d.meta = { ...base.meta, ...(d.meta || {}) };
    if (!d.categories.some((c) => c.id === "cat_other")) d.categories.push({ ...GF.DEFAULT_CATEGORIES.at(-1) });
    return d;
  }

  const store = {
    persistent: true,
    data: null,
    listeners: [],
    load() {
      let raw = null;
      try {
        const t = "__gf_test";
        localStorage.setItem(t, "1");
        localStorage.removeItem(t);
        raw = localStorage.getItem(KEY);
      } catch (e) {
        this.persistent = false;
      }
      if (raw) {
        try { this.data = migrate(JSON.parse(raw)); } catch (e) { this.data = null; }
      }
      if (!this.data) {
        this.data = emptyData();
        if (GF.seed) GF.seed(this.data);
        this.data.meta.seeded = true;
        this.save(true);
      }
      return this.data;
    },
    save(silent) {
      this.data.meta.savedAt = new Date().toISOString();
      if (this.persistent) {
        try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { this.persistent = false; }
      }
      GF.hooks.afterSave.forEach((f) => f(this.data));
      if (!silent) this.listeners.forEach((f) => f());
    },
    subscribe(f) { this.listeners.push(f); },
    get(coll, id) { return this.data[coll].find((x) => x.id === id); },
    upsert(coll, obj, silent) {
      if (!obj.id) obj.id = GF.uid();
      const arr = this.data[coll];
      const i = arr.findIndex((x) => x.id === obj.id);
      obj.updatedAt = new Date().toISOString();
      if (i >= 0) arr[i] = obj; else { obj.createdAt = obj.updatedAt; arr.push(obj); }
      this.save(silent);
      return obj;
    },
    remove(coll, id, silent) {
      const arr = this.data[coll];
      const i = arr.findIndex((x) => x.id === id);
      let removed = null;
      if (i >= 0) removed = arr.splice(i, 1)[0];
      this.save(silent);
      return removed;
    },
    setSettings(patch) { Object.assign(this.data.settings, patch); this.save(); },
    replaceAll(d) { this.data = migrate(d); this.save(); },
    mergeAll(d) {
      d = migrate(d);
      COLLECTIONS.forEach((c) => {
        d[c].forEach((x) => {
          const i = this.data[c].findIndex((y) => y.id === x.id);
          if (i >= 0) this.data[c][i] = x; else this.data[c].push(x);
        });
      });
      this.save();
    },
    hasSample() { return COLLECTIONS.some((c) => this.data[c].some((x) => x.isSample)); },
    clearSample() {
      COLLECTIONS.forEach((c) => { this.data[c] = this.data[c].filter((x) => !x.isSample); });
      const live = new Set(this.data.accounts.map((a) => a.id));
      this.data.transactions = this.data.transactions.filter((t) => live.has(t.accountId));
      if (!this.data.accounts.length)
        this.data.accounts.push({ id: GF.uid(), name: "Cash", type: "cash", icon: "💵", color: "#10b981", opening: 0, archived: false });
      this.data.meta.sampleBannerDismissed = true;
      this.save();
    },
    eraseAll() {
      const s = this.data.settings;
      this.data = emptyData();
      this.data.settings = { ...this.data.settings, name: s.name, theme: s.theme };
      this.data.meta.sampleBannerDismissed = true;
      this.data.accounts.push({ id: GF.uid(), name: "Cash", type: "cash", icon: "💵", color: "#10b981", opening: 0, archived: false });
      this.save();
    },
    validate(d) {
      if (!d || typeof d !== "object") return "Not a JSON object.";
      if (typeof d.schema !== "number") return "Missing schema version.";
      if (d.schema > SCHEMA) return "Backup is from a newer version of Finance Tracker.";
      for (const c of ["accounts", "transactions"]) if (!Array.isArray(d[c])) return "Missing " + c + ".";
      for (const t of d.transactions) {
        if (!t.id || !["income", "expense", "transfer"].includes(t.type) || !Number.isInteger(t.amount)) return "A transaction is malformed (" + (t.id || "no id") + ").";
      }
      return null;
    },
  };
  GF.store = store;
  GF.KEY = KEY;
  GF.SCHEMA = SCHEMA;
})();
