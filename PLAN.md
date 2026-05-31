# Project Plan: Trip Mapper

## Summary
A static, client-side web app that turns a pile of geotagged photos into a map of your trips.
The user drags photos onto the page; the app reads each photo's EXIF GPS + timestamp **in the
browser**, automatically clusters them into distinct trips (location-first algorithm), and shows
each trip as a sidebar entry with a map of its photos (pins in time order + a route line).
Single-user, no backend, no accounts. MVP is "done" when the 11 sample photos resolve to exactly
3 trips (Sarasota FL / Utah / NYC) on a working map.

## Validated Foundations (from de-risk spike — do NOT re-litigate)
- **Google Photos originals retain EXIF GPS + timestamp.** Confirmed on a Pixel 10 Pro XL photo
  (Times Square: 40.757794, -73.986975, 2026-05-16 21:16:52, UTC-04:00).
- **Trip clustering works with a location-first rule.** Naive "split on >18h gap" over-fragments
  (a 3-day NYC trip became 3 trips). The correct rule, validated on all 11 photos:
  > Sort photos by timestamp. Start a NEW trip only when the next photo is either **>150 km**
  > from the previous photo OR **>5 days** later. Otherwise it joins the current trip.
  This produced the correct 3 trips. The reference Python implementation is in `HANDOFF.md`.
- **Reverse geocoding works** via OpenStreetMap Nominatim (`/reverse?format=json&lat=&lon=`).
  Must be rate-limited to <=1 req/sec and results cached.

