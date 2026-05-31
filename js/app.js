// js/app.js — pipeline orchestration + app state.
// drop -> readPhoto each -> drop skipped -> clusterTrips -> placeName per trip
// -> hold state -> renderSidebar + renderMap.

import { readPhoto } from "./exif.js";
import { expandFiles } from "./zip.js";
import { clusterTrips } from "./cluster.js";
import { placeName } from "./geocode.js";
import { renderSidebar } from "./sidebar.js";
import { initMap, renderMap, getMap } from "./map.js";

const state = {
  trips: [],
  selectedTripIndex: 0,
  isDemo: false,
};

// Monotonic token so an in-flight demo load can be superseded by a real import
// or a test injection without racing it onto the screen.
let demoToken = 0;

const els = {
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  status: document.getElementById("status"),
  skipList: document.getElementById("skipList"),
  demoBanner: document.getElementById("demoBanner"),
  emptyState: document.getElementById("emptyState"),
};

/**
 * Render the status line with a state-specific icon.
 * @param {string} msg
 * @param {"info"|"loading"|"success"|"error"} [kind]
 */
function setStatus(msg, kind = "info") {
  const el = els.status;
  if (!el) return;
  el.className = `status status--${kind}`;
  el.innerHTML = `<span class="status__icon" aria-hidden="true"></span><span class="status__text"></span>`;
  el.querySelector(".status__text").textContent = msg;
}

/**
 * Revoke every object URL held by the current trips' photos. Called before a new
 * batch replaces state so blob: URLs from dropped/removed photos don't leak.
 */
function revokeCurrentThumbs() {
  for (const trip of state.trips) {
    for (const p of trip.photos) {
      if (p.thumbUrl) {
        URL.revokeObjectURL(p.thumbUrl);
        p.thumbUrl = null;
      }
    }
  }
}

/**
 * Show a visible, per-file reason for each skipped photo (no silent drops).
 * @param {Array<{name:string, reason:string}>} skipped
 */
function renderSkips(skipped) {
  const list = els.skipList;
  if (!list) return;
  list.innerHTML = "";
  if (!skipped.length) {
    list.hidden = true;
    return;
  }
  list.hidden = false;
  const head = document.createElement("li");
  head.className = "skip-head";
  head.textContent = `${skipped.length} photo${skipped.length === 1 ? "" : "s"} skipped:`;
  list.appendChild(head);
  for (const s of skipped) {
    const li = document.createElement("li");
    li.className = "skip-item";
    const reason = /no gps/i.test(s.reason)
      ? `${s.reason} — no location saved (airplane mode, location off, or a transcoded copy)`
      : s.reason;
    li.textContent = `${s.name}: ${reason}`;
    list.appendChild(li);
  }
}

function selectTrip(i) {
  state.selectedTripIndex = i;
  renderSidebar(state.trips, selectTrip, i);
  renderMap(state.trips[i]);
}

async function handleFiles(fileList) {
  cancelDemo(); // a real import replaces the sample trip + dismisses the empty state
  setStatus("Reading files…", "loading");
  // Expand any dropped/selected .zip bundles into their image entries first,
  // then merge with loose images.
  const files = await expandFiles(fileList);
  if (!files.length) {
    setStatus("No image files found (drop photos or a .zip of photos).", "error");
    renderSkips([]);
    return;
  }

  // Releasing the previous batch's object URLs before we replace state.
  revokeCurrentThumbs();

  setStatus(`Reading ${files.length} photo${files.length === 1 ? "" : "s"}…`, "loading");

  const results = await Promise.all(files.map(readPhoto));
  const good = results.filter((r) => !r.skipped);
  const skipped = results.filter((r) => r.skipped);

  renderSkips(skipped);

  if (!good.length) {
    state.trips = [];
    renderSidebar([], selectTrip, 0);
    renderMap(null);
    setStatus(`No photos with GPS found (${skipped.length} skipped — see reasons below).`, "error");
    return;
  }

  const trips = clusterTrips(good);

  setStatus(
    `Resolving ${trips.length} trip${trips.length === 1 ? "" : "s"}…` +
    (skipped.length ? ` (${skipped.length} photo${skipped.length === 1 ? "" : "s"} skipped)` : ""),
    "loading"
  );

  // Resolve place names sequentially-ish (placeName itself rate-limits).
  await Promise.all(
    trips.map(async (trip) => {
      trip.name = await placeName(trip.centerLat, trip.centerLon);
    })
  );

  state.trips = trips;
  state.selectedTripIndex = 0;

  const skipMsg = skipped.length ? ` · ${skipped.length} skipped (no GPS)` : "";
  setStatus(`${good.length} mapped in ${trips.length} trip${trips.length === 1 ? "" : "s"}${skipMsg}.`, "success");

  renderSidebar(trips, selectTrip, 0);
  renderMap(trips[0]);
}

function wireDropzone() {
  const dz = els.dropzone;
  if (!dz) return;

  dz.addEventListener("click", () => els.fileInput?.click());
  els.fileInput?.addEventListener("change", (e) => handleFiles(e.target.files));

  ["dragenter", "dragover"].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
    })
  );
  dz.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    if (dt?.files?.length) handleFiles(dt.files);
  });
}

