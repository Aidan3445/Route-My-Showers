// Runs on RideWithGPS, Komoot and Strava
(() => {
  if (window.__rmsSource) return;
  window.__rmsSource = true;

  const DEFAULT_RETURN = "https://app.warmshowers.org/find-host";
  const safeReturn = (u) => {
    try {
      const url = new URL(u);
      const ok = /(^|\.)warmshowers\.(org|com)$/.test(url.hostname) ||
        (url.origin === "https://aidan3445.github.io" && url.pathname.startsWith("/Route-My-Showers/demo/"));
      return ok ? u : DEFAULT_RETURN;
    }
    catch (_) { return DEFAULT_RETURN; }
  };

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;z-index:2147483000;left:12px;bottom:calc(env(safe-area-inset-bottom, 0px) + 16px);";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      button { font: 600 15px/1.2 system-ui, -apple-system, sans-serif; color: #fff; background: #0e6b6b;
               border: none; border-radius: 999px; padding: 12px 18px; cursor: pointer;
               box-shadow: 0 4px 14px rgba(14,107,107,.35); max-width: calc(100vw - 24px);
               display: flex; align-items: center; gap: 8px; -webkit-tap-highlight-color: transparent; }
      button:active { transform: scale(.97); }
      button.done { background: #2e7d32; }
      button.err { background: #b91c1c; }
    </style>
    <button>Add to Warmshowers map</button>`;
  const btn = root.querySelector("button");
  const setBtn = (text, cls = "") => { btn.textContent = text; btn.className = cls; };

  let info = null;
  let busy = false;

  const pageName = () =>
    document.title.replace(/\s*[|–-]\s*(Ride with GPS|Komoot|Strava).*$/i, "").trim() || `${RMS.PROVIDERS[info.provider]} ${info.id}`;

  // Same-site downloads
  async function fetchHere(i) {
    const name = pageName();
    const tryGpx = async (url) => {
      const r = await fetch(url, { credentials: "include" });
      const t = await r.text();
      if (r.ok && t.includes("<gpx")) return RMS.parseGpx(t, name);
      throw new Error(`HTTP ${r.status}`);
    };
    const tryJson = async (url) => {
      const r = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return RMS.fromProviderJson(i.provider, await r.json(), name);
    };
    if (i.provider === "rwgps") {
      const q = i.token ? `privacy_code=${encodeURIComponent(i.token)}` : "";
      try { return await tryGpx(`/${i.type}/${i.id}.gpx?sub_format=track${q ? "&" + q : ""}`); }
      catch (_) { return tryJson(`/${i.type}/${i.id}.json${q ? "?" + q : ""}`); }
    }
    if (i.provider === "komoot") {
      const q = i.token ? `&share_token=${encodeURIComponent(i.token)}` : "";
      return tryJson(`/api/v007/tours/${i.id}?_embedded=coordinates${q}`);
    }
    if (i.provider === "strava") {
      try { return await tryGpx(`/${i.type}/${i.id}/export_gpx`); }
      catch (e) { throw new Error(`${e.message}. Are you signed in to Strava?`); }
    }
    throw new Error("Unsupported site");
  }

  async function importRoute(returnTo) {
    if (!info || busy) return;
    busy = true;
    setBtn("Adding…");
    try {
      const parsed = await fetchHere(info);
      const s = (await chrome.storage.local.get("rms")).rms || {};
      const routes = (s.routes || []).filter((r) => r.source !== info.key);
      routes.push({ id: RMS.newId(), color: RMS.pickColor(routes), source: info.key, ...parsed });
      const rev = RMS.newId();
      await chrome.storage.local.set({ rms: { ...s, routes, rev }, rmsRev: rev });
      await chrome.storage.local.remove("rmsPending");
      if (returnTo) {
        setBtn("Added. Back to Warmshowers…", "done");
        setTimeout(() => location.replace(safeReturn(returnTo)), 600);
      } else {
        setBtn("Added to your Warmshowers map", "done");
      }
    } catch (e) {
      setBtn(`Couldn't add: ${e.message}`, "err");
    } finally {
      busy = false;
    }
  }
  btn.onclick = () => importRoute();

  // Re-check on in-app navigation
  let lastHref = "";
  async function check() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    const parsed = RMS.parseLink(location.href);
    info = parsed && parsed.type !== "short" ? parsed : null;
    if (!info) { host.remove(); return; }
    if (!host.isConnected) document.documentElement.appendChild(host);
    setBtn("Add to Warmshowers map");

    const fromHash = location.hash.includes("rms-import");
    let returnTo = "";
    if (fromHash) {
      const m = location.hash.match(/return=([^&]+)/);
      if (m) returnTo = decodeURIComponent(m[1]);
      history.replaceState(null, "", location.href.split("#")[0]);
      lastHref = location.href;
    }
    const { rmsPending } = await chrome.storage.local.get("rmsPending");
    const pending = rmsPending && rmsPending.key === info.key && Date.now() - rmsPending.at < 15 * 60 * 1000;
    if (pending && rmsPending.returnTo) returnTo = returnTo || rmsPending.returnTo;
    if (fromHash || pending) importRoute(returnTo || DEFAULT_RETURN);
  }
  check();
  setInterval(check, 1000);
})();
