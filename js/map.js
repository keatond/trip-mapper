// js/map.js
// Leaflet map rendering for a single trip.
// Exports: initMap(), renderMap(trip), routeVisible(totalPhotos), orderRoutePoints(groups)
//
// Photo markers go into a Leaflet.markerClusterGroup: nearby markers collapse
// into one pin with a count ("number in the middle") when zoomed out, and
// split back into individual markers as you zoom in. The route polyline
// connects every currently-visible parent (cluster bubble or standalone pin)
// in chronological order, and is rebuilt on every cluster change so it stays
// visible at all zoom levels for any multi-photo trip.

let map = null;
let clusterGroup = null;
let routeLine = null;
let tripMarkers = [];

/**
 * Pure decision: should the route polyline be visible at all?
 * Visible for any multi-photo trip, regardless of clustering state.
 * Kept free of Leaflet objects so it can be unit-tested in node.
 * @param {number} totalPhotos  total photo markers in the trip
 * @returns {boolean}
 */
export function routeVisible(totalPhotos) {
  return totalPhotos > 1; // single-photo trips have no line
}

/**
 * Pure ordering: given the currently-visible route groups (one per visible
 * parent — cluster bubble or standalone pin), return their points ordered by
 * each group's earliest child timestamp ascending. Stable for equal keys.
 * Kept free of Leaflet objects so it can be unit-tested in node.
 * @param {Array<{ts:number, point:[number,number]}>} groups
 * @returns {Array<[number,number]>} ordered [lat,lon] points
 */
export function orderRoutePoints(groups) {
  return groups
    .map((g, i) => ({ ...g, i }))
    .sort((a, b) => a.ts - b.ts || a.i - b.i)
    .map((g) => g.point);
}

/**
 * Create the Leaflet map once. Two free, key-less base layers with a toggle:
 *  - Streets: CARTO Voyager (Google-like road map)
 *  - Satellite: Esri World Imagery (aerial photos)
 */
/** Return the Leaflet map instance (or null before init). Used by the e2e hook. */
export function getMap() {
  return map;
}

export function initMap() {
  if (map) return map;
  map = L.map("map", { scrollWheelZoom: true }).setView([20, 0], 2);

  const streets = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      subdomains: "abcd",
      maxZoom: 20,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }
  );

  const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution:
        'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
    }
  );

  streets.addTo(map); // default base layer
  L.control.layers({ Streets: streets, Satellite: satellite }, null, { position: "topright" }).addTo(map);

  // Zoom-based clustering. spiderfyOnMaxZoom keeps markers at identical
  // coordinates clickable (they fan out on click at the deepest zoom).
  clusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    maxClusterRadius: 50,
    iconCreateFunction: makeClusterIcon,
  }).addTo(map);

  // Rebuild the route line after any cluster split/merge animation and on
  // plain zoom changes (parent positions shift as the map zoom/pans).
  clusterGroup.on("animationend", updateRoute);
  map.on("zoomend", updateRoute);

  return map;
}

/**
 * Build the cluster marker: a blue teardrop pin (matching the default Leaflet
 * marker's shape/color family) with the child count centered in its head.
 * @param {{getChildCount:Function}} cluster
 */
function makeClusterIcon(cluster) {
  const count = cluster.getChildCount();
  // SVG teardrop tuned to Leaflet's marker blue (#2A81CB) with a white outline;
  // the count sits in the round head. viewBox is taller-than-wide like a pin.
  const html = `<div class="tm-cluster"><svg viewBox="0 0 24 36" width="34" height="40" aria-hidden="true">` +
    `<path d="M12 0.5C5.6 0.5 0.5 5.6 0.5 12c0 8.6 11.5 23.5 11.5 23.5S23.5 20.6 23.5 12C23.5 5.6 18.4 0.5 12 0.5z" fill="#2A81CB" stroke="#fff" stroke-width="1.2"/>` +
    `<text x="12" y="12" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="11" font-weight="700" font-family="system-ui, sans-serif">${count}</text>` +
    `</svg></div>`;
  return L.divIcon({
    html,
    className: "tm-cluster-wrap",
    iconSize: L.point(34, 40),
    iconAnchor: L.point(17, 40), // pin tip at the cluster location
  });
}

