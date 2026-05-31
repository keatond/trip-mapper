# Trip Mapper — Session Handoff

> Purpose: hand this project to a fresh agent session so it can build the MVP without re-deriving
> any decisions. Read `PLAN.md` alongside this file. **Start at "Next Actions" below.**

## 1. What this project is
A static, client-side (browser-only) web app. User drags geotagged photos onto the page → the app
reads each photo's EXIF GPS + timestamp in-browser → clusters them into trips → shows a sidebar
trip list and a map (pins in time order + route line) for the selected trip. Single-user, no
backend, no accounts. Lives at `/home/drake/Developer/trip-mapper`.

## 2. Status: PLANNING COMPLETE, BUILD NOT STARTED
- ✅ De-risk spike done (data + algorithm both validated — see §4).
- ✅ Interview done, decisions locked (see §3).
- ✅ `PLAN.md` written with 8 tickets across 4 phases.
- ⬜ No application code written yet. `index.html` and `js/` do not exist.

## 3. Locked decisions (do not re-ask the user)
- **Users:** just the owner (personal tool). No sharing/accounts.
- **Stack:** static client-side, NO build step. Plain `index.html` + ES modules + CDN libs
  (`exifr`, `Leaflet` + OSM tiles). Style/spirit like the owner's gold-calculator.
- **UI:** left sidebar trip list + single right-side map (pins in time order + route line).
- **Performance:** EXIF header-only parsing + on-demand thumbnails (handle hundreds of photos).
- **Definition of Done:** dropping the 11 sample photos yields exactly **3 trips** (Sarasota /
  Utah / NYC) on a working map.
- **Deferred (NOT in MVP):** Google Photos Picker import, deployment/hosting, sharing/export.

## 4. Validated foundations (proven with working code during the spike)

### 4a. Data is viable
Google Photos *originals* (downloaded via ⋮ → Download, NOT Takeout, NOT screenshots) retain EXIF
GPS + timestamp. Confirmed on a Pixel 10 Pro XL photo.

### 4b. THE trip-clustering algorithm (validated — port this to `js/cluster.js`)
Naive "new trip on >18h gap" OVER-FRAGMENTS (a 3-day NYC trip split into 3). The correct rule:

> Sort photos ascending by timestamp. Start a NEW trip only when the next photo is either
> **>150 km** from the previous photo (haversine) **OR >5 days** later. Otherwise it joins the
> current trip.

Reference Python (already proven to give the correct 3 trips):
```python
def hav(a, b):  # km between (lat,lon) tuples
    import math
    R = 6371.0
    dlat = math.radians(b[0]-a[0]); dlon = math.radians(b[1]-a[1])
    x = math.sin(dlat/2)**2 + math.cos(math.radians(a[0]))*math.cos(math.radians(b[0]))*math.sin(dlon/2)**2
    return 2*R*math.asin(math.sqrt(x))

MOVE_KM = 150; DEAD_GAP_DAYS = 5
trips = []; cur = []
for p in sorted(photos, key=lambda x: x["ts"]):   # p = {ts, lat, lon, ...}
    if not cur:
        cur = [p]; continue
    prev = cur[-1]
    gap_d = (p["ts"] - prev["ts"]).total_seconds() / 86400
    dist  = hav((prev["lat"], prev["lon"]), (p["lat"], p["lon"]))
    if dist > MOVE_KM or gap_d > DEAD_GAP_DAYS:
        trips.append(cur); cur = [p]
    else:
        cur.append(p)
if cur: trips.append(cur)
```
Keep `moveKm`/`deadGapDays` as tunable parameters.

### 4c. Reverse geocoding works
OpenStreetMap Nominatim: `GET https://nominatim.openstreetmap.org/reverse?format=json&lat=<>&lon=<>&zoom=10`
with a `User-Agent` header. **Rate-limit to <=1 req/sec, cache by rounded coord, fall back to a
"lat, lon" string on failure.** Parse `address.city|town|county`, `address.state`, `address.country_code`.

