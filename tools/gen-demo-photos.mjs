// tools/gen-demo-photos.mjs
// Generates the bundled demo-trip photos: small JPEGs carrying REAL embedded
// EXIF GPS + DateTimeOriginal, so they flow through the app's exifr -> cluster
// -> map pipeline exactly like user photos. Output is committed under demo/.
//
// They are deliberately simple colored gradient frames (not real photography) —
// no licensing concerns, tiny footprint, fully reproducible/deterministic.
//
// Setup (one-time, mirrors the /tmp dep convention used by the node tests):
//   mkdir -p /tmp/tm-spike && cd /tmp/tm-spike && npm install jpeg-js piexifjs
// Run:
//   node tools/gen-demo-photos.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
function dep(name) {
  for (const c of [`/tmp/tm-spike/node_modules/${name}`, `/tmp/tm-puppeteer/node_modules/${name}`, name]) {
    try { return require(c); } catch { /* next */ }
  }
  console.error(`Missing dep "${name}". Install:\n  mkdir -p /tmp/tm-spike && cd /tmp/tm-spike && npm install jpeg-js piexifjs`);
  process.exit(2);
}
const jpeg = dep("jpeg-js");
const piexif = dep("piexifjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "demo");

const W = 640, H = 480;

// A two-day stroll through Rome — six landmarks, all < 5 km apart, in time order.
// One coherent trip with a visible multi-stop route.
const STOPS = [
  { file: "01-colosseum.jpg",   label: "Colosseum",      lat: 41.8902, lon: 12.4922, ts: "2026-05-10 09:10:00", hue: 18 },
  { file: "02-roman-forum.jpg", label: "Roman Forum",    lat: 41.8925, lon: 12.4853, ts: "2026-05-10 11:35:00", hue: 40 },
  { file: "03-pantheon.jpg",    label: "Pantheon",       lat: 41.8986, lon: 12.4769, ts: "2026-05-10 15:05:00", hue: 200 },
  { file: "04-trevi.jpg",       label: "Trevi Fountain", lat: 41.9009, lon: 12.4833, ts: "2026-05-10 18:40:00", hue: 175 },
  { file: "05-st-peters.jpg",   label: "St. Peter's",    lat: 41.9022, lon: 12.4539, ts: "2026-05-11 10:15:00", hue: 280 },
  { file: "06-spanish-steps.jpg", label: "Spanish Steps", lat: 41.9058, lon: 12.4823, ts: "2026-05-11 16:20:00", hue: 330 },
];

// HSL (h 0-360, s/l 0-1) -> [r,g,b] 0-255.
function hsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// Draw a diagonal two-tone gradient with a lighter "sky" band up top so each
// frame reads as a distinct place at a glance.
function frame(hue) {
  const buf = Buffer.alloc(W * H * 4);
  const top = hsl(hue, 0.55, 0.62);
  const bot = hsl((hue + 35) % 360, 0.6, 0.32);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (x / W + y / H) / 2;       // diagonal 0..1
      const sky = y < H * 0.32 ? 0.18 : 0; // subtle horizon lift
      const i = (y * W + x) * 4;
      buf[i]     = Math.min(255, top[0] * (1 - t) + bot[0] * t + sky * 255);
      buf[i + 1] = Math.min(255, top[1] * (1 - t) + bot[1] * t + sky * 255);
      buf[i + 2] = Math.min(255, top[2] * (1 - t) + bot[2] * t + sky * 255);
      buf[i + 3] = 255;
    }
  }
  return buf;
}

function exifFor(stop) {
  const latRef = stop.lat >= 0 ? "N" : "S";
  const lonRef = stop.lon >= 0 ? "E" : "W";
  const gps = {
    [piexif.GPSIFD.GPSLatitudeRef]: latRef,
    [piexif.GPSIFD.GPSLatitude]: piexif.GPSHelper.degToDmsRational(Math.abs(stop.lat)),
    [piexif.GPSIFD.GPSLongitudeRef]: lonRef,
    [piexif.GPSIFD.GPSLongitude]: piexif.GPSHelper.degToDmsRational(Math.abs(stop.lon)),
  };
  const exif = {
    [piexif.ExifIFD.DateTimeOriginal]: stop.ts.replace(/-/g, ":"), // "YYYY:MM:DD HH:MM:SS"
  };
  return piexif.dump({ "0th": {}, "Exif": exif, "GPS": gps });
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = { trip: "Rome", generated_by: "tools/gen-demo-photos.mjs", files: [] };

  for (const stop of STOPS) {
    const raw = jpeg.encode({ data: frame(stop.hue), width: W, height: H }, 68);
    const jpegStr = raw.data.toString("binary");
    const withExif = piexif.insert(exifFor(stop), jpegStr);
    const outBuf = Buffer.from(withExif, "binary");
    fs.writeFileSync(path.join(OUT, stop.file), outBuf);
    manifest.files.push({ file: stop.file, label: stop.label });
    console.log(`  wrote demo/${stop.file}  (${(outBuf.length / 1024).toFixed(1)} KB)`);
  }

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  wrote demo/manifest.json  (${manifest.files.length} files)`);
}

main();
