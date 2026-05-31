// Browser e2e for zoom-based marker clustering.
//
// Serves the app over python3 -m http.server, drives it with headless Chromium
// (Puppeteer), and asserts that nearby photo markers collapse into one
// brand-colored pin-shaped cluster with a count when zoomed out, that the connecting route
// line stays visible at every zoom level (through the photos' own positions
// while fully grouped, then through the visible parents as the cluster splits),
// and that markers split into individuals when zoomed in.
//
// Setup (one-time, mirrors the exifr-in-/tmp pattern used by e2e.real.mjs;
// avoids a global install per the environment rules):
//   mkdir -p /tmp/tm-puppeteer && cd /tmp/tm-puppeteer && npm install puppeteer
//
// Run:  node test/e2e.cluster.mjs
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("/tmp/tm-puppeteer/node_modules/puppeteer");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8123;
const URL = `http://localhost:${PORT}/`;

let pass = 0, fail = 0;
const check = (label, cond, extra = "") =>
  cond ? (pass++, console.log(`  PASS  ${label}`))
       : (fail++, console.log(`  FAIL  ${label}  ${extra}`));

// 5 photos close together (~150-220m apart): one trip, clustered when zoomed
// out, individually visible when zoomed in.
const PHOTOS = [
  { name: "a.jpg", lat: 40.000, lon: -111.000, ts: "2026-04-01T10:00:00Z" },
  { name: "b.jpg", lat: 40.002, lon: -111.001, ts: "2026-04-01T11:00:00Z" },
  { name: "c.jpg", lat: 40.004, lon: -111.000, ts: "2026-04-01T12:00:00Z" },
  { name: "d.jpg", lat: 40.006, lon: -111.002, ts: "2026-04-01T13:00:00Z" },
  { name: "e.jpg", lat: 40.008, lon: -111.001, ts: "2026-04-01T14:00:00Z" },
];

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("server did not start");
}

const server = spawn("python3", ["-m", "http.server", String(PORT)], {
  cwd: ROOT, stdio: "ignore",
});

