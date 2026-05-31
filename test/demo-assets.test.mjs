// Verifies the committed demo-trip assets (demo/) actually carry readable EXIF
// GPS + timestamps and cluster into one coherent multi-stop trip with a route.
// Reuses exifr (the app's EXIF reader) and the real clusterTrips.
//
// Setup:  mkdir -p /tmp/tm-spike && cd /tmp/tm-spike && npm install exifr
// Run:    node test/demo-assets.test.mjs
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { clusterTrips } from "../js/cluster.js";

const require = createRequire(import.meta.url);
function dep(name) {
  for (const c of [`/tmp/tm-spike/node_modules/${name}`, `/tmp/tm-exifr/node_modules/${name}`, name]) {
    try { return require(c); } catch { /* next */ }
  }
  console.error("Missing exifr. Install:\n  mkdir -p /tmp/tm-spike && cd /tmp/tm-spike && npm install exifr");
  process.exit(2);
}
const exifr = dep("exifr");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO = path.join(ROOT, "demo");

let pass = 0, fail = 0;
function check(label, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}${detail ? "  -> " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? "  -> " + detail : ""}`); }
}

console.log("=== demo assets: EXIF GPS + timestamp + clustering ===");

const manifest = JSON.parse(await readFile(path.join(DEMO, "manifest.json"), "utf8"));
check("manifest lists >= 2 files", manifest.files.length >= 2, `${manifest.files.length} files`);

const photos = [];
for (const { file } of manifest.files) {
  const buf = await readFile(path.join(DEMO, file));
  const data = await exifr.parse(buf, { gps: true });
  const lat = data?.latitude, lon = data?.longitude;
  const ts = data?.DateTimeOriginal;
  check(`${file}: GPS lat/lon parse`, Number.isFinite(lat) && Number.isFinite(lon), `${lat?.toFixed(4)}, ${lon?.toFixed(4)}`);
  check(`${file}: timestamp parse`, ts instanceof Date && !Number.isNaN(ts.getTime()), ts instanceof Date ? ts.toISOString() : String(ts));
  if (Number.isFinite(lat) && Number.isFinite(lon) && ts instanceof Date) {
    photos.push({ name: file, lat, lon, ts });
  }
}

// >= 2 distinct geographic stops (distinct rounded coordinates).
const distinct = new Set(photos.map((p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`));
check("has >= 2 distinct stops", distinct.size >= 2, `${distinct.size} distinct`);

// Chronological order is recoverable and clusters into ONE coherent trip.
const trips = clusterTrips(photos);
check("clusters into exactly 1 trip", trips.length === 1, `${trips.length} trip(s)`);
check("the trip holds every photo", trips[0]?.photos.length === photos.length, `${trips[0]?.photos.length}/${photos.length}`);
check("trip spans >1 photo (route is drawable)", (trips[0]?.photos.length ?? 0) > 1, `${trips[0]?.photos.length} photos`);
const sortedTs = photos.map((p) => p.ts.getTime());
check("timestamps are strictly increasing", sortedTs.every((t, i) => i === 0 || t > sortedTs[i - 1]), "ordered");

console.log(`\n=== demo-assets: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
