// Shared helpers for the content scripts
var RMS = (() => {
  const COLORS = ["#e8452c", "#3c63d8", "#f59e0b", "#9333ea", "#db2777", "#0891b2"];

  // Min distance between points is ~5 m
  function simplify(raw) {
    const points = [];
    let meters = 0;
    for (const p of raw) {
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
      const last = points[points.length - 1];
      if (last) {
        const d = haversine(last, p);
        if (d < 5) continue;
        meters += d;
      }
      points.push([+(+p[0]).toFixed(6), +(+p[1]).toFixed(6)]);
    }
    if (points.length < 2) throw new Error("Route has no usable points");
    return { points, meters };
  }

  const fromRaw = (name, raw) => ({ name, ...simplify(raw) });

  function parseGpx(text, fallbackName) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Not a valid GPX file");
    let nodes = doc.getElementsByTagName("trkpt");
    if (!nodes.length) nodes = doc.getElementsByTagName("rtept");
    if (!nodes.length) throw new Error("No track or route points in GPX");
    const raw = Array.from(nodes, (n) => [parseFloat(n.getAttribute("lat")), parseFloat(n.getAttribute("lon"))]);
    const nameEl = doc.querySelector("trk > name, rte > name, metadata > name");
    return fromRaw((nameEl && nameEl.textContent.trim()) || fallbackName, raw);
  }

  const PROVIDERS = {
    rwgps: "RideWithGPS",
    komoot: "Komoot",
    strava: "Strava",
  };

  // Handles all three providers
  function parseLink(str) {
    let u;
    try { u = new URL(/^https?:/i.test(str.trim()) ? str.trim() : "https://" + str.trim()); } catch (_) { return null; }
    const host = u.hostname.replace(/^www\./, "");
    let m;
    if (/(^|\.)ridewithgps\.com$/.test(host) && (m = u.pathname.match(/\/(routes|trips)\/(\d+)/))) {
      const token = u.searchParams.get("privacy_code") || "";
      const page = new URL(`https://ridewithgps.com/${m[1]}/${m[2]}`);
      if (token) page.searchParams.set("privacy_code", token);
      return { provider: "rwgps", type: m[1], id: m[2], token, key: `rwgps:${m[1]}:${m[2]}`, pageUrl: page.href };
    }
    // Komoot has two URL formats: /tour/123456 and /smarttour/e123456
    if (/(^|\.)komoot\.(com|de)$/.test(host) && (m = u.pathname.match(/\/(smarttour|tour)\/(e?)(\d+)/))) {
      const id = m[3];
      const token = u.searchParams.get("share_token") || "";
      const page = new URL(m[1] === "smarttour" ? `https://www.komoot.com/smarttour/${m[2]}${id}` : `https://www.komoot.com/tour/${id}`);
      if (token) page.searchParams.set("share_token", token);
      return { provider: "komoot", type: "tour", id, token, key: `komoot:tour:${id}`, pageUrl: page.href };
    }
    if (/(^|\.)strava\.com$/.test(host) && (m = u.pathname.match(/\/(routes|activities)\/(\d+)/))) {
      return {
        provider: "strava", type: m[1], id: m[2], token: "", key: `strava:${m[1]}:${m[2]}`,
        pageUrl: `https://www.strava.com/${m[1]}/${m[2]}`
      };
    }
    if (/(^|\.)strava\.app\.link$/.test(host) || /^strava\.app\.link$/.test(host)) {
      return { provider: "strava", type: "short", id: "", token: "", key: "", pageUrl: u.href, shortUrl: u.href };
    }
    return null;
  }

  function fromPayload(p, fallbackName) {
    return p.kind === "gpx" ? parseGpx(p.text, p.name || fallbackName) : fromRaw(p.name || fallbackName, p.raw);
  }

  function fromProviderJson(provider, j, fallbackName) {
    if (provider === "rwgps") {
      const r = j.route || j.trip || j;
      const tp = r.track_points || j.track_points;
      if (!tp || !tp.length) throw new Error("No track points in RideWithGPS data");
      return fromRaw(r.name || fallbackName, tp.map((p) => [p.y ?? p.lat, p.x ?? p.lng]));
    }
    if (provider === "komoot") {
      const items = j._embedded && j._embedded.coordinates && j._embedded.coordinates.items;
      if (!items || !items.length) throw new Error("No coordinates in Komoot data");
      return fromRaw(j.name || fallbackName, items.map((p) => [p.lat, p.lng]));
    }
    throw new Error("Unsupported data");
  }

  function pickColor(routes) {
    const used = new Set(routes.map((r) => r.color));
    return COLORS.find((c) => !used.has(c)) || COLORS[routes.length % COLORS.length];
  }

  const newId = () => Date.now() + Math.random().toString(36).slice(2);

  return { parseGpx, fromRaw, fromPayload, fromProviderJson, parseLink, PROVIDERS, pickColor, newId };
})();
