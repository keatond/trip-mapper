# Handoff — Google Photos Spike (run it / continue on the mini PC)

This `spike/` folder is self-contained. It tests whether trip-mapper can pull
**GPS + timestamp** from Google Photos via the Picker API. Read `FINDINGS.md` for
what we're trying to answer; `SETUP.md` for the one-time Google Cloud setup.

---

## Prerequisites
- **Node.js 18+** (uses built-in `fetch`; developed on Node 20).
- A Google account with some geotagged photos.
- An OAuth Client ID — see `SETUP.md` (≈10 min, one time).

## Copy it to the mini PC
From the dev machine:
```bash
# copy just the spike folder (it's standalone)
scp -r /home/drake/Developer/trip-mapper/spike  user@mini-pc:/home/user/trip-mapper-spike
```
(Or copy the whole `trip-mapper` repo; only `spike/` is needed for this.)

## One manual config step
Edit `spike/config.js` and paste your Client ID:
```js
export const CLIENT_ID = "....apps.googleusercontent.com";
```
If you run on a **different host/port** than `http://localhost:8787`, update:
- `PORT` in `spike/config.js` **and** `spike/server.mjs` (`PORT` env or constant),
- the **Authorized JavaScript origin** in the Google Cloud console (`SETUP.md` 4.5).

## Run it
```bash
cd /path/to/spike
node server.mjs
# open http://localhost:8787 in a browser on that machine
```
Then in the page:
1. **Sign in with Google** (consent — your account must be a Test user; `SETUP.md` 3.5).
2. **Open photo picker** → pick a few geotagged photos in the Google tab → return.
3. **Fetch picked items** → read Steps 2 & 3 on the page.
4. Copy the results into `FINDINGS.md` (Q1/Q2/Q3 + GO/NO-GO).

## Verify the offline half (no OAuth needed)
```bash
mkdir -p /tmp/tm-spike && cd /tmp/tm-spike && npm install exifr
cd /path/to/trip-mapper && node spike/test/exif-bytes.test.mjs   # expects PASS
```
This confirms bytes → EXIF → {GPS, timestamp} works on a known photo, so any live
failure is isolated to the OAuth/Picker/`baseUrl=d` layer.

---

## What the NEXT session should do
Branch on the `FINDINGS.md` decision:

- **GO** → start the real integration (the spike stays as reference). Build, in order:
  1. "Import from Google Photos" button + Picker session UI in the main app.
  2. A proxy + EXIF-on-bytes adapter that emits the **existing photo shape**
     `{ name, lat, lon, ts, thumbUrl }` (so `clusterTrips` / `map.js` / `sidebar.js`
     work unchanged — see `js/app.js`).
  3. Feed imported photos through `clusterTrips` → existing render path.
  4. Performance pass (thumbnail sizing via `=w<px>-h<px>`, download concurrency,
     Picker/quotas).
  Promote `server.mjs` into the app's hosting/proxy server for the mini PC.

- **NO-GO** (EXIF stripped from `baseUrl=d`) → do **not** build the Picker import.
  Keep the current drag-drop flow; if batch import is wanted, prototype a **Google
  Takeout** importer that reads the sidecar `*.json` `geoData` for lat/lon. Record
  the decision in `FINDINGS.md`.

## Files in this folder
```
spike/
  SETUP.md                     # one-time Google Cloud / OAuth setup
  HANDOFF-google-photos.md     # this file
  FINDINGS.md                  # fill in after the live run (the deliverable)
  config.js                    # CLIENT_ID + scope + port  (edit this)
  server.mjs                   # static host + /proxy (CORS bypass for baseUrl=d)
  index.html                   # the spike UI
  spike.js                     # OAuth -> Picker -> dump -> byte+EXIF
  test/exif-bytes.test.mjs     # offline proof: bytes -> EXIF -> {GPS, time}
```
