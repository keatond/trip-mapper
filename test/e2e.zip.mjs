// test/e2e.zip.mjs
// Real-browser e2e for the ZIP drag-and-drop ingest + mobile-robustness work.
// Serves the app over python3 -m http.server, drives it with headless Chromium
// (Puppeteer), uploads a .zip to the file input, and asserts the full path:
//   1. zip.js + exif.js (run in-page) extract real GPS from the zipped photo,
//      filter junk (__MACOSX/.DS_Store), and skip a no-GPS image with a reason.
//   2. The real UI renders a map marker for the geotagged photo.
//   3. A skipped photo's reason is visible in the #skipList (no silent drop).
//   4. A thumbnail that can't decode is replaced by the .popup-thumb-fallback
//      placeholder (the HEIC-in-Chrome case).
//   5. Object URLs from a prior batch are revoked when a new batch loads.
//
// Setup: mkdir -p /tmp/tm-puppeteer && cd /tmp/tm-puppeteer && npm install puppeteer
//        mkdir -p /tmp/tm-spike && cd /tmp/tm-spike && npm install jszip
// Run:   node test/e2e.zip.mjs
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("/tmp/tm-puppeteer/node_modules/puppeteer");
const JSZipMod = require("/tmp/tm-spike/node_modules/jszip");
const JSZip = JSZipMod.default || JSZipMod;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8124;
const APP_URL = `http://localhost:${PORT}/`;
const SAMPLE = "/home/drake/Pictures/PXL_20251224_152600024.jpg";
const EXPECT = { lat: 27.13806, lon: -82.45287 };
// 1x1 transparent PNG (no EXIF) -> exercises the "skipped, no GPS/EXIF" path.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

let failed = false;
const assert = (cond, msg) => {
  if (!cond) { console.error("FAIL: " + msg); failed = true; }
  else console.log("PASS: " + msg);
};

async function buildZips() {
  const sampleBytes = await readFile(SAMPLE);

  const mixed = new JSZip();
  mixed.file("Photos/PXL_20251224_152600024.jpg", sampleBytes); // geotagged
  mixed.file("Photos/no_gps.png", PNG_1x1);                     // skipped
  mixed.file("__MACOSX/._PXL_20251224_152600024.jpg", Buffer.from("junk"));
  mixed.file("Photos/.DS_Store", Buffer.from("junk"));
  mixed.file("Photos/notes.txt", Buffer.from("not an image"));
  await writeFile("/tmp/tm-trip-mixed.zip", await mixed.generateAsync({ type: "nodebuffer" }));

  const second = new JSZip();
  second.file("PXL_20251224_152600024.jpg", sampleBytes);
  await writeFile("/tmp/tm-trip-second.zip", await second.generateAsync({ type: "nodebuffer" }));
}

function startServer() {
  const srv = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"],
    { cwd: ROOT, stdio: "ignore" });
  return srv;
}

async function main() {
  await buildZips();
  const server = startServer();
  await new Promise((r) => setTimeout(r, 800)); // let the server bind

  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(APP_URL, { waitUntil: "networkidle2" });

    // Libraries loaded (SRI on JSZip didn't block it).
    const libs = await page.evaluate(() => ({ jszip: !!window.JSZip, exifr: !!window.exifr }));
    assert(libs.jszip, "JSZip loaded in browser (SRI ok)");
    assert(libs.exifr, "exifr loaded in browser");

    // Upload the mixed zip; the change handler runs the real pipeline.
    const input = await page.$("#fileInput");
    await input.uploadFile("/tmp/tm-trip-mixed.zip");

    // (1) Run the real zip.js + exif.js modules in-page on the uploaded zip.
    const recs = await page.evaluate(async () => {
      const { expandFiles } = await import("/js/zip.js");
      const { readPhoto } = await import("/js/exif.js");
      const files = await expandFiles(document.getElementById("fileInput").files);
      const out = await Promise.all(files.map(readPhoto));
      return out.map((r) => ({ name: r.name, lat: r.lat, lon: r.lon, skipped: !!r.skipped, reason: r.reason }));
    });
    const good = recs.filter((r) => !r.skipped);
    const skipped = recs.filter((r) => r.skipped);
    assert(recs.length === 2, `2 image entries extracted (jpg + png), junk filtered (got ${recs.length}: ${recs.map((r) => r.name)})`);
    assert(good.length === 1 && Math.abs(good[0].lat - EXPECT.lat) < 0.0005 && Math.abs(good[0].lon - EXPECT.lon) < 0.0005,
      `geotagged jpg -> real lat/lon (got ${good[0] && good[0].lat},${good[0] && good[0].lon})`);
    assert(skipped.length === 1 && /gps|exif/i.test(skipped[0].reason || ""),
      `no-GPS png skipped with a reason (got "${skipped[0] && skipped[0].reason}")`);

    // (2) The real UI renders a marker for the geotagged photo.
    await page.waitForSelector(".leaflet-marker-icon", { timeout: 15000 });
    const markerCount = await page.$$eval(".leaflet-marker-icon", (els) => els.length);
    assert(markerCount >= 1, `>=1 map marker rendered (got ${markerCount})`);

    // (3) Skip reason visible in the sidebar (not a silent drop).
    const skipText = await page.$eval("#skipList", (el) => (el.hidden ? "" : el.textContent || ""));
    assert(/no_gps\.png/.test(skipText) && /skipped/i.test(skipText),
      `skip reason for no_gps.png visible in #skipList (got "${skipText.trim()}")`);

    // (4) Thumbnail that can't decode -> placeholder. Open the marker popup, then
    //     point its <img> at an undecodable source to trigger the onerror swap.
    await page.click(".leaflet-marker-icon");
    await page.waitForSelector(".leaflet-popup-content img.popup-thumb", { timeout: 5000 });
    const firstThumbUrl = await page.$eval(".leaflet-popup-content img.popup-thumb", (img) => img.src);
    await page.$eval(".leaflet-popup-content img.popup-thumb", (img) => { img.src = "data:image/heic;base64,AA"; });
    await page.waitForSelector(".popup-thumb-fallback", { timeout: 5000 });
    const phText = await page.$eval(".popup-thumb-fallback", (el) => el.textContent);
    assert(/preview unavailable/i.test(phText), `broken thumbnail -> placeholder shown (got "${phText}")`);

    // (5) Loading a new batch revokes the prior batch's object URLs.
    assert(firstThumbUrl.startsWith("blob:"), `first thumbnail is a blob: URL (got ${firstThumbUrl.slice(0, 24)}…)`);
    const input2 = await page.$("#fileInput");
    await input2.uploadFile("/tmp/tm-trip-second.zip");
    await page.waitForFunction(
      () => /1 mapped/.test(document.getElementById("status").textContent || ""),
      { timeout: 15000 }
    );
    const revoked = await page.evaluate(async (url) => {
      try { await fetch(url); return false; } catch { return true; }
    }, firstThumbUrl);
    assert(revoked, "prior batch's blob: URL was revoked after a new batch loaded");

    assert(errors.length === 0, `no uncaught page errors (got: ${errors.join(" | ")})`);
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }

  if (failed) { console.error("\nSome assertions failed."); process.exit(1); }
  console.log("\nAll e2e assertions passed — zip ingest + skip reasons + thumbnail fallback + URL revoke work in a real browser.");
}

main().catch((e) => { console.error(e); process.exit(1); });
