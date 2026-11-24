/* Glass Finance — boot. Hooks for later phases:
   GF.hooks.boot (fns run before first render, e.g. PIN lock; return a Promise to wait),
   GF.screen(name, def) to replace a More placeholder (goals, savings, bills, recurring, insights, assistant, search),
   GF.hooks.settingsSections, GF.hooks.moreItems, GF.hooks.afterSave, GF.hooks.afterTxSave, GF.migrations[n]. */
(function () {
  const GF = window.GF;
  GF.hooks.boot = GF.hooks.boot || [];
  GF.hooks.afterTxSave = GF.hooks.afterTxSave || [];
  const TABS = [["home", "#/home", "home", "Home"], ["tx", "#/tx", "list", "Transactions"], ["budget", "#/budget", "pie", "Budget"], ["analytics", "#/analytics", "chart", "Analytics"], ["more", "#/more", "more", "More"]];

  async function boot() {
    GF.store.load();
    GF.hidden = !!GF.store.data.settings.hideBalances;
    GF.applyTheme();
    document.getElementById("tabbar").innerHTML = TABS.map(([k, h, ic, l]) => `<a href="${h}" data-tab="${k}">${GF.icon(ic)}<span>${l}</span></a>`).join("");
    document.getElementById("fab").innerHTML = GF.icon("plus");
    document.getElementById("fab").onclick = () => GF.openAdd();
    GF.store.subscribe(() => GF.render());
    for (const f of GF.hooks.boot) await f();
    if (!location.hash) history.replaceState(null, "", "#/home");
    GF.render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
