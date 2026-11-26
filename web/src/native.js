/* Finance Tracker — native Android bridge (Capacitor). Everything here is a no-op in a plain browser. */
(function () {
  const GF = window.GF;
  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const plugin = (name) => {
    if (!isNative) return null;
    try { return (Cap.registerPlugin ? Cap.registerPlugin(name) : null) || (Cap.Plugins && Cap.Plugins[name]) || null; } catch (e) { return (Cap.Plugins && Cap.Plugins[name]) || null; }
  };
  const N = (GF.native = {
    isNative,
    App: plugin("App"), Haptics: plugin("Haptics"), StatusBar: plugin("StatusBar"), SplashScreen: plugin("SplashScreen"),
    Filesystem: plugin("Filesystem"), Share: plugin("Share"), LocalNotifications: plugin("LocalNotifications"), AutoTrack: plugin("AutoTrack"),
  });

  if (!isNative) return;
  document.documentElement.classList.add("native");

  /* Haptics through the native engine (navigator.vibrate is unreliable inside WebView). */
  GF.haptic = (ms = 8) => { try { if (GF.store.data.settings.haptics && N.Haptics) N.Haptics.impact({ style: ms >= 15 ? "MEDIUM" : "LIGHT" }); } catch (e) {} };

  /* Files: write to cache and open the Android share sheet (Save to Files, Drive, WhatsApp…). */
  GF.download = async (name, text, mime) => {
    try {
      const r = await N.Filesystem.writeFile({ path: name, data: text, directory: "CACHE", encoding: "utf8" });
      await N.Share.share({ title: name, url: r.uri, dialogTitle: "Save or share " + name });
    } catch (e) {
      if (e && /cancel/i.test(String(e.message || e))) return;
      GF.copySheet(name, text);
    }
  };

  /* Durable copy of the ledger in the native Room database (survives WebView storage being cleared). */
  let saveTimer = null;
  GF.hooks.afterSave.push((data) => {
    if (!N.AutoTrack) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => N.AutoTrack.saveState({ json: JSON.stringify(data) }).catch(() => {}), 400);
  });
  GF.hooks.boot = GF.hooks.boot || [];
  GF.hooks.boot.unshift(async () => {
    if (!N.AutoTrack) return;
    try {
      const local = localStorage.getItem(GF.KEY);
      const r = await N.AutoTrack.loadState();
      if (r && r.json) {
        const native = JSON.parse(r.json);
        const localUpdated = local ? JSON.parse(local).meta?.savedAt || "" : "";
        if (!local || (native.meta?.savedAt || "") > localUpdated) { GF.store.data = null; localStorage.setItem(GF.KEY, r.json); GF.store.load(); }
      }
    } catch (e) {}
  });

  /* Android back button: close sheet → go back → leave the app from Home. */
  if (N.App) {
    N.App.addListener("backButton", () => {
      if (GF.sheetStack && GF.sheetStack.length) return GF.closeSheet();
      const r = GF.route();
      if (r.name === "home") return N.App.minimizeApp();
      if (["tx", "budget", "analytics", "more"].includes(r.name)) return GF.go("#/home");
      history.length > 1 ? history.back() : GF.go("#/home");
    });
    N.App.addListener("appStateChange", ({ isActive }) => { (GF.hooks.appState || []).forEach((f) => f(isActive)); });
    N.App.addListener("resume", () => { (GF.hooks.resume || []).forEach((f) => f()); });
  }

  /* Status bar follows the theme. */
  const paintBars = () => {
    if (!N.StatusBar) return;
    const dark = document.documentElement.dataset.theme === "dark" || (document.documentElement.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    N.StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    N.StatusBar.setStyle({ style: dark ? "DARK" : "LIGHT" }).catch(() => {});
  };
  const applyTheme = GF.applyTheme;
  GF.applyTheme = () => { applyTheme(); paintBars(); };

  /* Local notifications for bill reminders (works with the app closed once scheduled). */
  GF.scheduleBillReminders = async () => {
    const LN = N.LocalNotifications, d = GF.store.data;
    if (!LN || !d.settings.billReminders) return;
    try {
      const perm = await LN.checkPermissions();
      if (perm.display !== "granted") return;
      const pending = await LN.getPending();
      if (pending.notifications.length) await LN.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
      const days = d.settings.reminderDays ?? 1;
      const list = d.bills.filter((b) => !b.paid && !b.isSample).map((b, i) => {
        const at = GF.D.parse(GF.D.addDays(b.dueDate, -days) + "T09:00");
        return { id: 1000 + i, title: "Bill due: " + b.name, body: GF.fmt(b.amount, { force: true }) + " due " + GF.D.short(b.dueDate), schedule: { at, allowWhileIdle: true } };
      }).filter((n) => n.schedule.at > new Date()).slice(0, 60);
      if (list.length) await LN.schedule({ notifications: list });
    } catch (e) {}
  };
  GF.requestNotifyPermission = async () => {
    if (!N.LocalNotifications) return false;
    const r = await N.LocalNotifications.requestPermissions();
    return r.display === "granted";
  };

  GF.hooks.boot.push(async () => {
    paintBars();
    setTimeout(() => N.SplashScreen && N.SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {}), 150);
  });
})();
