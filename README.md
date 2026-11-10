# Route My Showers

Browser extension that draws your bike routes, with distance markers, on the Warmshowers "Find a Host" map.
Routes come from **RideWithGPS**, **Komoot**, **Strava** links, or local **GPX** files.
Works in Chrome, Firefox (desktop + Android) and Safari (Mac + iPhone/iPad).

## Install — Chrome
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `extension/` folder.

## Install — Firefox (desktop and Android)
- **Desktop, for development:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `extension/manifest.json`. It stays until Firefox restarts.
  Or run `npx web-ext run --source-dir extension` to open a fresh Firefox profile with it loaded, reloading on every edit.
- **Android:** Firefox for Android only installs add-ons listed on addons.mozilla.org. For testing before that, connect a phone with USB debugging on
  (and Firefox's Settings → Remote debugging via USB) and run `npx web-ext run -t firefox-android --source-dir extension`.
- **Website access:** Firefox can hold back site access. If the toolbar popup shows **Allow site access**, tap it (on Android the popup is under the
  ⋮ menu → Extensions → Route My Showers). Or grant it under Add-ons → Route My Showers → Permissions.

## Install — Safari (Mac and iPhone)
The Safari version is the same code wrapped in a small app, in [`safari/`](safari/). You need Xcode.

1. Open `safari/Route My Showers/Route My Showers.xcodeproj` in Xcode.
2. Every target has the signing team set already. To use a different Apple ID, change **Signing & Capabilities → Team** on each target.
   A free Apple ID works for your own devices (the iPhone build expires after 7 days and needs a re-run from Xcode).
3. **Mac:** choose the *Route My Showers (macOS)* scheme and press Run. Then in Safari → Settings → Extensions, tick **Route My Showers**.
   If it doesn't appear, turn on Safari → Settings → Advanced → "Show features for web developers", then Develop → "Allow Unsigned Extensions".
4. **iPhone:** choose the *Route My Showers (iOS)* scheme with your phone as the destination and press Run.
   On the phone: Settings → Apps → Safari → Extensions → **Route My Showers** → turn it on.
   The first time, iOS may ask you to trust the developer: Settings → General → VPN & Device Management.
5. **Website access (important):** in that same extension setting, set these to **Allow**:
   warmshowers.org, ridewithgps.com, komoot.com, strava.com. You can also do it from the puzzle-piece / AA menu on each site → Route My Showers → Always Allow.
   Without these, links fail and the "Add to Warmshowers map" button doesn't appear on route pages.

The Xcode project points at the files in `extension/`, so edits there show up on the next Xcode build.
Don't regenerate the project with `safari-web-extension-converter`. It would drop the signing team.
If you add a file to `extension/`, add it to the Safari extension targets in Xcode instead (drag it into the project and tick both "Extension" targets).

## Use
- The round route button sits in the bottom-right corner of the map. Tap it to open or collapse **Your routes**.
- Copy a route link, then tap **Paste & add**. It reads the clipboard and adds the route in one go (on iPhone, Safari asks you to confirm with its own "Paste" bubble). If the clipboard isn't a usable link, a text box appears with what was pasted so you can fix it, and the button becomes **Add**. It goes back to the single button after a route is added or when you close the panel. Supported links:
  - RideWithGPS: `ridewithgps.com/routes/…` and `/trips/…` (private ones with `privacy_code` work)
  - Komoot: `komoot.com/tour/…` and curated `komoot.com/smarttour/…` links (private tours work with their `share_token` link)
  - Strava: `strava.com/routes/…`, `/activities/…`, and `strava.app.link/…` short links. Strava only lets signed-in users download, so sign in to strava.com in Safari/Chrome once.
- **Load a GPX file** for anything else (on iPhone this opens the Files app).
- If the extension can't download a route directly (on iPhone it never has Safari's logins), the panel goes to the route's page, where you're signed in, imports it from there, and brings you straight back. This happens automatically.
  Every route page on those sites also gets an **Add to Warmshowers map** button.
- **Show on map** switch and **Fit** live in the panel.
- **Distance to host:** tap a host on the map and its card shows a badge, e.g. "1.6 mi from route · at mile 49".
  This is the straight-line distance to the nearest point on any of your routes, and how far along that route the point is. It names the route when you have several.
  "~" means the host's exact position wasn't available, so the distance is measured from where you tapped.
- **Toolbar popup** (Chrome: puzzle-piece menu; Safari on iPhone: the **AA** / extensions menu in the address bar):
  hide or show the route button, show or hide routes, switch **mi/km**, and set **distance markers** (Auto follows zoom, Off, or every N).
- Routes are saved in the extension's storage and come back when you reload. They're stored per browser, not synced.

## How it works
- `loader.js` injects `page.js` into the page's own JS world. The site doesn't expose its `google.maps.Map`, so `page.js` wraps a few
  `google.maps` methods (`Map.prototype.getBounds/getZoom/...`, `MVCObject.get/set`, `event.addListener`).
  The first time the site touches its map, `page.js` captures it and draws `Polyline`s and `Marker`s on it.
- `content.js` is the Warmshowers panel. `gpx.js` has shared parsing (GPX, link recognition, provider JSON).
- `background.js` downloads routes, because content scripts can't make cross-site requests (CORS). It tries several URL/cookie variants per site. If they all fail, the panel shows a plain reason and the browser console logs each attempt.
- `source.js` runs on RideWithGPS, Komoot and Strava pages for the on-page import.
- `popup.html`/`popup.js` is the toolbar popup.

## Demo and privacy pages
`docs/` is served by GitHub Pages: `docs/demo/` is a public stand-in for the host map with sample hosts (for store reviewers and anyone without a membership), and `docs/privacy.html` is the privacy policy.
The demo needs a Google Maps JavaScript API key in `MAPS_KEY` at the bottom of `docs/demo/index.html`, restricted to `https://aidan3445.github.io/*`.

If the dot in the panel header stays amber ("Looking for the map…"), pan or zoom the map once.
