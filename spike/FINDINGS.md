# Google Photos Data-Access Spike — Findings

> Status: **COMPLETE — live run done 2026-05-30.** Decision: **NO-GO** for the
> Picker-API import path (EXIF GPS is stripped from `baseUrl=d` downloads).
> Fallbacks below remain viable.

## How this was tested
- Harness: `spike/index.html` + `spike/spike.js` served by `spike/server.mjs` at
  `http://localhost:8787`, using the Photos **Picker API** + Google Identity
  Services token flow. (Setup: `SETUP.md`.) OAuth client
  `209959980454-…apps.googleusercontent.com`, account `keatonofthedrakes@gmail.com`
  added as a Test user.
- Live run: signed in, picked real photos (incl. the May 2026 NYC trip set),
  fetched items, downloaded each original via `baseUrl=d`, parsed EXIF in-browser.
- Post-download EXIF path independently proven by `spike/test/exif-bytes.test.mjs`
  against a local sample photo (no OAuth needed).

---

## Automated pre-check (no OAuth) — bytes → EXIF → {GPS, timestamp}
This proves that **if** we can get original bytes with EXIF intact, we extract what we need.

- Command: `node spike/test/exif-bytes.test.mjs`
- **Result:** ☑ PASS (re-verified 2026-05-30 on the dev machine, sample
  `PXL_20251224_152600024.jpg`)
- Evidence:
  ```
  latitude:  27.13806139   (expected 27.13806, within 0.0005)  -> PASS
  longitude: -82.45287342  (expected -82.45287, within 0.0005) -> PASS
  timestamp: 2025-12-24T15:26:00.000Z (valid Date)             -> PASS
  ```
  So the extraction is solid. The make-or-break was always whether Google's
  Picker download (`baseUrl=d`) keeps EXIF GPS — answered NO below.

---

## Q1 — Does the Picker API `mediaMetadata` include GPS?
*(Expected: NO — Google omits location from photo metadata.)*

- **Result:** ☑ GPS absent
- Evidence: every picked item's `mediaFile.mediaFileMetadata` carried only
  `width`, `height`, `cameraMake`, `cameraModel`, and `photoMetadata`
  (`focalLength`, `apertureFNumber`, `isoEquivalent`, `exposureTime`). **No
  latitude/longitude/location field on any item** — confirmed across the 15-item
  capture run and a separate ~200-item metadata dump. Sample item:
  ```json
  "mediaFileMetadata": {
    "width": 3072, "height": 4080,
    "cameraMake": "Google", "cameraModel": "Pixel 6 Pro",
    "photoMetadata": { "focalLength": 6.81, "apertureFNumber": 1.85,
                       "isoEquivalent": 41, "exposureTime": "0.000468s" }
  }
  ```

## Q2 — Does `baseUrl=d` preserve EXIF GPS + timestamp in the original bytes?
*(The make-or-break question. If Google strips EXIF location from the download,
the Picker path is not viable for mapping.)*

- **Result:** ☑ time only — **GPS stripped, timestamp preserved**
- Evidence — 15 of 15 picked photos returned `GPS=MISSING` with a valid
  `DateTimeOriginal`. Verbatim from the captured FINDINGS (2026-05-31T02:21:11Z):
  ```
  1. PXL_20260516_162750869.jpg  Q2: time only (GPS stripped)
       GPS=MISSING · time=2026-05-16T16:27:50.000Z, via direct
  2. PXL_20260517_011000456.jpg  Q2: time only (GPS stripped)
       GPS=MISSING · time=2026-05-17T01:10:00.000Z, via direct
  … (all 15 items identical pattern: GPS=MISSING, time present) …
  15. PXL_20260517_013359490.jpg Q2: time only (GPS stripped)
       GPS=MISSING · time=2026-05-17T01:33:59.000Z, via direct
  ```
  Note: these are the same NYC photos whose **manually-downloaded** originals
  retain GPS (proven earlier in this project). So Google strips EXIF GPS
  specifically from the **Picker `baseUrl=d`** download path.

## Q3 — Browser-direct download vs proxy required (CORS)?
*(Determines whether the eventual app needs a server component.)*