## Tech Decisions
- **No build step.** Plain `index.html` + ES modules + CDN libraries (matches user's gold-calculator style).
- **Libraries (CDN):** `exifr` (EXIF parsing, header-only mode), `Leaflet` + OpenStreetMap tiles (map).
- **Geocoding:** Nominatim REST (rate-limited, cached in-memory).
- **Performance:** Parse EXIF headers only; generate thumbnails on demand. Target: hundreds of photos.
- **Runs by:** opening `index.html` (or `python3 -m http.server` in the folder for module/CORS safety).

## Team
| Role | Model | Owns |
|------|-------|------|
| Architect | opus | Algorithm correctness review, cross-module data-shape decisions, any NEEDS_REWORK escalation |
| Engineer | sonnet | Feature tickets: EXIF, clustering, geocoding, map, sidebar, orchestration |
| Mechanic | haiku | Scaffold/boilerplate (1.1 HTML/CSS shell) |
| QA Monitor | sonnet | Gates every ticket against acceptance criteria |

Small project (~8 tickets). One Engineer can carry the core; Mechanic handles scaffold.

## Phases & Tickets

### [PHASE-1.1] Project scaffold + layout shell
**Owner:** Mechanic (haiku)
**Parallel-safe:** yes
**Description:** Create `index.html` with a two-pane layout (left sidebar for trip list, right pane
for the map) and a drop zone. Add `css/styles.css`. Pull in Leaflet + exifr via CDN `<script>`/CSS.
**Acceptance Criteria:**
- [ ] `index.html` exists and opens without console errors.
- [ ] Page shows a visible left sidebar pane and a right map pane (empty Leaflet map renders with OSM tiles).
- [ ] A labeled drag-and-drop zone is visible.
- [ ] Leaflet and exifr are loaded (verifiable: `window.L` and `window.exifr` are defined in console).
**Out of scope:** Any photo processing, clustering, or pins.

### [PHASE-1.2] EXIF extraction module
**Owner:** Engineer (sonnet)
**Parallel-safe:** yes (own file `js/exif.js`)
**Description:** `js/exif.js` exporting `async readPhoto(file) -> {name, lat, lon, ts, thumbUrl}`.
Uses exifr header-only parsing for GPS + DateTimeOriginal; converts to decimal lat/lon and a JS Date.
Photos lacking GPS or timestamp are returned flagged (e.g. `{ skipped:true, reason }`), not thrown.
**Acceptance Criteria:**
- [ ] `readPhoto()` on a known geotagged JPEG returns lat/lon within 0.0005 of the EXIF value and a valid Date.
- [ ] Decimal conversion handles N/S/E/W refs (negative for S and W).
- [ ] A photo with no GPS returns `{skipped:true}` rather than throwing.
- [ ] `thumbUrl` is a usable object URL or data URL for an `<img>`.
**Out of scope:** Clustering, geocoding, rendering.

### [PHASE-2.1] Trip clustering module
**Owner:** Engineer (sonnet) — algorithm reviewed by Architect (opus)
**Parallel-safe:** yes (own file `js/cluster.js`)
**Description:** `js/cluster.js` exporting `clusterTrips(photos, {moveKm=150, deadGapDays=5}) -> [trip]`.
Port the validated location-first algorithm. Each trip: `{photos[], start, end, centerLat, centerLon}`.
Includes a `haversine(a,b)` helper.
**Acceptance Criteria:**
- [ ] Given the 11 sample photos' metadata, returns exactly **3 trips**.
- [ ] Trip boundaries match: Trip1=Dec 24 2025 (3 photos), Trip2=Apr 28 2026 (3 photos), Trip3=May 15-17 2026 (5 photos).
- [ ] Photos within a trip are sorted ascending by timestamp.
- [ ] `haversine` returns ~8.5 km (±0.5) for the two NYC May-16 vs May-17 points (40.7579,-73.9872 to 40.6418,-74.0775 is ~14.8 km — assert against computed truth, not a guess).
**Out of scope:** Geocoding place names, map rendering.

### [PHASE-2.2] Reverse-geocoding module
**Owner:** Engineer (sonnet)
**Parallel-safe:** yes (own file `js/geocode.js`)
**Description:** `js/geocode.js` exporting `async placeName(lat, lon) -> "City, State, CC"`.
Calls Nominatim reverse endpoint, parses address into a short label, caches by rounded coord,
and rate-limits to <=1 req/sec. Falls back to raw "lat, lon" on failure.
**Acceptance Criteria:**
- [ ] `placeName(40.7579,-73.9872)` returns a string containing "New York".
- [ ] Second call with same coords does not issue a second network request (cache hit — verifiable via a call counter).
- [ ] On network error, returns a coord-string fallback instead of throwing.
- [ ] Requests are spaced >=1000 ms apart (rate-limit verifiable).
**Out of scope:** UI, clustering.

### [PHASE-3.1] Pipeline orchestration + state
**Owner:** Engineer (sonnet)
**Parallel-safe:** no (creates `js/app.js`, the wiring hub that 3.2/3.3 import into)
**Description:** `js/app.js`: handle drop zone events -> `readPhoto` each file -> drop skipped ->
`clusterTrips` -> attach `placeName` to each trip -> hold app state (trips, selectedTripIndex) ->
call `renderSidebar(trips)` and `renderMap(selectedTrip)`.
**Acceptance Criteria:**
- [ ] Dropping the 11 sample files populates state with 3 trips, each with a resolved place name.
- [ ] Skipped (no-GPS) photos are excluded and surfaced in a small count message.
- [ ] Selecting a trip updates `selectedTripIndex` and triggers a map re-render.
- [ ] No unhandled promise rejections in console during a full load.
**Out of scope:** The internal drawing logic of sidebar/map (those are 3.2/3.3).

### [PHASE-3.2] Sidebar trip list
**Owner:** Engineer (sonnet)
**Parallel-safe:** yes (own file `js/sidebar.js`, imported by app.js)
**Description:** `js/sidebar.js` exporting `renderSidebar(trips, onSelect)`. Renders one row per
trip: place name, date range, photo count. Highlights the selected row.
**Acceptance Criteria:**
- [ ] Renders exactly one row per trip with place name + date range + "(N photos)".
- [ ] Clicking a row invokes `onSelect(index)`.
- [ ] Selected row has a distinct visual state (class applied).
- [ ] Date range shows single date when start==end, else "Mon DD–Mon DD, YYYY".
**Out of scope:** Map, EXIF.

### [PHASE-3.3] Map rendering
**Owner:** Engineer (sonnet)
**Parallel-safe:** yes (own file `js/map.js`, imported by app.js)
**Description:** `js/map.js` exporting `renderMap(trip)`. Clears prior layers, drops a marker per
photo at its GPS point, draws a polyline connecting them in timestamp order, fits map bounds to
the trip. Marker click shows a popup with the photo thumbnail.
**Acceptance Criteria:**
- [ ] Selecting the NYC trip shows 5 markers and a connecting polyline.
- [ ] Map auto-fits bounds so all of the selected trip's markers are visible.
- [ ] Switching trips removes the previous trip's markers/line (no leftover layers).
- [ ] Clicking a marker opens a popup containing the photo thumbnail.
**Out of scope:** Sidebar, clustering.

### [PHASE-4.1] End-to-end validation + edge handling
**Owner:** Engineer (sonnet), gated by QA (sonnet)
**Parallel-safe:** no (depends on all prior)
**Description:** Run the full app against the 11 sample photos and confirm the DoD. Handle empties:
no files, files with no GPS, single-photo trips. Add a brief "no geotagged photos found" empty state.
**Acceptance Criteria:**
- [ ] Loading all 11 sample photos yields exactly 3 trips named Sarasota/Utah/New York with correct counts (3/3/5).
- [ ] Each trip selects and renders on the map without errors.
- [ ] Dropping a non-geotagged image shows the empty/skip message, no crash.
- [ ] Single-photo trip (e.g. if a sample is isolated) renders 1 marker, no polyline error.
**Out of scope:** Google Photos import, deployment.

### [PHASE-4.2] README + run instructions
**Owner:** Mechanic (haiku)
**Parallel-safe:** yes
**Description:** `README.md`: what it is, how to run (`python3 -m http.server` then open localhost),
how the trip algorithm works, the validated sample result, and the deferred-features list.
**Acceptance Criteria:**
- [ ] README states the exact run command and URL.
- [ ] README documents the clustering rule (150 km / 5 days) and the 3-trip expected sample result.
- [ ] README lists deferred features (Google Photos Picker, hosting, sharing).
**Out of scope:** Code changes.

## QA Protocol
**Artifacts QA inspects per ticket:** the code file(s) for the ticket, plus observable output —
for logic tickets (1.2, 2.1, 2.2) a small console/Node harness exercising the exported function
against the sample metadata; for UI tickets (1.1, 3.x, 4.1) the rendered page in a browser
(DOM state, marker count, console clean of errors).

**CLOSED vs NEEDS_REWORK:** A ticket is CLOSED only when every acceptance criterion is observably
PASS with evidence (printed values, marker counts, screenshots). Any criterion unverifiable or
failing => NEEDS_REWORK with the specific failing criterion quoted.

**Escalation:** After **2 NEEDS_REWORK** rounds on the same ticket, escalate to Architect (opus)
for root-cause review before a 3rd attempt. Most likely escalation point: 2.1 (algorithm) if trip
counts drift, or 3.3 (Leaflet layer lifecycle) if old layers persist.

**Rework prompt rule:** Any fix handoff MUST include the failing criterion verbatim, the QA note,
and the file path(s) — never a cold "fix ticket N.M".

## Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| ES modules blocked by `file://` CORS | Run via `python3 -m http.server`; document in README. |
| Nominatim rate-limit/usage policy | Cache aggressively, <=1 req/sec, coord-string fallback. |
| Google Photos Picker may strip GPS (future phase) | Out of scope for MVP; separate spike before committing. |
| Algorithm over/under-splits on other photo sets | Thresholds are parameters (moveKm/deadGapDays); validated on real data. |
| Large batches exhaust memory | Header-only EXIF + on-demand thumbnails. |

## Build Order
Phase 1 (1.1 ∥ 1.2) → Phase 2 (2.1 ∥ 2.2) → 3.1 → (3.2 ∥ 3.3) → 4.1 → 4.2.
