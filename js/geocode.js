// js/geocode.js
// Reverse geocoding via OpenStreetMap Nominatim.
//
// Exports: placeName(lat, lon) -> "City, State, CC"
//   - caches by rounded coordinate (no repeat network calls)
//   - rate-limits to <= 1 request/second (Nominatim usage policy)
//   - falls back to a "lat, lon" string on any failure
//
// Also exports _stats for tests (call counter) and _resetCache.

const ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const MIN_INTERVAL_MS = 1000; // <= 1 req/sec
const COORD_PRECISION = 2;    // ~1.1 km cache buckets

const cache = new Map();
let lastRequestAt = 0;
let pending = Promise.resolve(); // serializes requests for rate-limiting

// Observable counter so tests can assert cache hits / request spacing.
export const _stats = { requests: 0, requestTimes: [] };

function cacheKey(lat, lon) {
  return `${lat.toFixed(COORD_PRECISION)},${lon.toFixed(COORD_PRECISION)}`;
}

function fallbackLabel(lat, lon) {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

function formatAddress(addr) {
  if (!addr) return null;
  const city = addr.city || addr.town || addr.village || addr.county || null;
  const state = addr.state || null;
  const cc = addr.country_code ? addr.country_code.toUpperCase() : null;
  const parts = [city, state, cc].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

async function fetchReverse(lat, lon) {
  const url =
    `${ENDPOINT}?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`;
  const res = await fetch(url, {
    headers: {
      // Nominatim policy requires an identifying User-Agent.
      "User-Agent": "trip-mapper/1.0 (personal photo trip mapper)",
      "Accept": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const json = await res.json();
  return formatAddress(json.address);
}

/**
 * Resolve a short place label for a coordinate.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<string>}
 */
export async function placeName(lat, lon) {
  const key = cacheKey(lat, lon);
  if (cache.has(key)) return cache.get(key);

  // Chain onto `pending` so concurrent callers are spaced >= MIN_INTERVAL_MS.
  const run = pending.then(async () => {
    // Re-check cache: an earlier queued call for the same bucket may have filled it.
    if (cache.has(key)) return cache.get(key);

    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    let label;
    try {
      lastRequestAt = Date.now();
      _stats.requests += 1;
      _stats.requestTimes.push(lastRequestAt);
      label = (await fetchReverse(lat, lon)) || fallbackLabel(lat, lon);
    } catch (err) {
      label = fallbackLabel(lat, lon);
    }
    cache.set(key, label);
    return label;
  });

  // Keep the queue alive even if this call rejects (it shouldn't — we catch above).
  pending = run.catch(() => {});
  return run;
}

export function _resetCache() {
  cache.clear();
  lastRequestAt = 0;
  pending = Promise.resolve();
  _stats.requests = 0;
  _stats.requestTimes = [];
}
