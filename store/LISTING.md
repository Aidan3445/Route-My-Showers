# Chrome Web Store submission

## 1. Package
```
./store/build.sh
```
Upload `dist/route-my-showers-<version>.zip`. Bump `version` in `extension/manifest.json` for every new upload.

## 2. Store listing tab

**Name:** Route My Showers

**Summary** (from manifest, max 132 chars):
Overlay RideWithGPS, Komoot, Strava and GPX routes (with mile markers) on the Warmshowers host map.

**Category:** Travel (alternatively Tools)

**Language:** English

**Description:**
```
See which Warmshowers hosts are actually on your route.

Route My Showers draws your bike routes, with distance markers, right on the Warmshowers "Find a Host" map.

- Add routes from RideWithGPS, Komoot or Strava links, or load any GPX file
- Private routes work with their share links (privacy_code / share_token)
- Distance markers every mile or km, following zoom or at a fixed interval
- Tap a host to see how far they are from your route, and at which mile
- "Add to Warmshowers map" button on RideWithGPS, Komoot and Strava route pages
- Several routes at once, each in its own color
- Miles or kilometers

Your routes are stored only in your browser. No account, no tracking, no server.

Route My Showers is an independent project and is not affiliated with Warmshowers, RideWithGPS, Komoot or Strava.
```

**Graphics (required):**
- Store icon 128x128: `extension/icons/icon128.png`
- At least 1 screenshot, 1280x800 or 640x400 (PNG/JPEG). Good ones: map with a route and markers; a host card with the distance badge; the popup.
- Small promo tile 440x280 (optional but recommended).

## 3. Privacy tab

**Single purpose:**
Draws the user's bike routes (from RideWithGPS, Komoot, Strava or GPX files) on the Warmshowers host map so they can find hosts along the route.

**Permission justifications:**
- `storage`: Saves the user's routes and display settings locally so they persist across page reloads.
- `unlimitedStorage`: Long routes contain tens of thousands of track points; several routes can exceed the default 10 MB local storage quota.
- Host permissions (ridewithgps.com, komoot.com, komoot.de, api.komoot.de, strava.com, strava.app.link): Downloads the route the user pasted from that site (content scripts can't make cross-site requests), resolves Strava short links, and adds an "Add to Warmshowers map" button on route pages.
- Content scripts on warmshowers.org / warmshowers.com: Draws the routes on the site's host map and shows distance-to-route on host cards.

**Remote code:** No, I am not using remote code.

**Data usage:** Tick **Location** (route track points are location data). Leave everything else unticked.
Then tick all three certifications (not sold, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy URL:**
https://github.com/Aidan3445/Route-My-Showers/blob/main/PRIVACY.md

## 4. Distribution tab
Free, Public (or Unlisted to share by link only), all regions.
