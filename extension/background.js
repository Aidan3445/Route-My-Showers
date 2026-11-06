const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return s ? "?" + s : "";
};

// Pull raw [lat, lng] points out of a provider's JSON.
const fromJson = {
  rwgps(j) {
    const r = j.route || j.trip || j;
    const tp = r.track_points || j.track_points;
    return tp && tp.length ? { name: r.name, raw: tp.map((p) => [p.y ?? p.lat, p.x ?? p.lng]) } : null;
  },
  komoot(j) {
    const items = j._embedded && j._embedded.coordinates && j._embedded.coordinates.items;
    return items && items.length ? { name: j.name, raw: items.map((p) => [p.lat, p.lng]) } : null;
  },
};

function attemptsFor(info) {
  const { provider, type, id, token } = info;
  if (provider === "rwgps") {
    const base = `https://ridewithgps.com/${type}/${id}`;
    const gpx = `${base}.gpx${qs({ sub_format: "track", privacy_code: token })}`;
    const json = `${base}.json${qs({ privacy_code: token })}`;
    return [["gpx", gpx, "omit"], ["json", json, "omit"], ["gpx+cookies", gpx, "include"], ["json+cookies", json, "include"]];
  }
  if (provider === "komoot") {
    const json = `https://www.komoot.com/api/v007/tours/${id}${qs({ _embedded: "coordinates", share_token: token })}`;
    return [["json", json, "omit"], ["json+cookies", json, "include"]];
  }
  if (provider === "strava") {
    // Strava only exports GPX to signed-in users.
    return [["gpx+cookies", `https://www.strava.com/${type}/${id}/export_gpx`, "include"]];
  }
  return [];
}

async function attempt(provider, url, credentials) {
  let r;
  try {
    r = await fetch(url, { credentials, headers: { Accept: "application/gpx+xml, application/json;q=0.9, */*;q=0.5" } });
  } catch (_) {
    return { status: "network error" }; // Safari reports a missing site permission like this
  }
  if (/verify_velocipede/.test(r.url)) return { status: "human check" };
  if (/\/login\b|\/session\b/.test(new URL(r.url).pathname)) return { status: "needs sign-in" };
  if (!r.ok) return { status: String(r.status) };
  const text = await r.text();
  if (text.includes("<gpx")) return { payload: { kind: "gpx", text } };
  try {
    const got = fromJson[provider] && fromJson[provider](JSON.parse(text));
    return got ? { payload: { kind: "points", ...got } } : { status: "no track points" };
  } catch (_) {
    return { status: "web page, not a route" };
  }
}

function explain(provider, log) {
  const name = { rwgps: "RideWithGPS", komoot: "Komoot", strava: "Strava" }[provider] || provider;
  const all = log.join(", ");
  if (log.every((l) => l.endsWith("network error"))) return `Couldn't reach ${name}. Is the extension allowed on that site? (${all})`;
  if (log.some((l) => l.endsWith("needs sign-in"))) return `Sign in to ${name} first (${all})`;
  if (log.every((l) => /40[13]$/.test(l))) return `${name} says this route is private (${all})`;
  return `${name} refused the download (${all})`;
}

async function download(info) {
  const log = [];
  for (const [label, url, cred] of attemptsFor(info)) {
    const res = await attempt(info.provider, url, cred);
    if (res.payload) return { ok: true, payload: res.payload, via: label };
    log.push(`${label}: ${res.status}`);
  }
  return { ok: false, error: explain(info.provider, log) };
}

// Strava short links break, wait for redirect
async function resolveShort(url) {
  const r = await fetch(url, { credentials: "omit", redirect: "follow" });
  const pattern = /https?:\/\/(?:www\.)?strava\.com\/(?:routes|activities)\/\d+/;
  const m = r.url.match(pattern) || (await r.text()).match(pattern);
  if (!m) throw new Error("Couldn't find the Strava route behind that short link. Open it and copy the strava.com link instead.");
  return m[0];
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === "download") {
    download(msg.info).then(sendResponse, (e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  }
  if (msg.type === "resolve") {
    resolveShort(msg.url).then((url) => sendResponse({ ok: true, url }), (e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});
