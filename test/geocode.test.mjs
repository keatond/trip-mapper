// Node harness for geocode.js. Mocks global fetch so it runs offline.
// Run: node test/geocode.test.mjs
import { placeName, _stats, _resetCache } from "../js/geocode.js";

let pass = 0, fail = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${extra}`); }
}

// --- Mock fetch returning a NYC address ---
let fetchCalls = 0;
globalThis.fetch = async (url) => {
  fetchCalls++;
  return {
    ok: true,
    json: async () => ({
      address: { city: "New York", state: "New York", country_code: "us" },
    }),
  };
};

console.log("=== 2.2 placeName (mocked fetch) ===");
_resetCache();

const t0 = Date.now();
const a = await placeName(40.7579, -73.9872);
check('returns string containing "New York"', a.includes("New York"), a);

// Same coord -> cache hit, no new fetch.
const before = fetchCalls;
const b = await placeName(40.7579, -73.9872);
check("second identical call is a cache hit (no new fetch)", fetchCalls === before, `calls=${fetchCalls}`);
check("cached value equals first", a === b);

// A different coord -> a real (mocked) fetch, spaced >= 1000ms from the first.
const c = await placeName(27.13806, -82.45287);
check("distinct coord triggers a fetch", fetchCalls === before + 1, `calls=${fetchCalls}`);
const spacing = _stats.requestTimes[1] - _stats.requestTimes[0];
check("requests spaced >= 1000ms apart", spacing >= 1000, `spacing=${spacing}ms`);

// --- Network error path -> fallback string, no throw ---
_resetCache();
fetchCalls = 0;
globalThis.fetch = async () => { throw new Error("network down"); };
let fellBack;
try {
  fellBack = await placeName(12.3456, 65.4321);
  check("network error returns fallback (no throw)", /12\.3456.*65\.4321/.test(fellBack), fellBack);
} catch (e) {
  check("network error returns fallback (no throw)", false, "threw: " + e.message);
}

console.log(`\n=== geocode: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