- **Result:** ☑ direct browser fetch works — **proxy NOT required**
- Evidence — every item reported `direct=HTTP 200 (ok)`; the proxy fallback was
  never exercised (`proxy=n/a`). This contradicts the original assumption that a
  Picker `baseUrl=d` browser fetch would be CORS-blocked. (Moot given Q2, but
  recorded: a future Picker-based feature would not need the proxy for downloads.)

---

## GO / NO-GO

**Decision:** ☑ **NO-GO** (Picker + `baseUrl=d` strips EXIF GPS → cannot map)

The Picker API can give us originals and **timestamps**, but **not GPS**, so it
cannot drive trip-mapping. The blocker is Q2; Q1 (metadata) and Q3 (CORS) are not
the obstacle.

### Fallbacks (so this isn't a dead end)
- **Manual download** of originals (Google Photos ⋮ → Download) **retains EXIF GPS**
  — already proven in this project, and is exactly what the current drag-drop flow
  consumes. **This stays the supported path.**
- **Google Takeout** export includes a sidecar `*.json` with `geoData` (lat/lon)
  even when EXIF is stripped — viable for a future **batch importer** (not live),
  reading the sidecar instead of EXIF.
- Either fallback produces the same photo record the app already uses
  (`{ name, lat, lon, ts, thumbUrl }`), so `clusterTrips` / `map.js` / `sidebar.js`
  work unchanged.

### Notes / surprises
- Picker download keeps **timestamp** but strips **GPS** — a partial-metadata
  behavior, not a total wipe.
- **Direct browser fetch of `baseUrl=d` succeeded (HTTP 200)** — no CORS proxy
  needed. The `server.mjs` proxy is therefore not required for a Picker download.
- A Picker session can surface the whole library (the ~200-item dump), and items
  include `VIDEO` types (`video/mp4`) alongside `PHOTO`.

---

## URL-avenue close-out — A & C under the documented-only bar (2026-05-30)

Decision bar: a public tool may use **only documented, sanctioned** Google
parameters/endpoints. Anything that circumvents a privacy control or scrapes an
undocumented surface is disqualifying. Against that bar:

- **Avenue A — `baseUrl` parameter tricks: NO-GO.** There is no documented Google
  Photos parameter that returns the GPS the Picker intentionally strips; `=d`
  yields originals with GPS already removed (proven in Q2 above), and no other
  documented param re-adds it.
- **Avenue C — share-link / internal endpoint: NO-GO.** Recovering the stripped
  GPS this way requires scraping or hitting an undocumented endpoint, which is
  ToS-disqualifying for a public tool (and brittle).

**Superseding path: mobile self-select.** The compliant answer is to let the user
pick photos directly from their own device library via a client-side
`<input type="file">`, where full EXIF GPS is present (Google only strips GPS on
the *API download* path, never on the user's own on-device originals). This is the
path the `mobile-picker.html` probe was built to test. Avenues A and C are closed
and should not be re-litigated.

---

## Mobile self-select probe — NO-GO for this user's workflow (2026-05-30)

Built `spike/mobile-picker.html` (single `<input type="file" accept="image/*"
multiple>`, in-browser exifr `{gps:true}` per file) and served it on the LAN. The
parse path was independently verified working (exifr 7.1.3 extracts
`27.138064, -82.452872` + a valid `DateTimeOriginal` from the Sarasota sample).

- **Verdict: NO-GO — not because GPS is stripped, but because the photos aren't
  on the device.** The user's library lives in Google Photos' cloud; the camera
  roll has no local originals for the device picker to read. A client-side file
  picker can only read on-device files, so it can't serve this workflow.
- The earlier risk (iOS Safari transcoding HEIC→JPEG / stripping location) was
  never reached — the picker had nothing local to offer in the first place.

### Superseding path (current): ZIP drag-and-drop
Google Photos web lets you multi-select and **Download** → a `.zip` of the
**originals**, which retain EXIF GPS (manual single-download retention already
proven in this project; the bulk zip is the same originals). So the app now
accepts a dropped/selected `.zip`, unzips it **client-side** (JSZip), and feeds
each image entry into the existing `readPhoto → clusterTrips → map` pipeline.
This keeps the tool a desktop drag-and-drop static page with no backend.
