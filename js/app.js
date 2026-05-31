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
};

const els = {
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  status: document.getElementById("status"),
  skipList: document.getElementById("skipList"),
};

function setStatus(msg) {
  if (els.status) els.status.textContent = msg;
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
  setStatus("Reading files…");
  // Expand any dropped/selected .zip bundles into their image entries first,
  // then merge with loose images.
  const files = await expandFiles(fileList);
  if (!files.length) {
    setStatus("No image files found (drop photos or a .zip of photos).");
    renderSkips([]);
    return;
  }

  // Releasing the previous batch's object URLs before we replace state.
  revokeCurrentThumbs();

  setStatus(`Reading ${files.length} photo${files.length === 1 ? "" : "s"}…`);

  const results = await Promise.all(files.map(readPhoto));
  const good = results.filter((r) => !r.skipped);
  const skipped = results.filter((r) => r.skipped);

  renderSkips(skipped);

  if (!good.length) {
    state.trips = [];
    renderSidebar([], selectTrip, 0);
    renderMap(null);
    setStatus(`⚠️ No photos with GPS found (${skipped.length} skipped — see reasons below).`);
    return;
  }

  const trips = clusterTrips(good);

  setStatus(
    `Resolving ${trips.length} trip${trips.length === 1 ? "" : "s"}…` +
    (skipped.length ? ` (${skipped.length} photo${skipped.length === 1 ? "" : "s"} skipped)` : "")
  );

  // Resolve place names sequentially-ish (placeName itself rate-limits).
  await Promise.all(
    trips.map(async (trip) => {
      trip.name = await placeName(trip.centerLat, trip.centerLon);
    })
  );

  state.trips = trips;
  state.selectedTripIndex = 0;

  const skipMsg = skipped.length ? ` · ⚠️ ${skipped.length} skipped (no GPS)` : "";
  setStatus(`✅ ${good.length} mapped in ${trips.length} trip${trips.length === 1 ? "" : "s"}${skipMsg}.`);

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

// Test-only hooks: inert unless explicitly called by the e2e harness. They let
// tests inject a synthetic trip (bypassing file-drop + geocoding) and drive zoom
// without affecting the normal user flow.
function installTestHooks() {
  if (typeof window === "undefined") return;
  window.__loadTripForTest = (photos) => {
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
  setStatus("Drop some geotagged photos to begin.");
}

main();