/**
 * Render one trip: photo markers in a cluster group + a connecting polyline
 * that re-routes through whatever parents are currently visible, fit bounds to
 * the trip. Clears any prior trip's layers first.
 * @param {{photos:Array<{lat,lon,ts,name,thumbUrl}>}} trip
 */
export function renderMap(trip) {
  if (!map) initMap();
  clusterGroup.clearLayers();
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
  tripMarkers = [];
  if (!trip || !trip.photos.length) return;

  const pts = trip.photos.map((p) => [p.lat, p.lon]);

  trip.photos.forEach((p, i) => {
    const marker = L.marker([p.lat, p.lon]);
    // Stash the photo's timestamp + position so the route builder can order
    // and place points without re-deriving them from the trip.
    marker._tmTs = p.ts instanceof Date ? p.ts.getTime() : Number(p.ts) || 0;
    const time = p.ts instanceof Date ? p.ts.toLocaleString() : "";
    marker.bindPopup(buildPopup(p, i, time));
    clusterGroup.addLayer(marker);
    tripMarkers.push(marker);
  });

  const bounds = L.latLngBounds(pts);
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  updateRoute();
}

/**
 * Rebuild the route polyline through every currently-visible parent. Each
 * visible parent (cluster bubble or standalone pin) becomes one point at its
 * on-map position, keyed by its earliest child timestamp; points are sorted
 * chronologically and drawn as a single polyline. Always shown for multi-photo
 * trips; the prior line is removed first so no orphan paths accumulate.
 */
function updateRoute() {
  if (!clusterGroup) return;
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
  if (!routeVisible(tripMarkers.length)) return; // single-photo / empty

  // Group visible markers by their visible parent; track each group's earliest
  // timestamp and its on-map position.
  const groupsByParent = new Map();
  tripMarkers.forEach((m) => {
    const parent = clusterGroup.getVisibleParent(m);
    if (!parent) return; // not currently on the map (e.g. mid-animation)
    let g = groupsByParent.get(parent);
    if (!g) {
      g = { ts: m._tmTs, latlng: parent.getLatLng() };
      groupsByParent.set(parent, g);
    } else if (m._tmTs < g.ts) {
      g.ts = m._tmTs;
    }
  });

  const groups = [...groupsByParent.values()].map((g) => ({
    ts: g.ts,
    point: [g.latlng.lat, g.latlng.lng],
  }));
  let pts = orderRoutePoints(groups);

  // When every photo is absorbed into a single cluster there is only one parent
  // (one point), which can't form a line. Fall back to the photos' own
  // positions so the connecting route stays visible while grouped — until zoom
  // splits the cluster into separate icons (>=2 parents), at which point the
  // route runs through those parents.
  if (pts.length < 2) {
    pts = orderRoutePoints(
      tripMarkers.map((m) => {
        const ll = m.getLatLng();
        return { ts: m._tmTs, point: [ll.lat, ll.lng] };
      })
    );
  }
  if (pts.length < 2) return;

  routeLine = L.polyline(pts, { color: "#b45309", weight: 3, opacity: 0.8 });
  routeLine.addTo(map);
}

/**
 * Build a marker popup as a DOM node. The thumbnail <img> gets an onerror
 * handler so formats the browser can't decode (notably HEIC in Chrome) show a
 * placeholder box instead of a broken-image icon. GPS/timestamp are unaffected.
 * @param {{thumbUrl?:string, name?:string}} p
 * @param {number} i  zero-based index in the trip
 * @param {string} time  pre-formatted timestamp string
 * @returns {HTMLElement}
 */
function buildPopup(p, i, time) {
  const root = document.createElement("div");

  if (p.thumbUrl) {
    const img = document.createElement("img");
    img.className = "popup-thumb";
    img.src = p.thumbUrl;
    img.alt = p.name || "";
    img.onerror = () => {
      const ph = document.createElement("div");
      ph.className = "popup-thumb popup-thumb-fallback";
      ph.textContent = "Preview unavailable";
      img.replaceWith(ph);
    };
    root.appendChild(img);
  }

  const cap = document.createElement("div");
  cap.className = "popup-caption";
  cap.innerHTML = `#${i + 1} · ${escapeHtml(p.name || "")}<br>${escapeHtml(time)}`;
  root.appendChild(cap);

  return root;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
