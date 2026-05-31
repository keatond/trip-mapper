// spike/test/exif-bytes.test.mjs
// Proves the *post-download* half of the spike: given the original photo BYTES
// (as the proxy would return them), exifr extracts GPS lat/lon + timestamp.
// This is the same parse the browser harness runs on baseUrl=d bytes, so it
// de-risks everything except the live OAuth/Picker fetch (which is manual QA).
//
// Usage:
//   # install exifr once into a scratch dir (kept out of the repo):
//   mkdir -p /tmp/tm-spike && cd /tmp/tm-spike && npm install exifr
//   # then:
//   node spike/test/exif-bytes.test.mjs
//
// Asserts the extracted lat/lon is within 0.0005 of the known value for the
// Sarasota sample photo, and that a valid Date is returned.

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Mirror the repo's exifr loader pattern (scratch install or global/local).
let exifr;
const candidates = [
  "/tmp/tm-spike/node_modules/exifr",
  "/tmp/tm-puppeteer/node_modules/exifr",
  "exifr",
];
for (const c of candidates) {
  try { exifr = require(c); break; } catch { /* try next */ }
}
if (!exifr) {
  console.error(
    "exifr not found. Install it first:\n" +
    "  mkdir -p /tmp/tm-spike && cd /tmp/tm-spike && npm install exifr"
  );
  process.exit(2);
}
// exifr may export as { default } or directly.
const parse = exifr.parse || exifr.default?.parse;

// Known ground truth (from HANDOFF.md §5).
const SAMPLE = "/home/drake/Pictures/PXL_20251224_152600024.jpg";
const EXPECT = { lat: 27.13806, lon: -82.45287 };
const TOL = 0.0005;

function assert(cond, msg) {
  if (!cond) { console.error("FAIL: " + msg); process.exitCode = 1; }
  else console.log("PASS: " + msg);
}

const bytes = new Uint8Array(await readFile(SAMPLE)); // simulate downloaded bytes
const data = await parse(bytes, { gps: true });

console.log("Extracted:", {
  latitude: data?.latitude,
  longitude: data?.longitude,
  DateTimeOriginal: data?.DateTimeOriginal,
});

assert(data != null, "exifr returned metadata from byte buffer");
assert(
  typeof data?.latitude === "number" && Math.abs(data.latitude - EXPECT.lat) < TOL,
  `latitude within ${TOL} of ${EXPECT.lat} (got ${data?.latitude})`
);
assert(
  typeof data?.longitude === "number" && Math.abs(data.longitude - EXPECT.lon) < TOL,
  `longitude within ${TOL} of ${EXPECT.lon} (got ${data?.longitude})`
);
const ts = data?.DateTimeOriginal || data?.CreateDate || data?.ModifyDate;
assert(ts instanceof Date && !Number.isNaN(ts.getTime()), `valid timestamp (got ${ts})`);

if (process.exitCode) console.error("\nSome assertions failed.");
else console.log("\nAll assertions passed — bytes -> EXIF -> {GPS, timestamp} works.");
