// Runs in the page's MAIN world so it can reach the site's google.maps.Map instance.
// The site never exposes its map, so we wrap a few google.maps methods and grab the
// instance the first time the site (or the user panning) touches it.
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

  // ---------- map capture ----------
  function capture(o) {
    if (!looksLikeMap(o) || o === map) return;
    map = o;
    if (idleListener) idleListener.remove();
    idleListener = google.maps.event.addListener(map, "idle", () => updateMarkers(false));
    post({ type: "status", mapFound: true });
    redraw();
  }

  function wrap(obj, name) {
    const orig = obj && obj[name];
    if (typeof orig !== "function" || orig[FLAG]) return;
    const w = function (...args) {
      try {
        if (looksLikeMap(this)) capture(this);
        else if (looksLikeMap(args[0])) capture(args[0]); // event.addListener(map, ...)
      } catch (_) {}
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
    }
    if (gm.event) {
      wrap(gm.event, "addListener");
      wrap(gm.event, "addListenerOnce");
    }
  }
  setInterval(tryPatch, 250);
  tryPatch();

  // ---------- drawing ----------
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

  function haversine(a, b) {
    const R = 6371008.8, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function cumulative(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
    return cum;
  }

  // Pick a "nice" spacing so markers end up ~70px apart at the current zoom.
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

  // ---------- messaging with content script ----------
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.source !== "rms-content") return;
    const msg = e.data;
    if (msg.type === "state") {
      state = msg.state;
      redraw();
    } else if (msg.type === "fit") {
      fit();
    } else if (msg.type === "ping") {
      post({ type: "status", mapFound: !!map });
    }
  });
  post({ type: "ready" });
})();
