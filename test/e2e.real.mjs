// True end-to-end test against the REAL 11 sample photos.
// Reads actual EXIF with exifr (node build), clusters, and live-geocodes each trip.
// Run with network: node test/e2e.real.mjs
import { readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import exifr from "/tmp/tm-exifr/node_modules/exifr/dist/full.esm.mjs";
import { clusterTrips } from "../js/cluster.js";

const PIC_DIR = "/home/drake/Pictures";

let pass = 0, fail = 0;
const check = (label, cond, extra = "") =>
  cond ? (pass++, console.log(`  PASS  ${label}`))
       : (fail++, console.log(`  FAIL  ${label}  ${extra}`));

// --- Read real photos (mirrors js/exif.js logic) ---
const names = (await readdir(PIC_DIR)).filter((n) => /^PXL_.*\.jpg$/i.test(n)).sort();
console.log(`=== reading ${names.length} real photos from ${PIC_DIR} ===`);

const photos = [];
let skipped = 0;
for (const name of names) {
  const buf = await readFile(path.join(PIC_DIR, name));
  const data = await exifr.parse(buf, { gps: true });
  const lat = data?.latitude, lon = data?.longitude;
  const ts = data?.DateTimeOriginal || data?.CreateDate;
  if (lat == null || lon == null || !ts) { skipped++; console.log(`  skip ${name}`); continue; }
  photos.push({ name, lat, lon, ts });
}
check("all 11 photos have GPS+timestamp", photos.length === 11, `got ${photos.length}, skipped ${skipped}`);

// --- Cluster ---
const trips = clusterTrips(photos);
console.log(`\n=== clustered into ${trips.length} trips ===`);
trips.forEach((t, i) =>
  console.log(`  Trip ${i + 1}: ${t.photos.length} photos, ${t.start.toISOString().slice(0,10)} .. ${t.end.toISOString().slice(0,10)}, center ${t.centerLat.toFixed(3)},${t.centerLon.toFixed(3)}`));

check("exactly 3 trips", trips.length === 3, `got ${trips.length}`);
check("photo counts 3/3/5", trips.map((t) => t.photos.length).join(",") === "3,3,5",
  trips.map((t) => t.photos.length).join(","));

// --- Live reverse geocode each trip center (Nominatim, spaced 1.1s) ---
console.log("\n=== live reverse geocoding (Nominatim) ===");
const labels = [];
for (const t of trips) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${t.centerLat}&lon=${t.centerLon}&zoom=10&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "trip-mapper/1.0 (e2e test)" } });
    const j = await res.json();
    const a = j.address || {};
    const label = [a.city || a.town || a.village || a.county, a.state, (a.country_code || "").toUpperCase()].filter(Boolean).join(", ");
    labels.push(label);
    console.log(`  ${t.centerLat.toFixed(3)},${t.centerLon.toFixed(3)} -> ${label}`);
  } catch (e) {
    labels.push("(geocode failed: " + e.message + ")");
    console.log(`  geocode failed: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 1100));
}

check("trip1 ~ Sarasota/FL", /Sarasota|Florida/i.test(labels[0]), labels[0]);
check("trip2 ~ Utah/Garfield", /Utah|Garfield/i.test(labels[1]), labels[1]);
check("trip3 ~ New York", /New York/i.test(labels[2]), labels[2]);

console.log(`\n=== e2e: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
