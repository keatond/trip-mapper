// Node harness for the pure route logic in map.js.
// (renderMap/updateRoute need Leaflet + DOM; the route *decision* and *ordering*
//  are pure and testable here. The browser collapse/split/re-route behavior is
//  covered by test/e2e.cluster.mjs.)
import { routeVisible, orderRoutePoints } from "../js/map.js";

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  PASS  ${label}  -> ${g}`); }
  else { fail++; console.log(`  FAIL  ${label}  got ${g} want ${w}`); }
}

console.log("=== routeVisible (line drawn for any multi-photo trip) ===");
// The line is shown at all zoom levels for >1 photo; clustering no longer hides it.
check("multi-photo trip (5)", routeVisible(5), true);
check("two-photo trip", routeVisible(2), true);
check("single-photo trip", routeVisible(1), false);
check("empty trip", routeVisible(0), false);

console.log("\n=== orderRoutePoints (chronological through visible parents) ===");
// Each visible parent contributes one point keyed by its earliest child ts.
check("orders points by ts ascending",
  orderRoutePoints([
    { ts: 30, point: [3, 3] },
    { ts: 10, point: [1, 1] },
    { ts: 20, point: [2, 2] },
  ]),
  [[1, 1], [2, 2], [3, 3]]);
// Equal timestamps keep input order (stable) — cosmetic per handoff §8.
check("stable order on equal ts",
  orderRoutePoints([{ ts: 5, point: ["a"] }, { ts: 5, point: ["b"] }]),
  [["a"], ["b"]]);
check("single visible parent -> single point",
  orderRoutePoints([{ ts: 1, point: [9, 9] }]),
  [[9, 9]]);
check("no visible parents -> empty",
  orderRoutePoints([]),
  []);

console.log(`\n=== cluster-render: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
