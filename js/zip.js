// js/zip.js
// Expands a dropped/selected file list into a flat array of image Files:
// loose images pass through; .zip bundles (e.g. a Google Photos download) are
// unzipped in-browser via JSZip and their image entries extracted as Files.
// Exports: expandFiles(fileList) -> Promise<File[]>, isZip(file)

// Image entries we attempt to read EXIF from (exifr handles the actual parsing).
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|tiff?|heic|heif|bmp|avif)$/i;

// Map a filename extension to a sane MIME so constructed Files behave like the
// originals (matters for the image-type filter and <img> previews downstream).
const MIME_BY_EXT = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", tif: "image/tiff", tiff: "image/tiff",
  heic: "image/heic", heif: "image/heif", bmp: "image/bmp", avif: "image/avif",
};

/** True for files that look like zip archives, by name or MIME. */
export function isZip(file) {
  return (
    /\.zip$/i.test(file.name || "") ||
    ["application/zip", "application/x-zip-compressed", "multipart/x-zip"].includes(
      file.type
    )
  );
}

/** Archive cruft we never want to treat as a photo. */
function isJunk(path) {
  if (path.includes("__MACOSX/")) return true;
  const base = path.split("/").pop() || "";
  return base.startsWith(".") || base.startsWith("._");
}

function mimeForName(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

/**
 * Flatten a FileList/array: keep loose images, replace each zip with the image
 * Files it contains. Non-image, non-zip entries are dropped. Order: loose and
 * extracted images appear in encounter order.
 * @param {FileList|File[]} fileList
 * @returns {Promise<File[]>}
 */
export async function expandFiles(fileList) {
  const out = [];
  for (const f of Array.from(fileList)) {
    if (isZip(f)) {
      out.push(...(await extractImages(f)));
    } else if ((f.type && f.type.startsWith("image/")) || IMAGE_EXT.test(f.name || "")) {
      out.push(f);
    }
  }
  return out;
}

/** Unzip one archive and return its image entries as Files. */
async function extractImages(zipFile) {
  if (typeof window === "undefined" || !window.JSZip) return [];
  let zip;
  try {
    zip = await window.JSZip.loadAsync(zipFile);
  } catch {
    return []; // not a readable zip — skip silently (caller reports nothing added)
  }

  const entries = Object.values(zip.files).filter(
    (e) => !e.dir && IMAGE_EXT.test(e.name) && !isJunk(e.name)
  );

  const files = [];
  for (const e of entries) {
    const blob = await e.async("blob");
    const base = e.name.split("/").pop();
    files.push(new File([blob], base, { type: mimeForName(base) }));
  }
  return files;
}
