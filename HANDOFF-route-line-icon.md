# Trip Mapper — Enhancement Handoff: Persistent Route Line + Blue Pin Cluster Icon

> Purpose: hand this enhancement to a fresh agent session so it can execute without re-deriving
> any decisions. The app is already built and working (see `HANDOFF.md` / `PLAN.md` for the original
> build). This document covers ONLY the two changes requested below. **Start at "Next Actions".**

## 0. Status
- ✅ Codebase explored, requirements interviewed, decisions locked (see §3).
- ✅ Full plan written below (§4–§7) and **APPROVAL PENDING** from owner.
- ⬜ No enhancement code written yet.
- Owner working preference (from memory): present a short plan and **wait for approval before
  making changes**; **verify each fix before moving on** (show the exact verification + result).
  Confirm approval before touching code.

## 1. The request (verbatim)
> The line is missing that connects the locations together in the trip-mapper application. Show the
> line until the user expands the grouped photos. When the user degroups the photos and the icons
> appear update the line to the correct route through time. The grouped icon is also just a circle.
> Make it blue like the other icons and make it the same shape as the normal icon but keep the size
> like how the circle icon is now.

## 2. Why the line is currently missing (root cause)
`js/map.js` builds ONE static polyline through all photos in timestamp order, but `routeVisible()`
only returns true when **every** photo is individually de-clustered
(`visibleLeafCount === totalPhotos`). In normal (zoomed-out) use photos are clustered, so the line
is never shown. The cluster icon is an amber **circle** (`makeClusterIcon` + `.tm-cluster` CSS with
`border-radius:50%`, `background: var(--accent)` amber). The "normal" icon is the default Leaflet
blue pin.

## 3. Locked decisions (do NOT re-ask the owner)
1. **Line routing while grouped:** the line connects whatever markers are currently visible —
   cluster bubbles AND standalone pins, mixed — ordered by each group's **earliest** photo
   timestamp. The line is visible at ALL zoom levels (not just fully de-clustered).
2. **Expand/collapse behavior:** **global chronological re-sort** — recompute the whole route
   through all currently-visible markers by timestamp on every cluster change.
3. **Cluster icon:** blue **pin** (teardrop) matching the normal Leaflet marker's shape and color,
   kept at the current circle's ~40px size, **with the count badge retained** on the pin.
4. **Single-photo trip:** no line.
5. **Out of scope:** `cluster.js` trip-grouping logic, sidebar, EXIF/geocode.

## 4. Files involved
| File | Change |
|---|---|
| `js/map.js` | Dynamic route through visible parents (1.1) + blue pin cluster icon (2.1) |
| `css/styles.css` | `.tm-cluster` circle → blue pin styling (2.1) |
| `test/e2e.cluster.mjs` | Route assertions updated to new behavior + pin checks (3.1) |

## 5. Team
3-ticket static-frontend change confined to the files above. No system-wide architecture → **no
Architect**.

| Role | Model | Owns |
|---|---|---|
| Engineer | sonnet | 1.1 (line), 2.1 (icon), 3.1 (tests) |
| QA Monitor | sonnet | Gates each ticket via test runs + DOM/screenshot evidence |

## 6. Tickets

### [PHASE-1.1] Dynamic time-ordered route through visible parents
**Owner:** Engineer (sonnet) · **Parallel-safe:** no (shares `js/map.js` with 2.1)

**Description:** Replace the "show only when fully de-clustered" logic with a route that connects
every currently-visible parent (cluster bubble or standalone pin) in chronological order, rebuilt on
each cluster animation/zoom via a global re-sort.

**Acceptance Criteria:**
- [ ] Each photo marker carries its photo timestamp and lat/lon (e.g. stored on the marker) so the
      route builder can order and place points without re-deriving from the trip.
- [ ] On every `animationend`/`zoomend`, the route is recomputed: group visible markers by
      `getVisibleParent`, take each group's **earliest** child timestamp as its sort key and the
      parent's on-map position as its point, sort groups ascending by that key, and draw a single
      polyline through those points.
- [ ] The line is visible whenever the trip has >1 photo, at **all** zoom levels (clustered,
      partially clustered, fully expanded) — never hidden purely because a cluster bubble is present.
- [ ] A single-photo trip draws **no** line.
- [ ] Exactly one polyline exists at a time (old one removed before redraw — no orphan paths
      accumulating across zooms).
- [ ] The pure decision helper remains exported and unit-testable in node (no Leaflet objects inside).

**Out of scope:** Icon styling; test edits.

### [PHASE-2.1] Blue pin-shaped grouped icon with count badge
**Owner:** Engineer (sonnet) · **Parallel-safe:** no (shares `js/map.js` with 1.1; runs after it)

**Description:** Change `makeClusterIcon` + `.tm-cluster` CSS so the grouped marker is a blue pin
matching the normal Leaflet marker's teardrop shape and color, at the current ~40px size, with the
child count shown on it.

**Acceptance Criteria:**
- [ ] The grouped icon renders as a **pin/teardrop shape**, not a round bubble (no `border-radius:
      50%` circle as the icon body).
- [ ] The pin fill is **blue**, matching the default Leaflet marker color family (not amber
      `--accent`).
- [ ] The icon's rendered size stays ~40px (matching the current circle), set via `iconSize`/CSS.
- [ ] The child-photo **count is visible** on the pin (e.g. centered in the pin head) and equals
      `getChildCount()`.
- [ ] Normal individual photo markers are unchanged (default blue Leaflet pins).

**Out of scope:** Route logic; test edits.

