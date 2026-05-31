// js/cluster.js
// Location-first trip clustering (validated during de-risk spike).
//
// Rule: sort photos ascending by timestamp. Start a NEW trip only when the next
// photo is either >moveKm from the previous photo (haversine) OR >deadGapDays
// later. Otherwise it joins the current trip.
//
// Exports:
//   clusterTrips(photos, {moveKm=150, deadGapDays=5}) -> [trip]
//   haversine(a, b) -> km   (a, b are {lat, lon})

const EARTH_RADIUS_KM = 6371.0;

/**
 * Great-circle distance in kilometers between two {lat, lon} points.
 * @param {{lat:number, lon:number}} a
 * @param {{lat:number, lon:number}} b
 * @returns {number} km
 */
export function haversine(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(x));
}

/**
 * Cluster geotagged photos into trips.
 * @param {Array<{name?:string, lat:number, lon:number, ts:Date}>} photos
 * @param {{moveKm?:number, deadGapDays?:number}} [opts]
 * @returns {Array<{photos:Array, start:Date, end:Date, centerLat:number, centerLon:number}>}
 */
export function clusterTrips(photos, opts = {}) {
  const moveKm = opts.moveKm ?? 150;
  const deadGapDays = opts.deadGapDays ?? 5;

  const sorted = [...photos].sort((a, b) => a.ts - b.ts);

  const groups = [];
  let cur = [];

  for (const p of sorted) {
    if (cur.length === 0) {
      cur = [p];
      continue;
    }
    const prev = cur[cur.length - 1];
    const gapDays = (p.ts - prev.ts) / 86400000; // ms -> days
    const dist = haversine({ lat: prev.lat, lon: prev.lon }, { lat: p.lat, lon: p.lon });

    if (dist > moveKm || gapDays > deadGapDays) {
      groups.push(cur);
      cur = [p];
    } else {
      cur.push(p);
    }
  }
  if (cur.length) groups.push(cur);

  return groups.map(toTrip);
}

function toTrip(group) {
  // group is already sorted ascending by ts (built in order).
  const start = group[0].ts;
  const end = group[group.length - 1].ts;
  let sumLat = 0;
  let sumLon = 0;
  for (const p of group) {
    sumLat += p.lat;
    sumLon += p.lon;
  }
  return {
    photos: group,
    start,
    end,
    centerLat: sumLat / group.length,
    centerLon: sumLon / group.length,
  };
}
