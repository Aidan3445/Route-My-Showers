# Route My Showers

Chrome extension that draws GPX / RideWithGPS routes, with distance markers, on the Warmshowers "Find a Host" map.

## Install
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Open the Warmshowers map. A **Route overlay** panel appears in the bottom-right corner.

## Use
- **Load GPX…** loads one or more local `.gpx` files (track or route points).
- Paste a RideWithGPS link (`ridewithgps.com/routes/123` or `/trips/123`) and click **Add**. Private routes work if you're signed in to RideWithGPS in Chrome, or if the link includes a `privacy_code`.
- **mi/km** switches units. The marker setting is `auto` (spacing follows zoom level), `off`, or a fixed interval. **S** and **F** mark the start and finish.
- Routes are saved in `chrome.storage.local` and come back when you reload the page.

## How it works
The site doesn't expose its `google.maps.Map`, so `page.js` runs in the page's MAIN world and wraps a few
`google.maps` methods (`Map.prototype.getBounds/getZoom/...`, `MVCObject.get/set`, `event.addListener`).
The first time the site touches its map, it captures the instance and draws `Polyline`s and `Marker`s on it.
`content.js` holds the panel and parses GPX files. `background.js` fetches RideWithGPS GPX files, which a content script can't do because of CORS.

If the dot in the panel header stays orange ("waiting for map…"), pan or zoom the map once.
