// spike/server.mjs
// Minimal zero-dependency Node server for the Google Photos data-access spike.
//
//   node spike/server.mjs
//
// It does two jobs:
//   1. Serves the static spike files (index.html, spike.js, config.js) at
//      http://localhost:8787  — the origin you registered in the OAuth client.
//   2. Exposes  GET /proxy?url=<googleusercontent baseUrl>  which streams the
//      photo bytes from Google's CDN. This exists because a Picker-API baseUrl
//      download from the *browser* is blocked by CORS; routing it through this
//      same-origin server bypasses that. This proxy is also the seed of the
//      eventual mini-PC self-host (see HANDOFF-google-photos.md).
//
// The browser must forward the OAuth access token so the proxy can authenticate
// the download: send it as the `X-Goog-Token` request header. The proxy turns
// that into `Authorization: Bearer <token>` toward Google.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

// Only allow proxying to Google's photo CDN — never an open proxy.
function isAllowedTarget(urlStr) {
  try {
    const u = new URL(urlStr);
    return (
      u.protocol === "https:" &&
      (u.hostname.endsWith(".googleusercontent.com") ||
        u.hostname.endsWith(".ggpht.com"))
    );
  } catch {
    return false;
  }
}

async function handleProxy(req, res, target) {
  if (!target || !isAllowedTarget(target)) {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end(
      "proxy: missing or disallowed ?url= (only *.googleusercontent.com / *.ggpht.com)"
    );
    return;
  }
  const headers = {};
  const token = req.headers["x-goog-token"];
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let upstream;
  try {
    upstream = await fetch(target, { headers });
  } catch (err) {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("proxy upstream fetch failed: " + err.message);
    return;
  }

  // Mirror status + content-type, add permissive CORS so the page can read it.
  const ct = upstream.headers.get("content-type") || "application/octet-stream";
  res.writeHead(upstream.status, {
    "content-type": ct,
    "access-control-allow-origin": "*",
  });
  if (!upstream.body) {
    res.end();
    return;
  }
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.end(buf);
}

async function handleStatic(req, res, pathname) {
  // Map "/" to index.html; prevent path traversal.
  let rel = pathname === "/" ? "/index.html" : pathname;
  rel = normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(__dirname, rel);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[extname(filePath)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found: " + rel);
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/proxy") {
    handleProxy(req, res, url.searchParams.get("url"));
  } else {
    handleStatic(req, res, url.pathname);
  }
});

server.listen(PORT, () => {
  console.log(`Spike server on http://localhost:${PORT}`);
  console.log(`  static : open http://localhost:${PORT} in your browser`);
  console.log(`  proxy  : GET /proxy?url=<googleusercontent baseUrl>  (X-Goog-Token header forwarded)`);
});
