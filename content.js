// Isolated-world content script: floating panel, GPX parsing, storage.
// Talks to page.js (MAIN world, which owns the map) via window.postMessage.
(() => {
  if (window.__rmsContent) return;
  window.__rmsContent = true;

  const COLORS = ["#e8452c", "#3c63d8", "#f59e0b", "#9333ea", "#db2777", "#0891b2"];
  let state = { routes: [], units: "mi", interval: "auto", visible: true, collapsed: false };
  let mapFound = false;

  // ---------- storage ----------
  async function load() {
    const s = await chrome.storage.local.get("rms");
    if (s.rms) state = { ...state, ...s.rms };
  }
  const save = () => chrome.storage.local.set({ rms: state });

  function pushToPage() {
    const { routes, units, interval, visible } = state;
    window.postMessage({ source: "rms-content", type: "state", state: { routes, units, interval, visible } }, "*");
  }

  async function update(patch) {
    Object.assign(state, patch, { rev: Math.random().toString(36).slice(2) });
    await save();
    if (Object.keys(patch).some((k) => k !== "collapsed")) pushToPage();
    render();
  }

  // ---------- GPX ----------
  function haversine(a, b) {
    const R = 6371008.8, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function parseGpx(text, fallbackName) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Not a valid GPX file");
    let nodes = doc.getElementsByTagName("trkpt");
    if (!nodes.length) nodes = doc.getElementsByTagName("rtept");
    if (!nodes.length) throw new Error("No track or route points in GPX");

    // Drop points closer than ~5 m to the last kept one to keep storage small.
    const pts = [];
    let dist = 0;
    for (const n of nodes) {
      const p = [parseFloat(n.getAttribute("lat")), parseFloat(n.getAttribute("lon"))];
      if (!isFinite(p[0]) || !isFinite(p[1])) continue;
      const last = pts[pts.length - 1];
      if (last) {
        const d = haversine(last, p);
        if (d < 5) continue;
        dist += d;
      }
      pts.push([+p[0].toFixed(6), +p[1].toFixed(6)]);
    }
    const nameEl = doc.querySelector("trk > name, rte > name, metadata > name");
    const name = (nameEl && nameEl.textContent.trim()) || fallbackName;
    return { name, points: pts, meters: dist };
  }

  async function addRoute(parsed) {
    const used = new Set(state.routes.map((r) => r.color));
    const color = COLORS.find((c) => !used.has(c)) || COLORS[state.routes.length % COLORS.length];
    const route = { id: Date.now() + Math.random().toString(36).slice(2), color, ...parsed };
    await update({ routes: [...state.routes, route] });
    window.postMessage({ source: "rms-content", type: "fit" }, "*");
  }

  // ---------- UI ----------
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;right:84px;bottom:24px;z-index:2147483000;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font: 13px/1.35 system-ui, -apple-system, sans-serif; }
      .panel { width: 280px; background: #fff; color: #1f2937; border-radius: 10px;
               box-shadow: 0 4px 18px rgba(0,0,0,.22); overflow: hidden; }
      .head { display:flex; align-items:center; justify-content:space-between; padding:8px 12px;
              background:#0e6b6b; color:#fff; cursor:pointer; user-select:none; }
      .head b { font-weight: 600; color:#fff; }
      .dot { width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:6px; background:#f59e0b; }
      .dot.ok { background:#4ade80; }
      .body { padding: 10px 12px; display:flex; flex-direction:column; gap:8px; }
      .row { display:flex; gap:6px; align-items:center; }
      input[type=text] { flex:1; min-width:0; padding:5px 7px; border:1px solid #cbd5e1; border-radius:6px; }
      button, select { padding:5px 8px; border:1px solid #cbd5e1; border-radius:6px; background:#f8fafc; cursor:pointer; }
      button.primary { background:#0e6b6b; color:#fff; border-color:#0e6b6b; }
      ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px; max-height:160px; overflow:auto; }
      li { display:flex; align-items:center; gap:6px; }
      .sw { width:12px; height:12px; border-radius:3px; flex:none; }
      .name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .dist { color:#64748b; font-size:12px; }
      .x { border:none; background:none; color:#94a3b8; padding:0 4px; font-size:15px; }
      .x:hover { color:#e11d48; }
      .msg { font-size:12px; color:#b91c1c; min-height:0; }
      .msg:empty { display:none; }
      .muted { color:#64748b; font-size:12px; }
      label { display:flex; align-items:center; gap:4px; }
    </style>
    <div class="panel">
      <div class="head"><span><span class="dot"></span><b>Route overlay</b></span><span class="chev"></span></div>
      <div class="body">
        <div class="row">
          <button class="primary pick">Load GPX…</button>
          <input type="file" class="file" accept=".gpx,application/gpx+xml" multiple hidden>
          <span class="muted status"></span>
        </div>
        <div class="row">
          <input type="text" class="url" placeholder="ridewithgps.com/routes/…">
          <button class="add">Add</button>
        </div>
        <div class="msg"></div>
        <ul class="list"></ul>
        <div class="row">
          <label><input type="checkbox" class="vis"> Show</label>
          <select class="units"><option value="mi">mi</option><option value="km">km</option></select>
          <select class="interval" title="Marker spacing">
            <option value="auto">auto</option><option value="off">off</option>
            <option value="1">1</option><option value="5">5</option><option value="10">10</option>
            <option value="25">25</option><option value="50">50</option><option value="100">100</option>
          </select>
          <button class="fit">Fit</button>
        </div>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const msgEl = $(".msg");
  const showError = (t) => { msgEl.textContent = t || ""; };

  $(".head").onclick = () => update({ collapsed: !state.collapsed });
  $(".pick").onclick = () => $(".file").click();
  $(".file").onchange = async (e) => {
    showError("");
    for (const f of e.target.files) {
      try { await addRoute(parseGpx(await f.text(), f.name.replace(/\.gpx$/i, ""))); }
      catch (err) { showError(`${f.name}: ${err.message}`); }
    }
    e.target.value = "";
  };
  const addUrl = async () => {
    const url = $(".url").value.trim();
    if (!url) return;
    showError("");
    $(".add").disabled = true;
    $(".add").textContent = "…";
    try {
      const res = await chrome.runtime.sendMessage({ type: "rwgps", url: url.startsWith("http") ? url : "https://" + url });
      if (!res || !res.ok) throw new Error(res ? res.error : "No response from extension");
      await addRoute(parseGpx(res.text, res.name));
      $(".url").value = "";
    } catch (err) {
      showError(err.message);
    } finally {
      $(".add").disabled = false;
      $(".add").textContent = "Add";
    }
  };
  $(".add").onclick = addUrl;
  $(".url").onkeydown = (e) => { if (e.key === "Enter") addUrl(); e.stopPropagation(); };
  $(".vis").onchange = (e) => update({ visible: e.target.checked });
  $(".units").onchange = (e) => update({ units: e.target.value });
  $(".interval").onchange = (e) => update({ interval: e.target.value });
  $(".fit").onclick = () => window.postMessage({ source: "rms-content", type: "fit" }, "*");

  function render() {
    $(".body").style.display = state.collapsed ? "none" : "";
    $(".chev").textContent = state.collapsed ? "▴" : "▾";
    $(".dot").classList.toggle("ok", mapFound);
    $(".dot").title = mapFound ? "Map connected" : "Waiting for map (try panning it)";
    $(".status").textContent = mapFound ? "" : "waiting for map…";
    $(".vis").checked = state.visible;
    $(".units").value = state.units;
    $(".interval").value = state.interval;
    const unitM = state.units === "km" ? 1000 : 1609.344;
    const list = $(".list");
    list.innerHTML = "";
    for (const r of state.routes) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="sw"></span><span class="name"></span><span class="dist"></span><button class="x" title="Remove">×</button>`;
      li.querySelector(".sw").style.background = r.color;
      li.querySelector(".name").textContent = r.name;
      li.querySelector(".name").title = r.name;
      li.querySelector(".dist").textContent = `${(r.meters / unitM).toFixed(0)} ${state.units}`;
      li.querySelector(".x").onclick = () => update({ routes: state.routes.filter((x) => x.id !== r.id) });
      list.appendChild(li);
    }
  }

  // ---------- wiring ----------
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.source !== "rms-page") return;
    if (e.data.type === "ready") pushToPage();
    if (e.data.type === "status") { mapFound = !!e.data.mapFound; render(); }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.rms || !changes.rms.newValue) return;
    if (changes.rms.newValue.rev === state.rev) return; // our own write
    state = { ...state, ...changes.rms.newValue };
    pushToPage();
    render();
  });

  (async () => {
    await load();
    document.documentElement.appendChild(host);
    render();
    pushToPage();
    window.postMessage({ source: "rms-content", type: "ping" }, "*");
  })();
})();
