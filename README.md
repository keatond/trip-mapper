# Trip Mapper

A static, browser-only web app that turns a pile of geotagged photos into a map of your trips.
Drag photos onto the page → it reads each photo's EXIF GPS + timestamp **in the browser**,
clusters them into distinct trips, and shows each trip as a sidebar entry with a map (pins in
time order + a route line). Single-user, no backend, no accounts.

Photo pins on the map use **zoom-based clustering**: when pins sit close together they collapse
into one amber circle showing how many pins it holds; zoom in and the cluster splits back into
individual pins. The route line is shown only once the pins are fully separated.

## Run it

ES modules need to be served over HTTP (not opened as `file://`):

```bash
cd /home/drake/Developer/trip-mapper
python3 -m http.server 8000
```

Then open **http://localhost:8000** and drag photos onto the drop zone (or click to choose files).

### Importing from Google Photos (a `.zip` works too)

You don't need the photos as loose files. In **Google Photos on the web**, multi-select the
photos you want → **Download** → the browser gives you a single `.zip` of the **originals**
(which keep their EXIF GPS — Google only strips location on the *Photos API* download path, not
on a normal web download). **Drag that `.zip`** straight onto the drop zone: Trip Mapper unzips
it **in the browser** (via JSZip), pulls out the image entries (ignoring `__MACOSX/`, `.DS_Store`,
and non-images), and maps them like any other photos. You can mix loose images and `.zip`s in one
drop.

Photos with no location (taken in airplane mode, with location services off, or delivered as a
transcoded copy) can't be placed — they're listed under the map with a per-file reason rather than
silently dropped. HEIC photos (iPhone) are read for GPS even though some browsers can't render a
HEIC thumbnail; those show a "Preview unavailable" placeholder while still mapping correctly.

> Requires internet access in the browser: map tiles (CARTO Voyager streets + Esri World
> Imagery satellite — both free, no API key), the `exifr`, `Leaflet`, and `Leaflet.markercluster`
> libraries (CDN), and reverse geocoding (Nominatim). Use the layer toggle (top-right of the map)
> to switch between the street and satellite views.

## How trip clustering works

Photos are sorted by timestamp, then a **location-first** rule groups them:

> Start a **new trip** only when the next photo is either **> 150 km** from the previous photo
> (great-circle / haversine distance) **OR > 5 days** later. Otherwise it joins the current trip.

This avoids the over-fragmentation you get from naive "split on a big time gap" rules (a 3-day
trip with an overnight gap would wrongly become several trips). Both thresholds are tunable via
`clusterTrips(photos, { moveKm, deadGapDays })`.

## Validated sample result

Dropping the 11 sample photos (`/home/drake/Pictures/PXL_*.jpg`) yields exactly **3 trips**:

| Trip | Place | Dates | Photos |
|---|---|---|---|
| 1 | Sarasota County, FL | Dec 24, 2025 | 3 |
| 2 | Garfield County, UT | Apr 28, 2026 | 3 |
| 3 | New York County, NY | May 15–17, 2026 | 5 |

Verified end-to-end (real files + live geocoding) via `node test/e2e.real.mjs`.

## Project structure

```
trip-mapper/
  index.html        layout: sidebar + map + drop zone; CDN exifr + Leaflet + markercluster
  css/styles.css
  js/exif.js        readPhoto(file) -> {name,lat,lon,ts,thumbUrl} | {skipped,reason}
  js/zip.js         expandFiles(fileList) -> File[]  (unzips .zip bundles client-side, filters to images)
  js/cluster.js     clusterTrips(photos,{moveKm,deadGapDays}) -> [trip]; haversine()
  js/geocode.js     placeName(lat,lon) -> "City, State, CC" (cached, rate-limited)
  js/sidebar.js     renderSidebar(trips, onSelect, selectedIndex)
  js/map.js         initMap(); renderMap(trip); routeVisible()  (clustered markers + polyline + fitBounds)
  js/app.js         drop -> exif -> cluster -> geocode -> state -> render
  test/             Node harnesses (logic, geocode, sidebar, real-photo + clustering e2e)
```

## Tests

```bash
node test/logic.test.mjs           # clustering + haversine (sample metadata)
node test/geocode.test.mjs         # cache hit, >=1s rate-limit, error fallback (mocked fetch)
node test/sidebar.test.mjs         # date-range formatting
node test/cluster-render.test.mjs  # route-line visibility logic (pure)
node test/e2e.real.mjs             # real 11 photos -> 3 trips + live geocode (needs network + exifr)
node test/e2e.cluster.mjs          # headless-browser: pins collapse/split on zoom (needs Puppeteer)
node test/zip-ingest.test.mjs      # .zip -> unzip -> EXIF -> {GPS,timestamp}; junk filtered (needs exifr + jszip)
node test/e2e.zip.mjs              # headless-browser: zip drop -> marker + skip reason + thumb fallback + URL revoke
```

`zip-ingest` and `e2e.zip` need `jszip` (and `e2e.zip` also Puppeteer) in the scratch dir:

```bash
mkdir -p /tmp/tm-spike && cd /tmp/tm-spike && npm install exifr jszip
```

The browser clustering e2e (`e2e.cluster.mjs`) drives the real app with headless Chromium. Install
Puppeteer once into a scratch dir (kept out of the repo, mirroring how `e2e.real.mjs` loads `exifr`):

```bash
mkdir -p /tmp/tm-puppeteer && cd /tmp/tm-puppeteer && npm install puppeteer
```

It serves the app with `python3 -m http.server`, injects a synthetic trip via a test-only
`window.__loadTripForTest` hook (inert in normal use), and asserts pins cluster when zoomed out and
split into individual markers — with the route line appearing — when zoomed in.

## Deploy (GitHub Pages)

The app is fully static, so GitHub Pages serves it as-is from the repo root. One-time setup, then
every push to `main` redeploys.

```bash
# 1. From the repo (already a git repo with a commit):
cd /home/drake/Developer/trip-mapper

# 2. Create the remote repo under your account (needs a Personal Access Token with `repo` scope).
#    Set the token in your shell first:  export GITHUB_TOKEN=ghp_xxx
curl -s -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user/repos \
  -d '{"name":"trip-mapper","description":"Map your trips from geotagged photos","private":false}'

# 3. Point origin at it and push:
git remote add origin https://github.com/keatond/trip-mapper.git
git push -u origin main   # when prompted for a password, paste the token

# 4. Enable Pages from the main branch root:
curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/keatond/trip-mapper/pages \
  -d '{"source":{"branch":"main","path":"/"}}'
```

The site goes live at **https://keatond.github.io/trip-mapper/** within a minute or two. Map tiles,
EXIF parsing, unzip, and reverse geocoding all run client-side over HTTPS, so no backend is needed.

## Deferred (not in MVP)

- Sharing / export of itineraries
- A PWA manifest for "Add to Home Screen"

> **Google Photos import:** resolved. The Photos *Picker API* strips EXIF GPS on download
> (`spike/FINDINGS.md`), so import is done via the **`.zip` drag-and-drop** flow above (web
> download of originals, unzipped client-side) — no API, no backend, ToS-clean.
