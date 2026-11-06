(() => {
  if (window.__rmsContent) return;
  window.__rmsContent = true;

  let state = { routes: [], units: "mi", interval: "auto", visible: true, collapsed: false, panelHidden: false };
  let mapFound = false;

  async function load() {
    const s = await chrome.storage.local.get("rms");
    if (s.rms) state = { ...state, ...s.rms };
  }
  const save = () => chrome.storage.local.set({ rms: state, rmsRev: state.rev });

  function pushToPage() {
    const { routes, units, interval, visible } = state;
    window.postMessage({ source: "rms-content", type: "state", state: { routes, units, interval, visible } }, "*");
  }

  async function update(patch) {
    await reread();
    if (typeof patch === "function") patch = patch(state);
    Object.assign(state, patch, { rev: RMS.newId() });
    await save();
    if (Object.keys(patch).some((k) => k !== "collapsed" && k !== "panelHidden")) pushToPage();
    render();
  }

  const fitMap = () => window.postMessage({ source: "rms-content", type: "fit" }, "*");

  async function addRoute(parsed, source) {
    await update((st) => {
      const routes = source ? st.routes.filter((r) => r.source !== source) : st.routes;
      return { routes: [...routes, { id: RMS.newId(), color: RMS.pickColor(routes), source, ...parsed }] };
    });
    fitMap();
  }

  const TEAL = "#0e6b6b";
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;z-index:2147483000;right:84px;bottom:24px;";
  const root = host.attachShadow({ mode: "open" });
  const ROUTE_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/></svg>`;
  const FIT_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font: 14px/1.35 -apple-system, system-ui, "Segoe UI", sans-serif; margin: 0; }
      [hidden] { display: none !important; }
      .wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; position: relative; }

      /* "Added" toast: floats up out of the top of the panel and fades, without moving the layout */
      .toast { position: absolute; right: 12px; bottom: 100%; margin-bottom: 8px; pointer-events: none;
               display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px;
               background: #0e6b6b; color: #fff; font-weight: 600; font-size: 13px; white-space: nowrap;
               box-shadow: 0 6px 18px rgba(14,107,107,.35); animation: floatUp 2.6s ease-out forwards; }
      .toast .tdot { width: 8px; height: 8px; border-radius: 50%; background: #86efac; }
      @keyframes floatUp {
        0%   { opacity: 0; transform: translateY(10px) scale(.96); }
        12%  { opacity: 1; transform: translateY(0) scale(1); }
        65%  { opacity: 1; transform: translateY(-16px); }
        100% { opacity: 0; transform: translateY(-40px); }
      }
      @media (prefers-reduced-motion: reduce) { .toast { animation: fadeOnly 2.2s ease-out forwards; } }
      @keyframes fadeOnly { 0%, 70% { opacity: 1; } 100% { opacity: 0; } }

      .fab { width: 52px; height: 52px; border-radius: 50%; border: none; background: ${TEAL}; color: #fff;
             display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative;
             box-shadow: 0 6px 18px rgba(14,107,107,.4); -webkit-tap-highlight-color: transparent; padding: 0;
             transition: transform .15s; }
      .fab:active { transform: scale(.92); }
      .fab .count { position: absolute; top: -3px; right: -3px; min-width: 20px; height: 20px; padding: 0 5px;
                    border-radius: 10px; background: #f59e0b; color: #fff; font-size: 11px; font-weight: 700;
                    display: flex; align-items: center; justify-content: center; border: 2px solid #fff; }

      .panel { width: min(310px, calc(100vw - 24px)); background: #fff; color: #1f2937; border-radius: 18px;
               box-shadow: 0 10px 32px rgba(0,0,0,.18); overflow: hidden;
               animation: pop .18s ease-out; transform-origin: bottom right; }
      @keyframes pop { from { opacity: 0; transform: scale(.92) translateY(6px); } }

      .head { display: flex; align-items: center; gap: 10px; padding: 12px 10px 12px 16px;
              background: linear-gradient(135deg, #0e6b6b, #14908a); color: #fff; }
      .head .title { flex: 1; }
      .head b { display: block; font-size: 16px; font-weight: 700; color: #fff; }
      .head small { display: flex; align-items: center; gap: 5px; font-size: 12px; opacity: .85; color: #fff; }
      .dot { width: 7px; height: 7px; border-radius: 50%; background: #fbbf24; }
      .dot.ok { background: #86efac; }
      .min { background: rgba(255,255,255,.18); border: none; color: #fff; width: 32px; height: 32px; border-radius: 50%;
             font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; }

      .body { padding: 14px 14px 12px; display: flex; flex-direction: column; gap: 12px; }

      .empty { text-align: center; padding: 10px 8px 4px; color: #64748b; }
      .empty .big { width: 44px; height: 44px; margin: 0 auto 8px; border-radius: 50%; background: #e6f2f0; color: #0e6b6b; display: flex; align-items: center; justify-content: center; }
      .empty b { display: block; color: #1f2937; font-size: 15px; margin-bottom: 2px; }

      ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 190px; overflow: auto; }
      li { display: flex; align-items: center; gap: 10px; padding: 9px 6px 9px 12px; border-radius: 12px; background: #f1f7f6; }
      .sw { width: 10px; height: 10px; border-radius: 50%; flex: none; box-shadow: 0 0 0 3px #fff; }
      .info { flex: 1; min-width: 0; }
      .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .meta { color: #64748b; font-size: 12px; }
      .x { border: none; background: none; color: #94a3b8; width: 30px; height: 30px; border-radius: 50%;
           font-size: 18px; cursor: pointer; flex: none; }
      .x:hover { background: #fee2e2; color: #dc2626; }

      .add { display: flex; gap: 6px; }
      input[type=text] { flex: 1; min-width: 0; padding: 10px 12px; border: 1.5px solid #d6e4e2; border-radius: 12px;
                         background: #fff; color: #1f2937; outline: none; }
      input[type=text]:focus { border-color: ${TEAL}; box-shadow: 0 0 0 3px rgba(14,107,107,.15); }
      input[type=text]::placeholder { color: #94a3b8; }
      .btn { border: none; border-radius: 12px; padding: 10px 14px; font-weight: 600; cursor: pointer;
             -webkit-tap-highlight-color: transparent; text-decoration: none; display: inline-flex;
             align-items: center; justify-content: center; gap: 6px; }
      .btn:active { transform: scale(.97); }
      .btn.primary { background: ${TEAL}; color: #fff; }
      .btn.primary:disabled { opacity: .6; }
      .addbtn { white-space: nowrap; flex: none; }
      .add.paste .addbtn { flex: 1; padding: 12px 14px; font-size: 15px; }
      .btn.soft { background: #e6f2f0; color: ${TEAL}; }
      .file-btn { width: 100%; }

      .msg { font-size: 13px; color: #b91c1c; background: #fef2f2; border-radius: 10px; padding: 8px 10px;
             display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
      .msg.ok { color: ${TEAL}; background: #e6f2f0; }
      .msg:empty { display: none; }

      .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px;
              border-top: 1px solid #eef2f2; padding-top: 12px; }

      /* iOS-style switch */
      .switch { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
      .switch input { position: absolute; opacity: 0; width: 0; height: 0; }
      .track { width: 46px; height: 28px; border-radius: 14px; background: #d1d5db; position: relative;
               transition: background .2s; flex: none; }
      .track::after { content: ""; position: absolute; top: 2px; left: 2px; width: 24px; height: 24px; border-radius: 50%;
                      background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,.25); transition: transform .2s; }
      .switch input:checked + .track { background: ${TEAL}; }
      .switch input:checked + .track::after { transform: translateX(18px); }
      .switch input:focus-visible + .track { box-shadow: 0 0 0 3px rgba(14,107,107,.3); }

      /* iOS Safari zooms into any field under 16px when it's focused */
      @media (pointer: coarse) { input[type=text] { font-size: 16px; } }
    </style>
    <div class="wrap">
      <div class="panel">
        <div class="head">
          <div class="title">
            <b>Your routes</b>
            <small><span class="dot"></span><span class="status"></span></small>
          </div>
          <button class="min" title="Collapse" aria-label="Collapse">&#9660;</button>
        </div>
        <div class="body">
          <div class="empty">
            <div class="big">${ROUTE_ICON}</div>
            <b>No routes yet</b>
            Paste a RideWithGPS, Komoot or Strava link, or load a GPX, to see your route next to hosts.
          </div>
          <ul class="list"></ul>
          <div class="add paste">
            <input type="text" class="url" placeholder="Route link" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" hidden>
            <button class="btn primary addbtn">Paste &amp; add</button>
          </div>
          <div class="msg"></div>
          <button class="btn soft file-btn pick">Load a GPX file</button>
          <input type="file" class="file" multiple hidden>
          <div class="foot">
            <label class="switch"><input type="checkbox" class="vis"><span class="track"></span><span>Show on map</span></label>
            <button class="btn soft fit">${FIT_ICON} Fit</button>
          </div>
        </div>
      </div>
      <button class="fab" title="Your routes" aria-label="Your routes">${ROUTE_ICON}<span class="count" hidden></span></button>
    </div>`;

  const place = () => {
    const narrow = window.innerWidth < 700;
    host.style.right = narrow ? "12px" : "84px";
    host.style.bottom = narrow ? "calc(env(safe-area-inset-bottom, 0px) + 84px)" : "24px";
  };
  place();
  window.addEventListener("resize", place);

  const $ = (s) => root.querySelector(s);
  const msgEl = $(".msg");
  const showMsg = (t, ok = false) => { msgEl.classList.toggle("ok", ok); msgEl.textContent = t || ""; };
  function toast(text) {
    root.querySelectorAll(".toast").forEach((t) => t.remove());
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = '<span class="tdot"></span>';
    t.append(text);
    t.addEventListener("animationend", () => t.remove());
    $(".wrap").append(t);
  }

  $(".fab").onclick = () => { resetAdd(); update({ collapsed: !state.collapsed }); };
  $(".min").onclick = () => { resetAdd(); update({ collapsed: true }); };
  $(".pick").onclick = () => $(".file").click();
  $(".file").onchange = async (e) => {
    showMsg("");
    for (const f of e.target.files) {
      try { await addRoute(RMS.parseGpx(await f.text(), f.name.replace(/\.gpx$/i, ""))); toast("Added to your map"); }
      catch (err) { showMsg(`${f.name}: ${err.message}`); }
    }
    e.target.value = "";
  };
  $(".vis").onchange = (e) => update({ visible: e.target.checked });
  $(".fit").onclick = fitMap;

  const ask = (msg) => chrome.runtime.sendMessage(msg).catch((e) => ({ ok: false, error: `Extension background didn't answer (${e.message})` }));

  async function importLink(raw) {
    let info = RMS.parseLink(raw);
    if (!info) throw new Error("That doesn't look like a RideWithGPS, Komoot or Strava route link.");
    if (info.type === "short") {
      const res = await ask({ type: "resolve", url: info.shortUrl });
      if (!res || !res.ok) throw new Error(res ? res.error : "Couldn't open that Strava link");
      info = RMS.parseLink(res.url);
      if (!info) throw new Error("That Strava link isn't a route or activity.");
    }
    const res = await ask({ type: "download", info });
    if (res && res.ok) {
      await addRoute(RMS.fromPayload(res.payload, `${RMS.PROVIDERS[info.provider]} ${info.id}`), info.key);
      return;
    }
    const why = res ? res.error || "Unknown error" : "No response from extension background";
    console.warn("[Route My Showers] download failed:", why, res);
    throw Object.assign(new Error(why), { info });
  }

  // Manual add only after paste&add fails
  let manual = false;
  function setManual(on, text = "") {
    manual = on;
    const input = $(".url");
    input.hidden = !on;
    input.value = on ? text : "";
    $(".add").classList.toggle("paste", !on);
    $(".addbtn").textContent = on ? "Add" : "Paste & add";
    if (on) input.focus();
  }
  function resetAdd() {
    if (manual) setManual(false);
    showMsg("");
  }

  async function addLink(raw) {
    showMsg("");
    const b = $(".addbtn");
    b.disabled = true;
    b.textContent = "…";
    try {
      await importLink(raw);
      setManual(false);
      toast("Added to your map");
    } catch (err) {
      if (err.info && err.info.provider === "strava") viaPage(err.info);
      else if (err.info) offerOpen(err.info, err.message);
      else { setManual(true, raw); showMsg(err.message); }
    } finally {
      b.disabled = false;
      $(".addbtn").textContent = manual ? "Add" : "Paste & add";
    }
  }

  async function pasteAndAdd() {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch (_) {
      setManual(true);
      showMsg("Couldn't read the clipboard. Paste the link here instead.");
      return;
    }
    const link = (text.match(/https?:\/\/\S+/) || [text.trim()])[0];
    if (!link) {
      setManual(true);
      showMsg("The clipboard is empty. Paste a RideWithGPS, Komoot or Strava link here.");
      return;
    }
    if (!RMS.parseLink(link)) {
      setManual(true, text.trim());
      showMsg("That doesn't look like a RideWithGPS, Komoot or Strava route link.");
      return;
    }
    addLink(link);
  }

  const addTyped = () => { const v = $(".url").value.trim(); if (v) addLink(v); };
  $(".addbtn").onclick = () => (manual ? addTyped() : pasteAndAdd());
  $(".url").onkeydown = (e) => { if (e.key === "Enter") addTyped(); e.stopPropagation(); };

  function importPageUrl(info) {
    const returnTo = location.href.split("#")[0];
    const u = new URL(info.pageUrl);
    u.hash = "rms-import&return=" + encodeURIComponent(returnTo);
    return { href: u.href, pending: { rmsPending: { key: info.key, at: Date.now(), returnTo } } };
  }

  async function viaPage(info) {
    const { href, pending } = importPageUrl(info);
    showMsg(`Grabbing it from ${RMS.PROVIDERS[info.provider]}…`, true);
    await chrome.storage.local.set(pending);
    setTimeout(() => location.assign(href), 400);
  }

  function offerOpen(info, reason) {
    showMsg("");
    const p = document.createElement("div");
    p.textContent = reason;
    const { href, pending } = importPageUrl(info);
    const a = document.createElement("a");
    a.className = "btn primary";
    a.href = href;
    a.textContent = `Add it from ${RMS.PROVIDERS[info.provider]} →`;
    a.onclick = (e) => {
      e.preventDefault();
      chrome.storage.local.set(pending);
      setTimeout(() => location.assign(href), 50);
    };
    msgEl.append(p, a);
  }

  const PROVIDER_OF = (r) => (r.source ? RMS.PROVIDERS[r.source.split(":")[0]] : "GPX file") || "Route";

  function render() {
    host.style.display = state.panelHidden ? "none" : "";
    if (state.panelHidden || state.collapsed) resetAdd();
    $(".panel").hidden = !!state.collapsed;
    $(".dot").classList.toggle("ok", mapFound);
    $(".status").textContent = mapFound ? "Map connected" : "Looking for the map… try panning it";
    $(".vis").checked = state.visible;
    const n = state.routes.length;
    const count = $(".count");
    count.hidden = !n || !state.collapsed;
    count.textContent = String(n);
    $(".empty").hidden = n > 0;

    const unitM = state.units === "km" ? 1000 : 1609.344;
    const list = $(".list");
    list.innerHTML = "";
    for (const r of state.routes) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="sw"></span><div class="info"><div class="name"></div><div class="meta"></div></div><button class="x" title="Remove" aria-label="Remove">×</button>`;
      li.querySelector(".sw").style.background = r.color;
      li.querySelector(".name").textContent = r.name;
      li.querySelector(".name").title = r.name;
      li.querySelector(".meta").textContent = `${(r.meters / unitM).toFixed(r.meters / unitM < 10 ? 1 : 0)} ${state.units} · ${PROVIDER_OF(r)}`;
      li.querySelector(".x").onclick = () => update((st) => ({ routes: st.routes.filter((x) => x.id !== r.id) }));
      list.appendChild(li);
    }
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.source !== "rms-page") return;
    if (e.data.type === "ready") pushToPage();
    if (e.data.type === "status") { mapFound = !!e.data.mapFound; render(); }
  });

  function applyStored(next) {
    if (!next || next.rev === state.rev) return;
    const before = state.routes.length;
    state = { ...state, ...next };
    pushToPage();
    if (state.routes.length > before) fitMap();
    render();
  }
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.rms) applyStored(changes.rms.newValue);
  });

  async function reread() {
    try {
      const { rmsRev } = await chrome.storage.local.get("rmsRev");
      if (rmsRev === undefined || rmsRev === state.rev) return;
      applyStored((await chrome.storage.local.get("rms")).rms);
    } catch (_) { /* extension was reloaded and connection failed */ }
  }
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "rms-sync") reread();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) reread(); });
  window.addEventListener("focus", reread);
  window.addEventListener("pageshow", reread);

  setInterval(() => { if (!document.hidden) reread(); }, 2000);

  (async () => {
    await load();
    document.documentElement.appendChild(host);
    render();
    pushToPage();
    window.postMessage({ source: "rms-content", type: "ping" }, "*");
  })();
})();
