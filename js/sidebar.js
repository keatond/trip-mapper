// js/sidebar.js
// Renders the trip list in the sidebar as photography-forward cards:
// a cover thumbnail (first photo), trip name, date range, and photo count.
// Exports: renderSidebar(trips, onSelect, selectedIndex), formatDateRange(start, end)

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
 * Build the cover element for a trip: the first photo's thumbnail, with a
 * graceful placeholder if it's missing or can't decode (e.g. HEIC in Chrome).
 */
function buildCover(trip, index) {
  const cover = document.createElement("div");
  cover.className = "trip-card__cover";

  const coverUrl = trip.photos.find((p) => p.thumbUrl)?.thumbUrl;
  if (coverUrl) {
    const img = document.createElement("img");
    img.className = "trip-card__img";
    img.src = coverUrl;
    img.alt = "";
    img.loading = "lazy";
    img.onerror = () => { img.replaceWith(placeholder(index)); };
    cover.appendChild(img);
  } else {
    cover.appendChild(placeholder(index));
  }

  const count = trip.photos.length;
  const badge = document.createElement("span");
  badge.className = "trip-card__badge";
  badge.innerHTML =
    `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<path d="M3 8a2 2 0 0 1 2-2h2l1.2-1.6A1 1 0 0 1 11 4h2a1 1 0 0 1 .8.4L15 6h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>` +
    `<circle cx="12" cy="12.5" r="3.2"/></svg>` +
    `<span>${count}</span>`;
  cover.appendChild(badge);
  return cover;
}

/** A token-styled gradient placeholder used when no thumbnail can be shown. */
function placeholder(index) {
  const ph = document.createElement("div");
  ph.className = "trip-card__img trip-card__img--placeholder";
  ph.style.setProperty("--seed", String((index * 47) % 360));
  ph.innerHTML =
    `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" ` +
    `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/>` +
    `<path d="M21 15l-5-5L5 21"/></svg>`;
  return ph;
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
    li.className = "trip-card" + (i === selectedIndex ? " selected" : "");
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-pressed", String(i === selectedIndex));

    const body = document.createElement("div");
    body.className = "trip-card__body";

    const name = document.createElement("span");
    name.className = "trip-card__name";
    name.textContent = trip.name || `Trip ${i + 1}`;

    const dates = document.createElement("span");
    dates.className = "trip-card__meta";
    dates.textContent = formatDateRange(trip.start, trip.end);

    const count = trip.photos.length;
    const photos = document.createElement("span");
    photos.className = "trip-card__meta trip-card__meta--count";
    photos.textContent = `${count} photo${count === 1 ? "" : "s"}`;

    body.append(name, dates, photos);
    li.append(buildCover(trip, i), body);

    li.addEventListener("click", () => onSelect(i));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(i); }
    });
    list.appendChild(li);
  });
}