### [PHASE-3.1] Update tests to the new route behavior + full regression
**Owner:** Engineer (sonnet) · **Parallel-safe:** no (depends on 1.1 & 2.1)

**Description:** Update `test/e2e.cluster.mjs` so its route assertions reflect the always-visible,
re-routing line, add coverage for the new behavior and the pin icon, and confirm the whole suite
passes.

**Acceptance Criteria:**
- [ ] The assertion `"route line hidden while clustered"` (expecting `routePaths === 0`, currently
      at `test/e2e.cluster.mjs:116`) is replaced with one asserting the line **is** present
      (`routePaths === 1`) while clustered.
- [ ] A check asserts the route still shows (`routePaths === 1`) when fully de-clustered
      (kept/retargeted).
- [ ] A check asserts the grouped icon is pin-shaped and blue (e.g. presence of the pin element /
      absence of the round-circle style) while clustered.
- [ ] All node logic/unit tests (`logic.test.mjs`, `cluster-render.test.mjs`, `geocode.test.mjs`,
      `sidebar.test.mjs`) pass unchanged.
- [ ] `e2e.cluster.mjs` runs to completion with `0 failed` (or, if Puppeteer/Chromium is unavailable
      in this env, the failure is reported explicitly with output — not self-certified).

**Out of scope:** Changing `cluster.js` trip-grouping logic.

## 7. QA Protocol
**Artifacts QA inspects:** node test stdout (`=== ... passed/failed ===` lines), `e2e.cluster.mjs`
Puppeteer assertions, the `js/map.js`/`css/styles.css` diffs, and a rendered screenshot/DOM probe of
(a) a clustered view showing a line + blue pin and (b) an expanded view showing the re-routed line.

**CLOSED vs NEEDS_REWORK:**
- **1.1 CLOSED** when a clustered view shows exactly one polyline whose vertices match visible-parent
  positions in timestamp order, and expanding a group re-routes it; **NEEDS_REWORK** if the line is
  missing while clustered, orphan paths accumulate, or ordering is wrong.
- **2.1 CLOSED** when the grouped icon is a blue, count-bearing pin at ~40px with no circular bubble;
  **NEEDS_REWORK** otherwise.
- **3.1 CLOSED** when the suite reports `0 failed` (or env limitation explicitly surfaced);
  **NEEDS_REWORK** on any failing assertion or self-certification without output.

**Escalation:** After **2 NEEDS_REWORK** rounds on the same ticket, escalate to Architect (opus) for
root-cause review before retrying.

## 8. Risks & Mitigations
- **Puppeteer/Chromium may not be installed** → e2e can't run locally. Run node unit tests as the
  primary gate; attempt e2e and report its output verbatim; if it can't launch, surface that
  explicitly rather than claiming a pass.
- **Cluster representative position** uses the bubble's on-map center, which shifts as the map
  pans/zooms — acceptable since the route is recomputed on every `animationend`/`zoomend`.
- **Pin shape via divIcon** must visually match the default raster marker; use an SVG/CSS pin tuned
  to Leaflet's blue rather than scaling the PNG.
- **Two markers at identical timestamps** → stable sort keeps input order; cosmetic only.

## 9. Implementation hints (current code shape)
- `js/map.js` key symbols today: `routeVisible(visibleLeafCount, totalPhotos)` (pure),
  `renderMap(trip)` (builds `routeLine` once, line 116-118), `updateRouteVisibility()` (decides
  show/hide, line 142-154), `makeClusterIcon(cluster)` (line 87-94). Cluster events wired at
  `clusterGroup.on("animationend", ...)` and `map.on("zoomend", ...)` (lines 77-78).
- Suggested approach for 1.1: store `marker._tmTs`/latlng when creating markers in `renderMap`'s
  `trip.photos.forEach`; rename `updateRouteVisibility` → `updateRoute`; inside it, group
  `tripMarkers` by `clusterGroup.getVisibleParent(m)`, compute each group's min ts + parent
  `getLatLng()`, sort by ts, remove old polyline, draw new one (only when `tripMarkers.length > 1`).
  Repurpose the pure helper to `routeVisible(totalPhotos) => totalPhotos > 1`.
- Cluster icon today: `.tm-cluster` is a 40px amber circle (`css/styles.css`, search `tm-cluster`).
- Default Leaflet marker blue is roughly `#2A81CB` / `#3388ff` — match that for the pin fill.

## 10. How to run / test
- Serve (ES modules need http): `cd /home/drake/Developer/trip-mapper && python3 -m http.server 8000`,
  open `http://localhost:8000`.
- Node unit tests: `node test/logic.test.mjs` (and the other `*.test.mjs` files).
- E2e: `node test/e2e.cluster.mjs` (needs Puppeteer/Chromium).
- Sample data: drag all 11 `/home/drake/Pictures/PXL_*.jpg` → 3 trips (Sarasota / Utah / NYC);
  the NYC trip (5 photos) is the one that exercises clustering + the route line.

## Next Actions (for the new session)
1. Read this file fully (and skim `js/map.js`, `css/styles.css`, `test/e2e.cluster.mjs`).
2. Confirm with the owner: "Build per this approved plan?" (they like an approval gate). If already
   APPROVED, proceed.
3. Execute 1.1 → 2.1 → 3.1 in order (all share files, so sequential), QA-gating each ticket against
   its acceptance criteria.
4. Verify each fix before moving on: show the test output / DOM probe / screenshot, don't
   self-certify.
5. After 3.1 passes, run the full suite and report results verbatim.