## 5. Sample data (the test fixture — DoD depends on it)
11 photos live in `/home/drake/Pictures/PXL_*.jpg`. Extracted metadata (ground truth):

| timestamp (local) | lat | lon | file |
|---|---|---|---|
| 2025-12-24 10:26:00 | 27.13806 | -82.45287 | PXL_20251224_152600024.jpg |
| 2025-12-24 10:26:10 | 27.13806 | -82.45287 | PXL_20251224_152610914.jpg |
| 2025-12-24 10:26:15 | 27.13806 | -82.45287 | PXL_20251224_152615491.jpg |
| 2026-04-28 10:34:35 | 38.28886 | -111.22531 | PXL_20260428_163435335.jpg |
| 2026-04-28 13:57:07 | 37.86492 | -111.30092 | PXL_20260428_195707791.jpg |
| 2026-04-28 14:03:26 | 37.86536 | -111.30002 | PXL_20260428_200326186.jpg |
| 2026-05-15 22:29:33 | 40.75509 | -73.96469 | PXL_20260516_022933394.jpg |
| 2026-05-16 21:10:00 | 40.75801 | -73.98725 | PXL_20260517_011000456.jpg |
| 2026-05-16 21:15:26 | 40.75799 | -73.98743 | PXL_20260517_011526596.NIGHT.jpg |
| 2026-05-16 21:16:52 | 40.75779 | -73.98698 | PXL_20260517_011652923.jpg |
| 2026-05-17 17:30:25 | 40.64176 | -74.07746 | PXL_20260517_213025192.jpg |

**Expected clustering output (the test oracle):**
| Trip | Place | Dates | Photo count |
|---|---|---|---|
| 1 | Sarasota, FL | Dec 24, 2025 | 3 |
| 2 | Utah (Garfield County) | Apr 28, 2026 | 3 |
| 3 | New York City | May 15–17, 2026 | 5 |

## 6. Planned file structure
```
trip-mapper/
  index.html        # 1.1  layout: sidebar + map + drop zone; CDN exifr + Leaflet
  css/styles.css    # 1.1
  js/exif.js        # 1.2  readPhoto(file) -> {name,lat,lon,ts,thumbUrl} | {skipped,reason}
  js/cluster.js     # 2.1  clusterTrips(photos,{moveKm,deadGapDays}) -> [trip]; haversine()
  js/geocode.js     # 2.2  placeName(lat,lon) -> "City, State, CC" (cached, rate-limited)
  js/app.js         # 3.1  drop -> exif -> cluster -> geocode -> state -> render*
  js/sidebar.js     # 3.2  renderSidebar(trips, onSelect)
  js/map.js         # 3.3  renderMap(trip)  (Leaflet markers + polyline + fitBounds)
  README.md         # 4.2
```

## 7. Build order
Phase 1 (1.1 ∥ 1.2) → Phase 2 (2.1 ∥ 2.2) → 3.1 → (3.2 ∥ 3.3) → 4.1 (E2E validation) → 4.2 (README).
Full ticket text + acceptance criteria are in `PLAN.md`.

## 8. How to run / test during build
- Serve (ES modules need http, not file://): `cd /home/drake/Developer/trip-mapper && python3 -m http.server 8000`, open `http://localhost:8000`.
- Logic tickets can be unit-checked in Node or a console harness against the §5 metadata before wiring UI.
- Final acceptance: drag all 11 `/home/drake/Pictures/PXL_*.jpg` in → must show exactly the §5 table.

## 9. Owner working preferences (from memory)
- Present a short plan and **wait for approval before making changes.**
- **Verify each fix before moving on** — show the exact verification step and its result.
- Match subagent model to task: haiku=mechanical, sonnet=feature/design, opus=architecture.

## Next Actions (for the new session)
1. Read `PLAN.md` fully.
2. Confirm with the owner: "Build per the approved plan?" (they like an approval gate).
3. Execute Phase 1 → 4 in the build order above, QA-gating each ticket against its acceptance criteria.
4. At Phase 4.1, prove the §5 oracle (3 trips, counts 3/3/5) before declaring done.
