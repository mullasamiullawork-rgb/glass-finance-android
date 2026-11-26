/* Finance Tracker — UI kit: icons, router, sheets, toasts, confirm, swipe rows, helpers. */
(function () {
  const GF = window.GF;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  GF.$ = $; GF.$$ = $$;
  GF.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const P = {
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.7 9.7 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    sort: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  };
  GF.icon = (n, cls = "ic") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ""}</svg>`;

  GF.haptic = (ms = 8) => { try { if (GF.store.data.settings.haptics && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
  GF.reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Theme */
  const mq = matchMedia("(prefers-color-scheme: dark)");
  GF.applyTheme = () => {
    const t = GF.store.data.settings.theme;
    const dark = t === "dark" || (t === "system" && mq.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const m = $('meta[name="theme-color"]'); if (m) m.content = dark ? "#05070d" : "#eef1f8";
  };
  mq.addEventListener && mq.addEventListener("change", () => GF.applyTheme());

  /* Toast with optional Undo */
  let toastTimer;
  GF.toast = (msg, opts = {}) => {
    let el = $("#toast");
    el.innerHTML = `<span>${GF.esc(msg)}</span>${opts.undo ? '<button type="button">Undo</button>' : ""}`;
    el.classList.add("on");
    if (opts.undo) $("button", el).onclick = () => { opts.undo(); hide(); GF.haptic(); };
    clearTimeout(toastTimer);
    function hide() { el.classList.remove("on"); }
    toastTimer = setTimeout(hide, opts.undo ? 5000 : 2600);
  };

  /* Sheets: each open sheet adds a history entry so Android back closes it first. */
  const stack = [];
  let skipPop = 0, afterPop = null;
  GF.sheetStack = stack;
  GF.sheet = ({ title, body, mount, onClose, actions = "" }) => {
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    const el = document.createElement("section");
    el.className = "sheet";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", title || "Sheet");
    el.innerHTML = `<div class="grab" aria-hidden="true"><i></i></div><div class="shead"><h3>${GF.esc(title || "")}</h3>${actions}<button class="iconbtn" data-close aria-label="Close">${GF.icon("close")}</button></div><div class="sbody">${body}</div>`;
    document.body.append(scrim, el);
    const entry = { el, scrim, onClose, prevFocus: document.activeElement };
    stack.push(entry);
    history.pushState({ gfSheet: stack.length }, "", location.href);
    requestAnimationFrame(() => { scrim.classList.add("on"); el.classList.add("on"); });
    scrim.onclick = () => GF.closeSheet();
    $("[data-close]", el).onclick = () => GF.closeSheet();
    // swipe down to close from the handle/header
    let y0 = null, dy = 0;
    const start = (e) => { if (e.target.closest("button")) return; y0 = e.clientY; dy = 0; el.classList.add("drag"); e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); };
    const move = (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); el.style.transform = `translate(-50%,${dy}px)`; };
    const end = () => { if (y0 == null) return; y0 = null; el.classList.remove("drag"); el.style.transform = ""; if (dy > 110) GF.closeSheet(); };
    [$(".grab", el), $(".shead", el)].forEach((h) => { h.addEventListener("pointerdown", start); h.addEventListener("pointermove", move); h.addEventListener("pointerup", end); h.addEventListener("pointercancel", end); });
    if (mount) mount(el);
    setTimeout(() => { const f = $("[autofocus]", el) || $("[data-close]", el); f && f.focus({ preventScroll: true }); }, 60);
    GF.haptic(5);
    return el;
  };
  function destroyTop() {
    const s = stack.pop();
    if (!s) return;
    s.el.classList.remove("on"); s.scrim.classList.remove("on");
    setTimeout(() => { s.el.remove(); s.scrim.remove(); }, GF.reducedMotion() ? 0 : 320);
    if (s.onClose) s.onClose();
    if (s.prevFocus && s.prevFocus.focus) s.prevFocus.focus({ preventScroll: true });
  }
  GF.closeSheet = () => { if (stack.length) history.back(); };
  /** Close every sheet, then run cb (e.g. navigate). */
  GF.closeAll = (cb) => {
    if (!stack.length) return cb && cb();
    const n = stack.length;
    while (stack.length) destroyTop();
    skipPop = 1; afterPop = cb;
    history.go(-n);
  };
  GF.go = (hash) => GF.closeAll(() => { if (location.hash !== hash) location.hash = hash; else GF.render(); });
  window.addEventListener("popstate", () => {
    if (skipPop) { skipPop = 0; const cb = afterPop; afterPop = null; cb && setTimeout(cb, 0); return; }
    if (stack.length) destroyTop();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && stack.length) GF.closeSheet(); });

  /* Confirm sheet → Promise<boolean>. opts.typed requires typing a word. */
  GF.confirm = ({ title, msg, ok = "Confirm", danger = false, typed = null }) =>
    new Promise((res) => {
      let done = false;
      GF.sheet({
        title,
        body: `<p class="muted">${msg}</p>${typed ? `<label class="field"><span>Type ${typed} to confirm</span><input class="input" id="cf-in" autocomplete="off" autocapitalize="characters" autofocus></label>` : ""}
          <div class="grid2" style="margin-top:12px"><button class="btn" id="cf-no">Cancel</button><button class="btn ${danger ? "danger" : "primary"}" id="cf-ok" ${typed ? "disabled" : ""}>${GF.esc(ok)}</button></div>`,
        mount(el) {
          const okb = $("#cf-ok", el);
          if (typed) $("#cf-in", el).oninput = (e) => (okb.disabled = e.target.value.trim() !== typed);
          $("#cf-no", el).onclick = () => GF.closeSheet();
          okb.onclick = () => { done = true; GF.closeSheet(); };
        },
        // resolve only once the sheet's history entry is gone, so callers can navigate safely
        onClose: () => setTimeout(() => res(done), 0),
      });
    });

  /* Small render helpers */
  GF.ring = (pct, size = 120, stroke = 12, state = "ok") => {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.min(100, Math.max(0, pct));
    const col = state === "over" ? "var(--expense)" : state === "warning" ? "var(--warn)" : "var(--income)";
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * p) / 100} ${c}"/></svg>`;
  };
  GF.bar = (pct, state = "ok") => `<div class="bar ${state}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${Math.min(100, Math.max(0, pct))}%"></i></div>`;
  GF.stateText = (b) => (b.state === "over" ? `Over by ${GF.fmt(-b.remaining)}` : b.state === "warning" ? "Approaching limit" : `${GF.fmt(b.remaining)} left`);
  GF.catIcon = (cat, dir) => `<span class="cat" style="background:${cat.color}26">${cat.icon}${dir ? `<span class="dir ${dir}" aria-hidden="true">${dir === "inc" ? "↑" : dir === "exp" ? "↓" : "⇄"}</span>` : ""}</span>`;
  const SIGN = { income: ["inc", "+"], expense: ["exp", "−"], transfer: ["trf", "⇄ "] };
  GF.signOf = (t, accountId) => {
    if (t.type === "transfer" && accountId) return t.accountId === accountId ? ["exp", "−", "Transfer out"] : ["inc", "+", "Transfer in"];
    return [...SIGN[t.type], t.type[0].toUpperCase() + t.type.slice(1)];
  };
  GF.txTitle = (t) => t.merchant || (t.type === "transfer" ? "Transfer" : GF.cat(t.categoryId).name);
  GF.txRow = (t, o = {}) => {
    const [cls, sign, label] = GF.signOf(t, o.accountId);
    const cat = t.type === "transfer" ? { icon: "⇄", color: "#3b82f6" } : GF.cat(t.categoryId);
    const a = GF.acc(t.accountId), b = GF.acc(t.toAccountId);
    const where = t.type === "transfer" ? `${a ? a.name : "?"} → ${b ? b.name : "?"}` : `${t.type === "transfer" ? "" : GF.cat(t.categoryId).name} · ${a ? a.name : "Deleted account"}`;
    const inner = `<button class="item" data-act="txDetail" data-id="${t.id}">${GF.catIcon(cat, cls)}<span class="meta"><span class="t">${GF.esc(GF.txTitle(t))}${t.isSample ? '<span class="demo">Demo</span>' : ""}</span><span class="s">${GF.esc(where)} · ${o.showDate ? GF.D.short(t.dateTime.slice(0, 10)) + ", " : ""}${GF.D.time(t.dateTime)}</span></span><span class="r amt ${cls}"><span class="sr">${label} </span>${sign}${GF.fmt(t.amount)}</span></button>`;
    if (!o.swipe) return inner;
    return `<div class="swipe" data-id="${t.id}"><div class="acts"><button class="e" data-act="txEdit" data-id="${t.id}">Edit</button><button class="d" data-act="txDelete" data-id="${t.id}">Delete</button></div>${inner}</div>`;
  };

  /* Swipe-left rows reveal Edit/Delete */
  let sw = null;
  GF.closeSwipes = (except) => $$(".swipe .item.open").forEach((i) => { if (i !== except) { i.classList.remove("open"); i.style.transform = ""; } });
  document.addEventListener("pointerdown", (e) => {
    const it = e.target.closest(".swipe .item");
    if (!it) { if (!e.target.closest(".swipe")) GF.closeSwipes(); return; }
    sw = { it, x: e.clientX, y: e.clientY, dx: 0, base: it.classList.contains("open") ? -152 : 0, lock: null };
  });
  document.addEventListener("pointermove", (e) => {
    if (!sw) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (sw.lock == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) sw.lock = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (sw.lock !== "x") return;
    sw.dx = dx;
    sw.it.classList.add("drag");
    sw.it.style.transform = `translateX(${Math.min(0, Math.max(-180, sw.base + dx))}px)`;
  });
  const swEnd = () => {
    if (!sw) return;
    const { it, dx, base, lock } = sw; sw = null;
    it.classList.remove("drag");
    if (lock !== "x") return;
    it.dataset.swiped = "1"; setTimeout(() => delete it.dataset.swiped, 50);
    const open = base + dx < -60;
    it.classList.toggle("open", open);
    it.style.transform = open ? "translateX(-152px)" : "";
    if (open) { GF.closeSwipes(it); GF.haptic(); }
  };
  document.addEventListener("pointerup", swEnd);
  document.addEventListener("pointercancel", swEnd);

  /* Delegated actions: <button data-act="name" data-id="…"> → GF.acts.name(el, e) */
  GF.acts = GF.acts || {};
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const it = el.classList.contains("item") && el.closest(".swipe") ? el : null;
    if (it && (it.dataset.swiped || it.classList.contains("open"))) { GF.closeSwipes(); return; }
    const f = GF.acts[el.dataset.act];
    if (f) { e.preventDefault(); f(el, e); }
  });

  /* Count-up animation for hero numbers */
  GF.countUp = (el, to) => {
    if (!el) return;
    if (GF.hidden || GF.reducedMotion()) { el.textContent = GF.fmt(to); return; }
    const t0 = performance.now(), dur = 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = GF.fmt(Math.round((to * e) / 100) * 100); if (k < 1) requestAnimationFrame(step); else el.textContent = GF.fmt(to); };
    requestAnimationFrame(step);
  };

  /* File helpers */
  GF.copySheet = (title, text) => GF.sheet({
    title, body: `<p class="muted small">Download isn't available here. Copy the text and save it as a file.</p><textarea class="input" readonly id="cp-t">${GF.esc(text)}</textarea><button class="btn primary block" id="cp-b" style="margin-top:12px">${GF.icon("copy")} Copy</button>`,
    mount(el) { $("#cp-b", el).onclick = async () => { const ta = $("#cp-t", el); try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand("copy"); } GF.toast("Copied"); }; },
  });
  GF.download = (name, text, mime) => {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: mime }));
      const a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      GF.toast("Downloaded " + name);
    } catch (e) { GF.copySheet(name, text); }
  };
  GF.readFile = (accept) => new Promise((res) => {
    const i = document.createElement("input"); i.type = "file"; i.accept = accept;
    i.onchange = () => { const f = i.files[0]; if (!f) return res(null); const r = new FileReader(); r.onload = () => res({ name: f.name, text: r.result }); r.readAsText(f); };
    i.click();
  });

  /* Router: #/name/param. Screens register with GF.screen(name, {render(param), mount(root,param), tab}). */
  GF.screens = {};
  GF.screen = (name, def) => (GF.screens[name] = def);
  GF.route = () => { const [name = "home", ...rest] = location.hash.replace(/^#\/?/, "").split("/"); return { name: name || "home", param: rest.join("/") ? decodeURIComponent(rest.join("/")) : null }; };
  GF.topbar = (title, { back, right = "", sub = "" } = {}) =>
    `<header class="topbar">${back ? `<button class="iconbtn glass" data-act="back" aria-label="Back">${GF.icon("back")}</button>` : ""}<h1>${sub ? `<span class="sub">${sub}</span>` : ""}${GF.esc(title)}</h1>${right}</header>`;
  GF.acts.back = () => (history.length > 1 ? history.back() : (location.hash = "#/more"));
  GF.acts.nav = (el) => GF.go(el.dataset.to);
  let lastRoute = "";
  GF.render = () => {
    const { name, param } = GF.route();
    const def = GF.screens[name] || GF.screens.placeholder;
    GF.hooks.beforeRender.forEach((f) => f(name, param));
    const view = $("#view");
    const key = name + "/" + param;
    const same = key === lastRoute;
    const y = window.scrollY;
    view.className = same ? "" : "view";
    view.innerHTML = def.render(param, name);
    if (def.mount) def.mount(view, param, same);
    if (same) window.scrollTo(0, y); else window.scrollTo(0, 0);
    lastRoute = key;
    const tab = def.tab || "more";
    $$(".tabbar a").forEach((a) => a.setAttribute("aria-current", a.dataset.tab === tab ? "page" : "false"));
    document.title = (def.title ? def.title(param) + " · " : "") + "Finance Tracker";
    $("#storebanner").hidden = GF.store.persistent;
  };
  window.addEventListener("hashchange", () => { if (!stack.length) GF.render(); });
})();
