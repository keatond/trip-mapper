// test/zip-ingest.test.mjs
// Proves the ZIP ingest path: a .zip bundle (as a Google Photos download would
// be) -> unzip -> image entry bytes -> exifr -> {GPS, timestamp}. Mirrors the
// extraction logic in js/zip.js (which uses window.JSZip in the browser) against
// node JSZip, plus junk-filtering (__MACOSX/, dotfiles) and non-image rejection.
//
// Usage:
//   mkdir -p /tmp/tm-spike && cd /tmp/tm-spike && npm install exifr jszip
//   node test/zip-ingest.test.mjs

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function load(name) {
  for (const c of [`/tmp/tm-spike/node_modules/${name}`, `/tmp/tm-puppeteer/node_modules/${name}`, name]) {
    try { return require(c); } catch { /* next */ }
  }
  return null;
}

const exifrMod = load("exifr");
const JSZipMod = load("jszip");
if (!exifrMod || !JSZipMod) {
  console.error("Missing deps. Install:\n  mkdir -p /tmp/tm-spike && cd /tmp/tm-spike && npm install exifr jszip");
  process.exit(2);
}
const parse = exifrMod.parse || exifrMod.default?.parse;
const JSZip = JSZipMod.default || JSZipMod;

// Same predicates as js/zip.js.
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|tiff?|heic|heif|bmp|avif)$/i;
const isJunk = (path) => {
  if (path.includes("__MACOSX/")) return true;
  const base = path.split("/").pop() || "";
  return base.startsWith(".") || base.startsWith("._");
};

const SAMPLE = "/home/drake/Pictures/PXL_20251224_152600024.jpg";
const EXPECT = { lat: 27.13806, lon: -82.45287 };
const TOL = 0.0005;

let failed = false;
function assert(cond, msg) {
  if (!cond) { console.error("FAIL: " + msg); failed = true; }
  else console.log("PASS: " + msg);
}

// 1. Build a zip like a Google Photos download: the real photo + cruft we expect
//    the extractor to ignore (a __MACOSX entry, a dotfile, and a non-image).
const sampleBytes = await readFile(SAMPLE);
const zip = new JSZip();
zip.file("Photos/PXL_20251224_152600024.jpg", sampleBytes);
zip.file("__MACOSX/._PXL_20251224_152600024.jpg", Buffer.from("junk"));
zip.file("Photos/.DS_Store", Buffer.from("junk"));
zip.file("Photos/metadata.json", Buffer.from('{"note":"not an image"}'));
const zipBlob = await zip.generateAsync({ type: "nodebuffer" });

// 2. Extract, mirroring js/zip.js.
const reloaded = await JSZip.loadAsync(zipBlob);
const entries = Object.values(reloaded.files).filter(
  (e) => !e.dir && IMAGE_EXT.test(e.name) && !isJunk(e.name)
);

assert(entries.length === 1, `exactly 1 image entry survives filtering (got ${entries.length}: ${entries.map((e) => e.name)})`);

// 3. Parse the extracted image's EXIF.
const imgBytes = new Uint8Array(await entries[0].async("uint8array"));
const data = await parse(imgBytes, { gps: true });

console.log("Extracted from zip:", {
  name: entries[0].name,
  latitude: data?.latitude,
  longitude: data?.longitude,
  DateTimeOriginal: data?.DateTimeOriginal,
});

assert(data != null, "exifr returned metadata from the unzipped image");
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

if (failed) { console.error("\nSome assertions failed."); process.exit(1); }
console.log("\nAll assertions passed — zip -> unzip -> EXIF -> {GPS, timestamp} works.");