/* ---- Empty state + demo trip ------------------------------------- */

function showEmptyState() {
  const el = els.emptyState;
  if (!el) return;
  el.innerHTML =
    `<div class="empty-card">` +
      `<span class="empty-card__icon" aria-hidden="true">` +
        `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" ` +
        `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M9 20l-5.5 2.5V7L9 4.5m0 15.5l6-3m-6 3V4.5m6 12.5l5.5 2.5V4.5L15 7m0 9.5V7m0 0L9 4.5"/>` +
        `<circle cx="17.5" cy="9" r="3.2"/></svg></span>` +
      `<h2 class="empty-card__title">Your trips, mapped.</h2>` +
      `<p class="empty-card__text">Drop geotagged photos &mdash; or a Google Photos download <code>.zip</code> &mdash; ` +
        `onto the panel, and each trip appears here with its route.</p>` +
      `<button type="button" class="empty-card__btn" id="emptyDemoBtn">Show a sample trip</button>` +
    `</div>`;
  el.hidden = false;
  el.querySelector("#emptyDemoBtn")?.addEventListener("click", () => loadDemo());
}

function hideEmptyState() {
  if (els.emptyState) { els.emptyState.hidden = true; els.emptyState.innerHTML = ""; }
}

function showDemoBanner() {
  const el = els.demoBanner;
  if (!el) return;
  el.innerHTML =
    `<span class="demo-banner__label"><span class="demo-banner__dot" aria-hidden="true"></span>Sample trip</span>` +
    `<button type="button" class="demo-banner__clear" id="clearDemoBtn">Clear</button>`;
  el.hidden = false;
  el.querySelector("#clearDemoBtn")?.addEventListener("click", clearDemo);
}

function hideDemoBanner() {
  if (els.demoBanner) { els.demoBanner.hidden = true; els.demoBanner.innerHTML = ""; }
}

/** Dismiss the demo (and supersede any in-flight demo load) without touching trips. */
function cancelDemo() {
  demoToken++;
  state.isDemo = false;
  hideDemoBanner();
  hideEmptyState();
}

/** Remove the demo and return to the rich empty state, ready for real photos. */
function clearDemo() {
  cancelDemo();
  revokeCurrentThumbs();
  state.trips = [];
  state.selectedTripIndex = 0;
  renderSidebar([], selectTrip, 0);
  renderMap(null);
  renderSkips([]);
  showEmptyState();
  setStatus("Drop some geotagged photos to begin.", "info");
}

/**
 * Load the bundled demo trip (demo/) through the real EXIF -> cluster -> map
 * pipeline so a first-time visitor sees a populated map instantly. Place names
 * come from the manifest (no geocoding) so it works offline and on first paint.
 * Guarded by demoToken so a real import / test injection always wins.
 */
async function loadDemo() {
  const myToken = ++demoToken;
  hideEmptyState();
  setStatus("Loading a sample trip…", "loading");
  try {
    const manifest = await (await fetch("demo/manifest.json")).json();
    const files = [];
    for (const { file } of manifest.files) {
      const r = await fetch("demo/" + file);
      if (!r.ok) continue;
      const blob = await r.blob();
      files.push(new File([blob], file, { type: blob.type || "image/jpeg" }));
    }
    if (myToken !== demoToken) return; // superseded while fetching

    const results = await Promise.all(files.map(readPhoto));
    const good = results.filter((r) => !r.skipped);
    if (myToken !== demoToken) return;
    if (!good.length) throw new Error("demo photos carried no GPS");

    const trips = clusterTrips(good);
    trips.forEach((t) => { t.name = manifest.trip || "Sample trip"; });

    revokeCurrentThumbs();
    state.trips = trips;
    state.selectedTripIndex = 0;
    state.isDemo = true;
    renderSkips([]);
    renderSidebar(trips, selectTrip, 0);
    renderMap(trips[0]);
    showDemoBanner();
    setStatus(`Showing a sample trip · ${good.length} photos. Drop your own to replace it.`, "info");
  } catch (_e) {
    // The demo is a nicety — on any failure fall back to the rich empty state.
    if (myToken === demoToken) {
      showEmptyState();
      setStatus("Drop some geotagged photos to begin.", "info");
    }
  }
}

// Test-only hooks: inert unless explicitly called by the e2e harness. They let
// tests inject a synthetic trip (bypassing file-drop + geocoding) and drive zoom
// without affecting the normal user flow.
function installTestHooks() {
  if (typeof window === "undefined") return;
  window.__loadTripForTest = (photos) => {
    cancelDemo(); // injected trips always supersede the demo
    const good = photos.map((p) => ({ ...p, ts: new Date(p.ts) }));
    const trips = clusterTrips(good);
    trips.forEach((t, i) => { t.name = t.name || `Test trip ${i + 1}`; });
    state.trips = trips;
    state.selectedTripIndex = 0;
    renderSidebar(trips, selectTrip, 0);
    renderMap(trips[0]);
    return trips.length;
  };
  window.__setZoomForTest = (z) => getMap()?.setZoom(z);
}

function main() {
  initMap();
  wireDropzone();
  installTestHooks();
  // Greet first-time visitors with a populated sample trip instead of a blank map.
  loadDemo();
}

main();
