// qa/shot.mjs — QA screenshot + console-error harness (dev-only, not part of the app).
//
// Serves the app over `python3 -m http.server`, loads it in headless Chromium,
// optionally injects a synthetic trip via the app's inert window.__loadTripForTest
// hook, captures any console errors / page errors, and writes desktop + mobile
// screenshots to qa/out/.
//
// Setup (one-time):  mkdir -p /tmp/tm-puppeteer && cd /tmp/tm-puppeteer && npm install puppeteer
// Run:  node qa/shot.mjs <scenario>      scenario = empty | trip   (default: trip)
//       node qa/shot.mjs trip --popup    also open the first marker's popup
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("/tmp/tm-puppeteer/node_modules/puppeteer");

// Build a throwaway no-GPS JPEG so the 'import' scenario exercises the skip list.
function nogpsFixture() {
  const p = "/tmp/tm-nogps.jpg";
  if (!fs.existsSync(p)) {
    const jpeg = require("/tmp/tm-spike/node_modules/jpeg-js");
    const w = 64, h = 64, data = Buffer.alloc(w * h * 4, 0xcc);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    fs.writeFileSync(p, jpeg.encode({ data, width: w, height: h }, 60).data);
  }
  return p;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "qa", "out");
const PORT = 8137;
const BASE = `http://localhost:${PORT}/`;

const scenario = process.argv[2] || "trip";
const wantPopup = process.argv.includes("--popup");

// A small labeled SVG as a data URL — stands in for a real photo thumbnail so
// cards and popups have something to show before the demo assets exist.
function thumb(label, hue) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='240'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${hue},55%,55%)'/>` +
    `<stop offset='1' stop-color='hsl(${(hue + 40) % 360},60%,38%)'/></linearGradient></defs>` +
    `<rect width='320' height='240' fill='url(#g)'/>` +
    `<text x='160' y='128' font-family='sans-serif' font-size='22' fill='white' ` +
    `text-anchor='middle' font-weight='700'>${label}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// Six points around Rome (< 5km apart, over ~2 days) -> one trip with a route
// and enough density to cluster when zoomed out.
const ROME = [
  ["Colosseum", 41.8902, 12.4922, "2026-05-10T09:10:00"],
  ["Roman Forum", 41.8925, 12.4853, "2026-05-10T11:30:00"],
  ["Pantheon", 41.8986, 12.4769, "2026-05-10T15:05:00"],
  ["Trevi Fountain", 41.9009, 12.4833, "2026-05-10T18:40:00"],
  ["St. Peter's", 41.9022, 12.4539, "2026-05-11T10:15:00"],
  ["Spanish Steps", 41.9058, 12.4823, "2026-05-11T16:20:00"],
];
// A second, far-away cluster (Paris, ~1100km from Rome) so clusterTrips yields
// TWO trips — lets QA see multiple cards with one selected.
const PARIS = [
  ["Eiffel Tower", 48.8584, 2.2945, "2026-05-14T10:00:00"],
  ["Louvre", 48.8606, 2.3376, "2026-05-14T14:30:00"],
  ["Montmartre", 48.8867, 2.3431, "2026-05-15T11:00:00"],
];
const TRIP_PHOTOS = [...ROME, ...PARIS].map(([name, lat, lon, ts], i) => ({
  name: `${name}.jpg`, lat, lon, ts, thumbUrl: thumb(name, (i * 47) % 360),
}));

const VIEWPORTS = [
  { tag: "desktop", width: 1440, height: 900 },
  { tag: "mobile", width: 390, height: 844 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT, stdio: "ignore" });
  await sleep(700);

  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const errors = [];
  let shotCount = 0;

  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
      page.on("console", (m) => { if (m.type() === "error") errors.push(`[${vp.tag}] console: ${m.text()}`); });
      page.on("pageerror", (e) => errors.push(`[${vp.tag}] pageerror: ${e.message}`));

      await page.goto(BASE, { waitUntil: "networkidle2" });
      await sleep(600);

      if (scenario === "demo") {
        // First-paint experience: the bundled sample trip auto-loads.
        await page.waitForSelector(".demo-banner:not([hidden])", { timeout: 15000 });
        await sleep(900);
      } else if (scenario === "cleared") {
        // After clearing the demo: the rich empty state appears.
        await page.waitForSelector(".demo-banner:not([hidden])", { timeout: 15000 });
        await page.click("#clearDemoBtn");
        await page.waitForSelector(".empty-card", { timeout: 5000 });
        await sleep(500);
      } else if (scenario === "import") {
        // Drive the REAL pipeline: upload the bundled demo photos + one no-GPS
        // image through the file input, so status + skip list reflect a true run.
        const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "demo", "manifest.json"), "utf8"));
        const demoPaths = manifest.files.map((f) => path.join(ROOT, "demo", f.file));
        const input = await page.$("#fileInput");
        await input.uploadFile(...demoPaths, nogpsFixture());
        // Wait for the success status (geocoding hits the network, so be patient).
        await page.waitForFunction(() => document.querySelector(".status--success"), { timeout: 30000 });
        await sleep(800);
      } else if (scenario === "trip") {
        const n = await page.evaluate((photos) => window.__loadTripForTest?.(photos), TRIP_PHOTOS);
        if (!n) throw new Error("__loadTripForTest hook returned no trips");
        await sleep(900); // let fitBounds + tiles settle
        if (wantPopup) {
          await page.evaluate(() => {
            const m = document.querySelector(".leaflet-marker-icon");
            if (m) m.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          });
          await sleep(500);
        }
      }

      const file = path.join(OUT, `${scenario}-${vp.tag}.png`);
      await page.screenshot({ path: file });
      shotCount++;
      console.log(`shot  ${path.relative(ROOT, file)}`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }

  if (errors.length) {
    console.log(`\nCONSOLE/PAGE ERRORS (${errors.length}):`);
    for (const e of errors) console.log("  " + e);
    process.exit(1);
  }
  console.log(`\nOK  ${shotCount} screenshots, 0 console errors.`);
}

main().catch((e) => { console.error("HARNESS FAIL:", e.message); process.exit(2); });