let browser;
try {
  await waitForServer(URL);

  browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 800 });

  // Real JS errors (uncaught exceptions / console.error) — resource-load
  // failures are tracked separately via responses below.
  const jsErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) jsErrors.push(m.text());
  });
  page.on("pageerror", (e) => jsErrors.push(String(e)));
  // Bad HTTP responses, excluding the browser's automatic /favicon.ico probe.
  const badResponses = [];
  page.on("response", (r) => {
    if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) badResponses.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(URL, { waitUntil: "networkidle0" });

  // T1.1: plugin loaded, callable, no real errors.
  const hasPlugin = await page.evaluate(() => typeof L.markerClusterGroup === "function");
  check("L.markerClusterGroup is a function", hasPlugin);
  check("no JS errors / bad responses on load",
    jsErrors.length === 0 && badResponses.length === 0,
    [...jsErrors, ...badResponses].join(" | "));

  // Inject a synthetic trip (bypasses file-drop + geocoding).
  const tripCount = await page.evaluate((photos) => window.__loadTripForTest(photos), PHOTOS);
  check("one trip loaded from injected photos", tripCount === 1, `got ${tripCount}`);

  // --- Zoomed-out: markers collapse into a counted cluster, route hidden ---
  // Wait for the SETTLED state (animation done): the 5 nearby markers form one
  // cluster with no stray individual markers. Reading mid-animation can see
  // transient cluster clones, so we assert on the stable end state.
  await page.evaluate(() => window.__setZoomForTest(9));
  await page.waitForFunction(
    () => document.querySelectorAll(".tm-cluster").length === 1 &&
          document.querySelectorAll("img.leaflet-marker-icon").length === 0,
    { timeout: 5000 }
  );

  const clustered = await page.evaluate(() => {
    const bubbles = [...document.querySelectorAll(".tm-cluster")];
    const counts = bubbles.map((b) => parseInt(b.textContent.trim(), 10));
    const pinPath = document.querySelector(".tm-cluster svg path");
    return {
      bubbleCount: bubbles.length,
      sum: counts.reduce((a, c) => a + c, 0),
      individualMarkers: document.querySelectorAll("img.leaflet-marker-icon").length,
      routePaths: document.querySelectorAll("path.leaflet-interactive").length,
      // Grouped-icon shape/colour: an SVG teardrop path (no round-bubble),
      // filled with the brand accent token.
      hasPinPath: !!pinPath,
      pinFill: pinPath ? pinPath.getAttribute("fill") : null,
      accentToken: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
      hasCircleBubble: !!document.querySelector(".tm-cluster[style*='border-radius']") ||
        [...bubbles].some((b) => getComputedStyle(b).borderRadius === "50%"),
    };
  });
  check("cluster bubble present when zoomed out", clustered.bubbleCount >= 1, JSON.stringify(clustered));
  check("cluster count badge sums to 5 photos", clustered.sum === 5, JSON.stringify(clustered));
  check("no individual photo markers while clustered", clustered.individualMarkers === 0, JSON.stringify(clustered));
  // Line stays visible even when fully grouped into one cluster (drawn through
  // the photos' own positions, since one cluster center is a single point).
  check("route line present while fully grouped", clustered.routePaths === 1, JSON.stringify(clustered));
  // Grouped icon is a brand-colored, pin-shaped (teardrop SVG) marker — not a round bubble.
  check("grouped icon is an SVG pin (not a round bubble)", clustered.hasPinPath && !clustered.hasCircleBubble, JSON.stringify(clustered));
  check("grouped icon uses the brand accent token", clustered.pinFill && clustered.pinFill === clustered.accentToken, JSON.stringify(clustered));

  // --- Partially clustered: a cluster bubble AND standalone pin(s) coexist, so
  // the route line connects the >=2 visible parents. This is the "line present
  // while clustered" state (full collapse is a single point and draws no line). ---
  await page.evaluate(() => window.__setZoomForTest(14));
  await page.waitForFunction(
    () => document.querySelectorAll(".tm-cluster").length >= 1 &&
          document.querySelectorAll("img.leaflet-marker-icon").length >= 1,
    { timeout: 5000 }
  );
  const partial = await page.evaluate(() => ({
    bubbleCount: document.querySelectorAll(".tm-cluster").length,
    individualMarkers: document.querySelectorAll("img.leaflet-marker-icon").length,
    routePaths: document.querySelectorAll("path.leaflet-interactive").length,
  }));
  check("cluster bubble still present while partially clustered", partial.bubbleCount >= 1, JSON.stringify(partial));
  check("route line present while clustered (mixed bubbles + pins)", partial.routePaths === 1, JSON.stringify(partial));

  // --- Zoomed-in: markers split into individuals, route shown ---
  await page.evaluate(() => window.__setZoomForTest(18));
  await page.waitForFunction(
    () => document.querySelectorAll(".tm-cluster").length === 0 &&
          document.querySelectorAll("img.leaflet-marker-icon").length === 5,
    { timeout: 5000 }
  );

  const split = await page.evaluate(() => ({
    bubbleCount: document.querySelectorAll(".tm-cluster").length,
    individualMarkers: document.querySelectorAll("img.leaflet-marker-icon").length,
    routePaths: document.querySelectorAll("path.leaflet-interactive").length,
  }));
  check("no cluster bubbles when zoomed in", split.bubbleCount === 0, JSON.stringify(split));
  check("5 individual photo markers when zoomed in", split.individualMarkers === 5, JSON.stringify(split));
  check("route line shown when fully de-clustered", split.routePaths === 1, JSON.stringify(split));
} catch (e) {
  fail++;
  console.log(`  FAIL  harness error: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}

console.log(`\n=== e2e.cluster: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
