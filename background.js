// Fetches RideWithGPS GPX exports (content scripts can't, because of CORS).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "rwgps") return;
  (async () => {
    try {
      const u = new URL(msg.url.trim());
      if (!/(^|\.)ridewithgps\.com$/.test(u.hostname)) throw new Error("Not a ridewithgps.com link");
      const m = u.pathname.match(/\/(routes|trips)\/(\d+)/);
      if (!m) throw new Error("Link should look like ridewithgps.com/routes/12345");
      const gpx = new URL(`https://ridewithgps.com/${m[1]}/${m[2]}.gpx`);
      gpx.searchParams.set("sub_format", "track");
      const pc = u.searchParams.get("privacy_code");
      if (pc) gpx.searchParams.set("privacy_code", pc);

      const r = await fetch(gpx, { credentials: "include" });
      if (r.status === 401 || r.status === 403 || r.status === 404) {
        throw new Error("Route is private or missing — sign in to RideWithGPS, use a share link, or export the GPX");
      }
      if (!r.ok) throw new Error(`RideWithGPS returned HTTP ${r.status}`);
      const text = await r.text();
      if (!text.includes("<gpx")) throw new Error("Didn't get a GPX back (private route? try signing in to RideWithGPS)");
      sendResponse({ ok: true, text, name: `RWGPS ${m[1].slice(0, -1)} ${m[2]}` });
    } catch (e) {
      sendResponse({ ok: false, error: e.message || String(e) });
    }
  })();
  return true; // async response
});
