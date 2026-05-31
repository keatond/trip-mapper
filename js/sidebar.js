// js/sidebar.js
// Renders the trip list in the sidebar.
// Exports: renderSidebar(trips, onSelect, selectedIndex)

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Human date range for a trip.
 *  - single day:        "May 16, 2026"
 *  - same year span:    "May 16 – May 17, 2026"
 *  - cross-year span:   "Dec 30, 2025 – Jan 2, 2026"
 */
export function formatDateRange(start, end) {
  const sameDay = start.toDateString() === end.toDateString();
  const sM = MONTHS[start.getMonth()], sD = start.getDate(), sY = start.getFullYear();
  const eM = MONTHS[end.getMonth()], eD = end.getDate(), eY = end.getFullYear();

  if (sameDay) return `${sM} ${sD}, ${sY}`;
  if (sY === eY) return `${sM} ${sD} – ${eM} ${eD}, ${sY}`;
  return `${sM} ${sD}, ${sY} – ${eM} ${eD}, ${eY}`;
}

/**
 * @param {Array} trips  each {name, start, end, photos[...]}
 * @param {(index:number)=>void} onSelect
 * @param {number} selectedIndex
 */
export function renderSidebar(trips, onSelect, selectedIndex = 0) {
  const list = document.getElementById("tripList");
  if (!list) return;
  list.innerHTML = "";

  trips.forEach((trip, i) => {
    const li = document.createElement("li");
    li.className = "trip-item" + (i === selectedIndex ? " selected" : "");
    li.tabIndex = 0;

    const name = document.createElement("span");
    name.className = "trip-name";
    name.textContent = trip.name || `Trip ${i + 1}`;

    const meta = document.createElement("span");
    meta.className = "trip-meta";
    const count = trip.photos.length;
    meta.textContent = `${formatDateRange(trip.start, trip.end)} · (${count} photo${count === 1 ? "" : "s"})`;

    li.append(name, meta);
    li.addEventListener("click", () => onSelect(i));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(i); }
    });
    list.appendChild(li);
  });
}
