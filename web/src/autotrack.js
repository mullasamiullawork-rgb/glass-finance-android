/* Glass Finance — automatic tracking: mirrors reconciled native detections into the ledger.
   The native side (Kotlin) parses notifications and reconciles; this side only mirrors, idempotently by id. */
(function () {
  const GF = window.GF, D = GF.D;
  const AT = () => GF.native && GF.native.AutoTrack;
  const A = (GF.auto = { status: null, items: {}, syncing: false });

  A.available = () => !!AT();
  A.KIND = { EXPENSE: "Expense", INCOME: "Money received", REFUND: "Refund", TRANSFER: "Transfer", REVERSAL: "Reversal", UNKNOWN: "Unknown" };
  A.STATUS = { SUCCESS: "Successful", PENDING: "Pending", FAILED: "Failed", REVERSED: "Reversed" };
  A.VERIF = { PROVISIONAL: "Provisional · app notification only", CONFIRMED: "Confirmed · bank alert or 2 sources", BANK_VERIFIED: "Bank-verified · statement" };
  A.SOURCE = { UPI_APP_NOTIFICATION: "UPI app notification", BANK_SMS_NOTIFICATION: "Bank SMS alert", STATEMENT_IMPORT: "Bank statement import", ACCOUNT_AGGREGATOR: "Account Aggregator", APP_INITIATED_INTENT: "Paid from Glass Finance" };

  /** Which account an automatic record belongs to: an account whose last digits match, else the default for automatic tracking. */
  A.accountFor = (it) => {
    const d = GF.store.data, live = d.accounts.filter((a) => !a.archived);
    if (it.accountHint) { const m = live.find((a) => a.mask && it.accountHint.endsWith(a.mask)); if (m) return m.id; }
    if (it.bankName) { const m = live.find((a) => a.bankName && a.bankName.toLowerCase().includes(it.bankName.toLowerCase().split(" ")[0])); if (m) return m.id; }
    const def = live.find((a) => a.id === d.settings.autoAccountId);
    return (def || live.find((a) => a.type === "bank") || live.find((a) => a.type === "wallet") || live[0] || {}).id || null;
  };

  /** Build or remove the ledger transaction for one native record. */
  A.mirror = (it) => {
    const d = GF.store.data;
    A.items[it.id] = it;
    const existing = d.transactions.find((t) => t.id === it.id);
    const accountId = A.accountFor(it);
    let type = it.kind === "EXPENSE" ? "expense" : ["INCOME", "REFUND", "REVERSAL"].includes(it.kind) ? "income" : it.kind === "TRANSFER" ? "transfer" : null;
    const toAccountId = type === "transfer" ? (it.direction === "CREDIT" ? accountId : d.settings.autoTransferToId) : null;
    const fromAccountId = type === "transfer" && it.direction === "CREDIT" ? d.settings.autoTransferToId : accountId;
    if (type === "transfer" && (!toAccountId || !fromAccountId || toAccountId === fromAccountId)) type = null; // needs the user to choose the other account
    const counts = it.countsInLedger && !it.deleted && type && accountId;
    if (!counts) { if (existing) GF.store.data.transactions = d.transactions.filter((t) => t.id !== it.id); return; }
    const cat = it.categoryId && d.categories.some((c) => c.id === it.categoryId) ? it.categoryId : type === "income" ? "cat_received" : "cat_other";
    const tx = {
      ...(existing || {}),
      id: it.id, type, amount: it.amountPaise,
      accountId: type === "transfer" ? fromAccountId : (existing && existing.auto && existing.auto.accountLocked ? existing.accountId : accountId),
      toAccountId: type === "transfer" ? toAccountId : null,
      categoryId: type === "transfer" ? null : (existing && existing.auto && existing.auto.userEdited && existing.categoryId) || cat,
      dateTime: D.isoDT(new Date(it.occurredAt)),
      merchant: (existing && existing.auto && existing.auto.userEdited && existing.merchant) || it.counterparty || (type === "income" ? "Money received" : "UPI payment"),
      note: it.note != null ? it.note : (existing ? existing.note : ""),
      paymentMethod: "UPI", isSample: false, source: "auto",
      auto: { app: it.appName, ref: it.upiRef, txnId: it.txnId, kind: it.kind, status: it.status, verification: it.verification, sources: it.sources, userEdited: it.userEdited, accountLocked: existing && existing.auto && existing.auto.accountLocked },
      createdAt: existing ? existing.createdAt : new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const i = d.transactions.findIndex((t) => t.id === it.id);
    if (i >= 0) d.transactions[i] = tx; else d.transactions.push(tx);
    // Last balance a bank alert/statement reported for this account (never presented as live).
    if (it.availableBalancePaise != null && accountId) {
      const a = GF.acc(accountId);
      const at = new Date(it.occurredAt).toISOString();
      if (a && (!a.syncedAt || at >= a.syncedAt)) { a.syncedBalance = it.availableBalancePaise; a.syncedAt = at; a.syncedSource = it.sources.includes("STATEMENT_IMPORT") ? "bank statement" : "bank SMS alert"; }
    }
  };

  /** Pull everything that changed natively since the last sync. Safe to call any number of times. */
  A.sync = async ({ full } = {}) => {
    if (!AT() || A.syncing) return 0;
    A.syncing = true;
    try {
      const meta = GF.store.data.meta;
      const r = await AT().list({ since: full ? 0 : meta.autoSyncedAt || 0 });
      r.items.forEach(A.mirror);
      meta.autoSyncedAt = r.now;
      if (r.items.length) GF.store.save(); else GF.store.save(true);
      return r.items.length;
    } catch (e) { return 0; } finally { A.syncing = false; }
  };
  A.refreshStatus = async () => { if (!AT()) return null; try { A.status = await AT().getStatus(); } catch (e) {} return A.status; };
  A.allItems = async () => { if (!AT()) return []; const r = await AT().list({ since: 0 }); r.items.forEach((it) => (A.items[it.id] = it)); return r.items; };

  /** User corrections in the ledger flow back to the native record (and teach the categoriser). */
  GF.hooks.afterTxSave = GF.hooks.afterTxSave || [];
  GF.hooks.afterTxSave.push((tx) => {
    if (tx.source !== "auto" || !AT()) return;
    const prev = A.items[tx.id];
    const kind = tx.type === "expense" ? "EXPENSE" : tx.type === "transfer" ? "TRANSFER" : prev && ["REFUND", "REVERSAL"].includes(prev.kind) ? prev.kind : "INCOME";
    const t = GF.store.get("transactions", tx.id);
    if (t) { t.auto = { ...(t.auto || {}), userEdited: true, accountLocked: true, kind }; GF.store.save(true); }
    AT().update({ id: tx.id, kind, categoryId: tx.categoryId, counterparty: tx.merchant || null, amountPaise: tx.amount, note: tx.note || null, rememberCategory: !!tx.categoryId }).catch(() => {});
  });

  /** Deleting an automatic transaction marks it deleted natively, so the next notification for it doesn't bring it back. */
  const remove = GF.store.remove.bind(GF.store);
  GF.store.remove = (coll, id, silent) => {
    const r = remove(coll, id, silent);
    if (coll === "transactions" && r && r.source === "auto" && AT()) AT().update({ id, deleted: true }).catch(() => {});
    return r;
  };
  const upsert = GF.store.upsert.bind(GF.store);
  GF.store.upsert = (coll, obj, silent) => {
    const r = upsert(coll, obj, silent);
    if (coll === "transactions" && obj.source === "auto" && AT()) AT().update({ id: obj.id, deleted: false }).catch(() => {}); // undo of a delete
    return r;
  };

  /* Live updates while the app is open, plus a catch-up sync on start and on every resume. */
  GF.hooks.boot = GF.hooks.boot || [];
  GF.hooks.boot.push(async () => {
    if (!AT()) return;
    AT().addListener("detected", async (it) => {
      await A.sync();
      if (it.change === "created" && it.countsInLedger) GF.toast(`${it.direction === "CREDIT" ? "Received" : "Recorded"} ${GF.fmt(it.amountPaise, { force: true })}${it.counterparty ? (it.direction === "CREDIT" ? " from " : " to ") + it.counterparty : ""} · ${it.appName}`);
    });
    await A.sync();
    A.refreshStatus();
  });
  GF.hooks.resume = GF.hooks.resume || [];
  GF.hooks.resume.push(async () => { await A.sync(); await A.refreshStatus(); GF.render(); });

  /** Recent merchants for Quick Add (manual and automatic), newest first. */
  GF.recentMerchants = (type) => {
    const seen = new Set(), out = [];
    [...GF.store.data.transactions].filter((t) => t.type === type && t.merchant).sort((a, b) => (a.dateTime < b.dateTime ? 1 : -1)).some((t) => {
      const k = t.merchant.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ merchant: t.merchant, categoryId: t.categoryId }); } return out.length >= 6;
    });
    return out;
  };
})();
