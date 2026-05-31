// Node harness for the pure formatDateRange logic in sidebar.js.
// (renderSidebar needs DOM; date formatting is pure and testable here.)
import { formatDateRange } from "../js/sidebar.js";

let pass = 0, fail = 0;
function check(label, got, want) {
  if (got === want) { pass++; console.log(`  PASS  ${label}  -> "${got}"`); }
  else { fail++; console.log(`  FAIL  ${label}  got "${got}" want "${want}"`); }
}

console.log("=== formatDateRange ===");
// Use local-time constructors so .getMonth()/.getDate() match assertions.
check("single day", formatDateRange(new Date(2026, 4, 16, 9), new Date(2026, 4, 16, 21)), "May 16, 2026");
check("same-year span", formatDateRange(new Date(2026, 4, 16), new Date(2026, 4, 17)), "May 16 – May 17, 2026");
check("cross-year span", formatDateRange(new Date(2025, 11, 30), new Date(2026, 0, 2)), "Dec 30, 2025 – Jan 2, 2026");
check("single day Dec", formatDateRange(new Date(2025, 11, 24, 10), new Date(2025, 11, 24, 10, 30)), "Dec 24, 2025");

console.log(`\n=== sidebar: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
