// js/exif.js
// Reads EXIF GPS + timestamp from an image File, in-browser, header-only.
// Exports: readPhoto(file) -> {name, lat, lon, ts, thumbUrl}
//                          | {name, skipped:true, reason}

/**
 * Parse a single photo File for GPS + timestamp.
 * Uses exifr (loaded globally via CDN as window.exifr) in header-only mode.
 *
 * @param {File} file
 * @returns {Promise<Object>} resolved photo record or a skipped marker.
 */
export async function readPhoto(file) {
  const name = file.name;

  if (typeof window === "undefined" || !window.exifr) {
    return { name, skipped: true, reason: "exifr library not loaded" };
  }

  let data;
  try {
    // {gps:true} enables the GPS IFD and conveniently also returns the EXIF
    // date block (DateTimeOriginal/ModifyDate). NOTE: do NOT add a `pick`
    // whitelist here — it suppresses the GPS lat/lon resolution in exifr.
    data = await window.exifr.parse(file, { gps: true });
  } catch (err) {
    return { name, skipped: true, reason: "EXIF parse failed: " + err.message };
  }

  if (!data) {
    return { name, skipped: true, reason: "no EXIF metadata" };
  }

  // exifr with {gps:true} conveniently exposes decimal .latitude/.longitude.
  let lat = data.latitude;
  let lon = data.longitude;

  // Fallback: assemble decimal from raw GPS arrays + refs if needed.
  if (lat == null || lon == null) {
    const built = buildDecimalFromRaw(data);
    lat = built.lat;
    lon = built.lon;
  }

  if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) {
    return { name, skipped: true, reason: "no GPS data" };
  }

  const ts = data.DateTimeOriginal || data.CreateDate || data.ModifyDate;
  if (!ts || !(ts instanceof Date) || Number.isNaN(ts.getTime())) {
    return { name, skipped: true, reason: "no timestamp" };
  }

  const thumbUrl = URL.createObjectURL(file);

  return { name, lat, lon, ts, thumbUrl };
}

/**
 * Convert raw EXIF GPS (DMS arrays + N/S/E/W refs) to signed decimal degrees.
 * Used only when exifr did not already provide decimal latitude/longitude.
 */
function buildDecimalFromRaw(data) {
  const out = { lat: null, lon: null };
  if (Array.isArray(data.GPSLatitude) && data.GPSLatitudeRef) {
    out.lat = dmsToDecimal(data.GPSLatitude, data.GPSLatitudeRef);
  }
  if (Array.isArray(data.GPSLongitude) && data.GPSLongitudeRef) {
    out.lon = dmsToDecimal(data.GPSLongitude, data.GPSLongitudeRef);
  }
  return out;
}

/**
 * [degrees, minutes, seconds] + ref -> signed decimal.
 * Negative for South latitudes and West longitudes.
 */
function dmsToDecimal(dms, ref) {
  const [d = 0, m = 0, s = 0] = dms;
  let dec = d + m / 60 + s / 3600;
  const r = String(ref).toUpperCase();
  if (r === "S" || r === "W") dec = -dec;
  return dec;
}

// Exported for unit testing of the decimal-conversion path.
export { dmsToDecimal };
