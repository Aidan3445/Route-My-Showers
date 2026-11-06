// Warmshowers hides its map access so we try to detect it from interactions and renders
(() => {
  if (window.__rmsPage) return;
  window.__rmsPage = true;

  const FLAG = "__rmsWrapped";
  const looksLikeMap = (o) =>
    o && typeof o.getDiv === "function" && typeof o.fitBounds === "function" &&
    typeof o.getZoom === "function";

  let map = null;
  let idleListener = null;
  let state = { routes: [], units: "mi", interval: "auto", visible: true };
  let drawn = []; // [{ route, lines: [], markers: [], interval }]

  const post = (msg) => window.postMessage({ source: "rms-page", ...msg }, "*");

  function capture(o) {
    if (!looksLikeMap(o) || o === map) return;
    map = o;
    if (idleListener) idleListener.remove();
    idleListener = google.maps.event.addListener(map, "idle", () => updateMarkers(false));
    post({ type: "status", mapFound: true });
    redraw();
  }

  // Wrap events to capture and test for map instances
  function wrap(obj, name, transform) {
    const orig = obj && obj[name];
    if (typeof orig !== "function" || orig[FLAG]) return;
    const w = function(...args) {
      try {
        if (looksLikeMap(this)) capture(this);
        else if (looksLikeMap(args[0])) capture(args[0]);
        if (transform) args = transform(this, args) || args;
      } catch (_) { }
      return orig.apply(this, args);
    };
    w[FLAG] = true;
    obj[name] = w;
  }

  function tryPatch() {
    const gm = window.google && window.google.maps;
    if (!gm) return;
    if (gm.Map && gm.Map.prototype) {
      for (const m of ["getBounds", "getZoom", "getCenter", "setCenter", "setZoom",
        "fitBounds", "panTo", "setOptions", "get", "set"]) {
        wrap(gm.Map.prototype, m);
      }
    }
    if (gm.MVCObject && gm.MVCObject.prototype) {
      wrap(gm.MVCObject.prototype, "get");
      wrap(gm.MVCObject.prototype, "set");
      wrap(gm.MVCObject.prototype, "addListener", (self, [ev, fn, ...rest]) => [ev, tapClick(self, ev, fn), ...rest]);
    }
    if (gm.event) {
      const viaEvent = (_self, [inst, ev, fn, ...rest]) => [inst, ev, tapClick(inst, ev, fn), ...rest];
      wrap(gm.event, "addListener", viaEvent);
      wrap(gm.event, "addListenerOnce", viaEvent);
    }
  }

  let lastTap = null; // { lat, lng, exact, at }

  // Get position of tap
  function latLngOf(p) {
    if (!p) return null;
    const lat = typeof p.lat === "function" ? p.lat() : p.lat;
    const lng = typeof p.lng === "function" ? p.lng() : p.lng;
    return isFinite(lat) && isFinite(lng) ? { lat: +lat, lng: +lng } : null;
  }
  const markerPos = (m) =>
    m && !looksLikeMap(m) && latLngOf(typeof m.getPosition === "function" ? m.getPosition() : m.position);

  function noteTap(pos, exact) {
    if (!pos) return;
    // Ignore nearby taps but allow exact taps in case it is a new marker
    if (!exact && lastTap && lastTap.exact && Date.now() - lastTap.at < 400) return;
    lastTap = { ...pos, exact, at: Date.now() };
    onHostTap();
  }

  function tapClick(target, ev, fn) {
    if (typeof fn !== "function" || !/^(click|gmp-click)$/.test(ev) || !target || looksLikeMap(target)) return fn;
    if (typeof target.getPosition !== "function" && !("position" in target)) return fn;
    return function(...a) {
      try { noteTap(markerPos(target), true); } catch (_) { }
      return fn.apply(this, a);
    };
  }

  let overlay = null;
  function projection() {
    if (!map || !google.maps.OverlayView) return null;
    if (!overlay || overlay.getMap() !== map) {
      overlay = new google.maps.OverlayView();
      overlay.onAdd = overlay.draw = overlay.onRemove = () => { };
      overlay.setMap(map);
    }
    return overlay.getProjection && overlay.getProjection();
  }
  document.addEventListener("pointerdown", (e) => {
    if (!map) return;
    const path = e.composedPath ? e.composedPath() : [];
    const adv = path.find((el) => el && el.tagName === "GMP-ADVANCED-MARKER");
    if (adv) return noteTap(latLngOf(adv.position), true);
    const div = map.getDiv();
    if (!path.includes(div)) return;
    const proj = projection();
    if (!proj) return;
    const r = div.getBoundingClientRect();
    const ll = proj.fromContainerPixelToLatLng(new google.maps.Point(e.clientX - r.left, e.clientY - r.top));
    noteTap(latLngOf(ll), false);
  }, true);
  setInterval(tryPatch, 250);
  tryPatch();

  const unitMeters = () => (state.units === "km" ? 1000 : 1609.344);

  function clear() {
    for (const d of drawn) {
      d.lines.forEach((l) => l.setMap(null));
      d.markers.forEach((m) => m.setMap(null));
    }
    drawn = [];
  }

  async function ensureLibs() {
    const gm = google.maps;
    if (!gm.Polyline && gm.importLibrary) await gm.importLibrary("maps");
    if (!gm.Marker && gm.importLibrary) await gm.importLibrary("marker");
  }

  let drawToken = 0;
  async function redraw() {
    const token = ++drawToken;
    clear();
    if (!map || !state.visible || !state.routes.length) return;
    await ensureLibs();
    if (token !== drawToken) return;
    const gm = google.maps;
    for (const r of state.routes) {
      const path = r.points.map(([lat, lng]) => ({ lat, lng }));
      const common = { path, map, clickable: false, geodesic: false };
      const lines = [
        new gm.Polyline({ ...common, strokeColor: "#ffffff", strokeOpacity: 0.9, strokeWeight: 7, zIndex: 1000 }),
        new gm.Polyline({ ...common, strokeColor: r.color, strokeOpacity: 0.95, strokeWeight: 4, zIndex: 1001 }),
      ];
      drawn.push({ route: r, lines, markers: [], interval: null, cum: cumulative(r.points) });
    }
    updateMarkers(true);
  }

  // Reasonable marker spacing
  function autoInterval() {
    const z = map.getZoom() ?? 10;
    const c = map.getCenter();
    const lat = c ? c.lat() : 40;
    const metersPerPx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
    const target = (metersPerPx * 70) / unitMeters();
    return [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find((s) => s >= target) || 1000;
  }

  function markerIcon(color, text) {
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: text.length > 2 ? 12 : 10,
      fillColor: "#ffffff",
      fillOpacity: 1,
      strokeColor: color,
      strokeWeight: 2.5,
    };
  }

  function makeMarker(pos, color, text, title, fill) {
    const icon = markerIcon(color, text);
    if (fill) { icon.fillColor = fill; icon.strokeColor = "#ffffff"; }
    return new google.maps.Marker({
      position: pos, map, clickable: true, title, zIndex: 1002, icon,
      label: { text, color: fill ? "#ffffff" : "#222222", fontSize: "10px", fontWeight: "700" },
    });
  }

  function updateMarkers(force) {
    if (!map || !google.maps.Marker) return;
    const iv = state.interval === "off" ? 0
      : state.interval === "auto" ? autoInterval() : Number(state.interval);
    const unit = state.units;
    for (const d of drawn) {
      if (!force && d.interval === iv) continue;
      d.markers.forEach((m) => m.setMap(null));
      d.markers = [];
      d.interval = iv;
      const pts = d.route.points, cum = d.cum, total = cum[cum.length - 1];
      if (!pts.length) continue;
      const toPos = (p) => ({ lat: p[0], lng: p[1] });
      const totalTxt = (total / unitMeters()).toFixed(1);
      d.markers.push(makeMarker(toPos(pts[0]), d.route.color, "S", `${d.route.name} — start`, "#2e7d32"));
      d.markers.push(makeMarker(toPos(pts[pts.length - 1]), d.route.color, "F",
        `${d.route.name} — finish (${totalTxt} ${unit})`, "#c62828"));
      if (!iv) continue;
      const step = iv * unitMeters();
      let i = 1;
      for (let k = 1; k * step < total && k <= 500; k++) {
        const target = k * step;
        while (cum[i] < target) i++;
        const seg = cum[i] - cum[i - 1] || 1;
        const t = (target - cum[i - 1]) / seg;
        const a = pts[i - 1], b = pts[i];
        const pos = { lat: a[0] + t * (b[0] - a[0]), lng: a[1] + t * (b[1] - a[1]) };
        const n = String(k * iv);
        d.markers.push(makeMarker(pos, d.route.color, n, `${d.route.name} — ${n} ${unit}`));
      }
    }
  }

  function fit() {
    if (!map || !state.routes.length) return;
    const b = new google.maps.LatLngBounds();
    state.routes.forEach((r) => r.points.forEach(([lat, lng]) => b.extend({ lat, lng })));
    map.fitBounds(b, 40);
  }

  const CARD_TEXT = 'div[class~="@container/card-header"] > * p';
  const cumCache = new WeakMap();
  const cumOf = (r) => { let c = cumCache.get(r); if (!c) cumCache.set(r, (c = cumulative(r.points))); return c; };

  function nearest(pt) {
    const R = 6371008.8, rad = Math.PI / 180;
    const kx = Math.cos(pt.lat * rad) * R * rad, ky = R * rad;
    let best = null;
    for (const r of state.routes) {
      const pts = r.points, cum = cumOf(r);
      for (let i = 1; i < pts.length; i++) {
        const ax = (pts[i - 1][1] - pt.lng) * kx, ay = (pts[i - 1][0] - pt.lat) * ky;
        const bx = (pts[i][1] - pt.lng) * kx, by = (pts[i][0] - pt.lat) * ky;
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
        const d = Math.hypot(ax + t * dx, ay + t * dy);
        if (!best || d < best.d) best = { d, along: cum[i - 1] + t * (cum[i] - cum[i - 1]), route: r };
      }
    }
    return best;
  }

  const fmt = (m) => {
    const v = m / unitMeters();
    return `${v < 0.1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v)} ${state.units}`;
  };

  let badgeInfo = null; // { html, title, color, tapAt, boundTo }
  function onHostTap(keep = false) {
    if (!lastTap || !state.routes.length) { badgeInfo = null; return syncBadge(); }
    const n = nearest(lastTap);
    if (!n) return;
    const many = state.routes.length > 1;
    const prev = badgeInfo;
    const shown = document.querySelector(CARD_TEXT);
    badgeInfo = {
      text: `${lastTap.exact ? "" : "~ "}${fmt(n.d)} from route`,
      sub: `${many ? n.route.name + " · " : ""}at ${state.units === "km" ? "km" : "mile"} ${Math.round(n.along / unitMeters())}`,
      color: n.route.color,
      tapAt: keep && prev ? prev.tapAt : Date.now(),
      boundTo: keep && prev ? prev.boundTo : null,
      staleKey: keep && prev ? prev.staleKey : shown ? shown.textContent.trim() : null,
    };
    // Same host tapped again
    if (!keep) [300, 1300].forEach((ms) => setTimeout(syncBadge, ms));
    syncBadge();
  }

  function makeBadge(info) {
    const el = document.createElement("span");
    el.setAttribute("data-rms-distance", "");
    el.title = info.sub;
    el.style.cssText =
      "display:inline-flex;align-items:center;gap:6px;margin:4px 0 0;padding:3px 10px 3px 8px;" +
      "border-radius:999px;background:#e6f2f0;color:#0e6b6b;font:600 12px/1.3 -apple-system,system-ui,sans-serif;" +
      "white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;";
    const dot = document.createElement("span");
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;flex:none;background:${info.color};`;
    const txt = document.createElement("span");
    txt.textContent = info.text;
    const sub = document.createElement("span");
    sub.style.cssText = "font-weight:500;opacity:.75;overflow:hidden;text-overflow:ellipsis;";
    sub.textContent = `· ${info.sub}`;
    el.append(dot, txt, sub);
    return el;
  }

  function syncBadge() {
    const p = document.querySelector(CARD_TEXT);
    const existing = document.querySelectorAll("[data-rms-distance]");
    if (!p || !badgeInfo) { existing.forEach((e) => e.remove()); return; }
    const key = p.textContent.trim();
    if (!badgeInfo.boundTo) {
      const age = Date.now() - badgeInfo.tapAt;
      if (age > 4000) { existing.forEach((e) => e.remove()); return; }
      if (key === badgeInfo.staleKey && age < 1200) { existing.forEach((e) => e.remove()); return; }
      badgeInfo.boundTo = key;
    } else if (badgeInfo.boundTo !== key) {
      existing.forEach((e) => e.remove());
      return;
    }
    const next = p.nextElementSibling;
    if (next && next.hasAttribute("data-rms-distance") && next.dataset.v === badgeInfo.text + badgeInfo.sub) return;
    existing.forEach((e) => e.remove());
    const b = makeBadge(badgeInfo);
    b.dataset.v = badgeInfo.text + badgeInfo.sub;
    p.after(b);
  }

  let syncQueued = false;
  new MutationObserver(() => {
    if (syncQueued || !badgeInfo) return;
    syncQueued = true;
    requestAnimationFrame(() => { syncQueued = false; syncBadge(); });
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.source !== "rms-content") return;
    const msg = e.data;
    if (msg.type === "state") {
      state = msg.state;
      redraw();
      if (badgeInfo) onHostTap(true);
    } else if (msg.type === "fit") {
      fit();
    } else if (msg.type === "ping") {
      post({ type: "status", mapFound: !!map });
    }
  });
  post({ type: "ready" });
})();
