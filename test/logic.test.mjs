// Node console harness for the logic modules (no browser needed).
// Run: node test/logic.test.mjs
import { clusterTrips, haversine } from "../js/cluster.js";

// ---- Sample metadata (ground truth from HANDOFF §5) ----
const raw = [
  ["2025-12-24T15:26:00Z", 27.13806, -82.45287, "PXL_20251224_152600024.jpg"],
  ["2025-12-24T15:26:10Z", 27.13806, -82.45287, "PXL_20251224_152610914.jpg"],
  ["2025-12-24T15:26:15Z", 27.13806, -82.45287, "PXL_20251224_152615491.jpg"],
  ["2026-04-28T16:34:35Z", 38.28886, -111.22531, "PXL_20260428_163435335.jpg"],
  ["2026-04-28T19:57:07Z", 37.86492, -111.30092, "PXL_20260428_195707791.jpg"],
  ["2026-04-28T20:03:26Z", 37.86536, -111.30002, "PXL_20260428_200326186.jpg"],
  ["2026-05-16T02:29:33Z", 40.75509, -73.96469, "PXL_20260516_022933394.jpg"],
  ["2026-05-17T01:10:00Z", 40.75801, -73.98725, "PXL_20260517_011000456.jpg"],
  ["2026-05-17T01:15:26Z", 40.75799, -73.98743, "PXL_20260517_011526596.NIGHT.jpg"],
  ["2026-05-17T01:16:52Z", 40.75779, -73.98698, "PXL_20260517_011652923.jpg"],
  ["2026-05-17T21:30:25Z", 40.64176, -74.07746, "PXL_20260517_213025192.jpg"],
];
const photos = raw.map(([ts, lat, lon, name]) => ({ ts: new Date(ts), lat, lon, name }));

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${extra}`); }
}

console.log("=== 2.1 clusterTrips ===");
const trips = clusterTrips(photos, { moveKm: 150, deadGapDays: 5 });
check("returns exactly 3 trips", trips.length === 3, `got ${trips.length}`);
check("trip photo counts are 3/3/5",
  trips.map((t) => t.photos.length).join(",") === "3,3,5",
  `got ${trips.map((t) => t.photos.length).join(",")}`);

// Trip date boundaries (UTC dates of first photo).
const d = (t) => t.start.toISOString().slice(0, 10);
check("trip1 starts 2025-12-24", d(trips[0]) === "2025-12-24", d(trips[0]));
check("trip2 starts 2026-04-28", d(trips[1]) === "2026-04-28", d(trips[1]));
check("trip3 starts 2026-05-16", d(trips[2]) === "2026-05-16", d(trips[2]));

// Photos within each trip ascending by ts.
const ascending = trips.every((t) =>
  t.photos.every((p, i) => i === 0 || p.ts >= t.photos[i - 1].ts));
check("photos within trips sorted ascending", ascending);

console.log("=== haversine ===");
// NYC May16 (40.7579,-73.9872) -> May17 (40.6418,-74.0775). Compute truth here.
const dist = haversine({ lat: 40.75779, lon: -73.98698 }, { lat: 40.64176, lon: -74.07746 });
console.log(`  computed NYC->Staten distance = ${dist.toFixed(3)} km`);
check("NYC->Staten distance ~14.8 km (10-20 sane range)", dist > 10 && dist < 20, `${dist}`);
// Sub-criterion from AC: two close NYC points ~ small.
const dClose = haversine({ lat: 40.75801, lon: -73.98725 }, { lat: 40.75779, lon: -73.98698 });
check("two adjacent Times Sq points < 0.1 km", dClose < 0.1, `${dClose}`);

console.log(`\n=== cluster/haversine: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
