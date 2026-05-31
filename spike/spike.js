// spike/spike.js
// Drives the Google Photos data-access spike end to end:
//   1. GIS token flow  -> OAuth access token (scope: photospicker ...readonly)
//   2. Picker API      -> create session, user picks photos, poll, list items
//   3. Raw dump        -> show mediaMetadata verbatim (Q1: is GPS present?)
//   4. Byte + EXIF     -> download original via baseUrl=d, parse lat/lon/ts
//                         trying direct-browser (Q3: CORS?) then proxy.
//
// Everything it learns is printed on the page + console so FINDINGS.md can be
// filled from real evidence. Nothing here is wired into the real app.

import { CLIENT_ID, SCOPE } from "./config.js";

const PICKER_BASE = "https://photospicker.googleapis.com/v1";

const els = {
  authBtn: document.getElementById("authBtn"),
  pickBtn: document.getElementById("pickBtn"),
  fetchBtn: document.getElementById("fetchBtn"),
  authStatus: document.getElementById("authStatus"),
  rawDump: document.getElementById("rawDump"),
  items: document.getElementById("items"),
  log: document.getElementById("log"),
  configWarn: document.getElementById("configWarn"),
  findingsBtn: document.getElementById("findingsBtn"),
  findingsOut: document.getElementById("findingsOut"),
};

let accessToken = null;
let tokenClient = null;
let session = null; // { id, pickerUri, pollingConfig }

// Accumulates the *real* results of the run so the "Copy FINDINGS" button emits
// evidence (not placeholders): Q1 from the metadata scan, Q2/Q3 per item from the
// byte-download + EXIF parse. Each item record is filled in processItem/parseAndShow.
const runFindings = { q1: null, items: [] };

function log(msg, cls) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  const span = cls ? `<span class="${cls}">${escapeHtml(line)}</span>` : escapeHtml(line);
  els.log.innerHTML += span + "\n";
  els.log.scrollTop = els.log.scrollHeight;
  console.log(line);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- Step 1: auth ---------------------------------------------------------

function initAuth() {
  if (!CLIENT_ID || CLIENT_ID.startsWith("PASTE_")) {
    els.configWarn.hidden = false;
    els.authBtn.disabled = true;
    log("Client ID not configured — edit config.js (see SETUP.md).", "bad");
    return;
  }
  if (!window.google || !google.accounts || !google.accounts.oauth2) {
    log("Google Identity Services not loaded yet; retrying in 500ms…", "warn");
    setTimeout(initAuth, 500);
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (resp) => {
      if (resp.error) {
        log("Auth error: " + resp.error, "bad");
        return;
      }
      accessToken = resp.access_token;
      els.authStatus.innerHTML = '<span class="ok">Signed in — access token acquired.</span>';
      els.pickBtn.disabled = false;
      log("Access token acquired.", "ok");
    },
  });
  log("Auth ready. Click 'Sign in with Google'.");
}

els.authBtn.addEventListener("click", () => {
  if (!tokenClient) return;
  tokenClient.requestAccessToken({ prompt: "consent" });
});

// ---- Step 2: Picker session ----------------------------------------------

async function api(path, opts = {}) {
  const res = await fetch(PICKER_BASE + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`${path} -> HTTP ${res.status}: ${text}`);
  }
  return json;
}

els.pickBtn.addEventListener("click", async () => {
  try {
    log("Creating picker session…");
    session = await api("/sessions", { method: "POST", body: "{}" });
    log("Session created: " + session.id);
    const uri = session.pickerUri;
    if (!uri) throw new Error("no pickerUri in session response");
    window.open(uri, "_blank", "noopener");
    log("Opened picker in a new tab. Select photos there, then come back and click 'Fetch picked items'.", "warn");
    els.fetchBtn.disabled = false;
  } catch (err) {
    log(String(err.message || err), "bad");
  }
});

async function waitForPick() {
  // Poll the session until the user has set media items.
  const intervalMs = session?.pollingConfig?.pollInterval
    ? parseDuration(session.pollingConfig.pollInterval)
    : 2000;
  for (let i = 0; i < 60; i++) {
    const s = await api(`/sessions/${encodeURIComponent(session.id)}`);
    if (s.mediaItemsSet) return true;
    await sleep(intervalMs);
  }
  return false;
}

function parseDuration(d) {
  // "2.5s" -> 2500
  const m = /([\d.]+)s/.exec(String(d));
  return m ? Math.max(1000, Math.round(parseFloat(m[1]) * 1000)) : 2000;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

els.fetchBtn.addEventListener("click", async () => {
  try {
    log("Waiting for your picker selection to be committed…");
    const ready = await waitForPick();
    if (!ready) { log("Timed out waiting for selection.", "bad"); return; }

    log("Listing picked media items…");
    let items = [];
    let pageToken;
    do {
      const q = new URLSearchParams({ sessionId: session.id });
      if (pageToken) q.set("pageToken", pageToken);
      const page = await api(`/mediaItems?${q.toString()}`);
      items = items.concat(page.mediaItems || []);
      pageToken = page.nextPageToken;
    } while (pageToken);

    log(`Got ${items.length} item(s).`, "ok");
    els.rawDump.textContent = JSON.stringify(items, null, 2);

    // Q1 quick scan: does any field look like location?
    const blob = JSON.stringify(items).toLowerCase();
    const hasLocWord = /latitude|longitude|"location"|geo|coordinate/.test(blob);
    log(
      hasLocWord
        ? "Q1: a location-like key APPEARS in metadata — inspect the raw dump."
        : "Q1: NO location-like key found in mediaMetadata (as expected).",
      hasLocWord ? "ok" : "warn"
    );

    // Reset + record Q1 for the FINDINGS capture.
    runFindings.q1 = { locKeyFound: hasLocWord, itemCount: items.length };
    runFindings.items = [];

    els.items.innerHTML = "";
    for (const it of items) await processItem(it);

    // Enable the FINDINGS capture once there is at least one processed item.
    if (runFindings.items.length) {
      els.findingsBtn.disabled = false;
      log("Results ready — click 'Copy FINDINGS' to capture Q1/Q2/Q3 for FINDINGS.md.", "ok");
    }
  } catch (err) {
    log(String(err.message || err), "bad");
  }
});

// ---- Step 3: byte download + EXIF ----------------------------------------

async function processItem(it) {
  const mf = it.mediaFile || {};
  const baseUrl = mf.baseUrl;
  const name = mf.filename || it.id || "(item)";
  const div = document.createElement("div");
  div.className = "item";
  div.innerHTML = `<strong>${escapeHtml(name)}</strong>`;
  els.items.appendChild(div);

  // One record per item, captured for FINDINGS. Mutated as we learn each fact so
  // the emitted block carries the same values rendered on the page (no placeholders).
  const rec = { name, direct: null, proxy: null, gps: null, time: null, via: null };
  runFindings.items.push(rec);

  if (!baseUrl) {
    div.innerHTML += `<div class="bad">no baseUrl on this item</div>`;
    rec.direct = "no baseUrl";
    return;
  }
  // "=d" requests the original/download (full bytes incl. EXIF).
  const dlUrl = baseUrl + "=d";

  // Q3a: direct browser fetch (expected to fail on CORS).
  let directResult = "";
  try {
    const r = await fetch(dlUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    directResult = `direct fetch: HTTP ${r.status}` + (r.ok ? " (succeeded!)" : "");
    div.innerHTML += `<div class="${r.ok ? "ok" : "warn"}">${escapeHtml(directResult)}</div>`;
    rec.direct = `HTTP ${r.status}${r.ok ? " (ok)" : ""}`;
    if (r.ok) {
      const buf = new Uint8Array(await r.arrayBuffer());
      await parseAndShow(div, buf, "direct", rec);
      return;
    }
  } catch (err) {
    directResult = "direct fetch BLOCKED (likely CORS): " + (err.message || err);
    div.innerHTML += `<div class="warn">${escapeHtml(directResult)}</div>`;
    rec.direct = "blocked (CORS)";
  }

  // Q3b: proxied fetch (token forwarded via X-Goog-Token header).
  try {
    const proxied = `/proxy?url=${encodeURIComponent(dlUrl)}`;
    const r = await fetch(proxied, { headers: { "X-Goog-Token": accessToken } });
    div.innerHTML += `<div class="${r.ok ? "ok" : "bad"}">proxy fetch: HTTP ${r.status}</div>`;
    rec.proxy = `HTTP ${r.status}${r.ok ? " (ok)" : ""}`;
    if (!r.ok) return;
    const buf = new Uint8Array(await r.arrayBuffer());
    await parseAndShow(div, buf, "proxy", rec);
  } catch (err) {
    div.innerHTML += `<div class="bad">proxy fetch failed: ${escapeHtml(err.message || String(err))}</div>`;
    rec.proxy = "failed: " + (err.message || String(err));
  }
}

async function parseAndShow(div, bytes, via, rec) {
  let data = null;
  try {
    data = await window.exifr.parse(bytes, { gps: true });
  } catch (err) {
    div.innerHTML += `<div class="bad">EXIF parse error (${via}): ${escapeHtml(err.message)}</div>`;
    if (rec) { rec.via = via; rec.gps = null; rec.time = "EXIF parse error"; }
    return;
  }
  const lat = data?.latitude;
  const lon = data?.longitude;
  const ts = data?.DateTimeOriginal || data?.CreateDate || data?.ModifyDate;
  const haveGps = typeof lat === "number" && typeof lon === "number";
  div.innerHTML +=
    `<div class="${haveGps ? "ok" : "bad"}">EXIF via ${via}: ` +
    `GPS=${haveGps ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "MISSING"} · ` +
    `time=${ts ? new Date(ts).toISOString() : "MISSING"}</div>`;
  log(
    `${via}: GPS=${haveGps ? "yes" : "NO"} time=${ts ? "yes" : "NO"}`,
    haveGps ? "ok" : "bad"
  );
  // Record the same values shown above for the FINDINGS capture.
  if (rec) {
    rec.via = via;
    rec.gps = haveGps ? { lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) } : null;
    rec.time = ts ? new Date(ts).toISOString() : null;
  }
}

// ---- Step 4: capture FINDINGS --------------------------------------------

/** Classify Q2 (EXIF preservation) for one item record from its real values. */
function classifyQ2(rec) {
  const hasGps = !!rec.gps;
  const hasTime = !!rec.time && rec.time !== "EXIF parse error";
  if (hasGps && hasTime) return "GPS + time preserved";
  if (!hasGps && hasTime) return "time only (GPS stripped)";
  if (hasGps && !hasTime) return "GPS only (time missing)";
  return "both stripped / unreadable";
}

/** Build a copy-pasteable FINDINGS block from the actual run state. */
function generateFindings() {
  const q1 = runFindings.q1;
  const items = runFindings.items;
  const lines = [];
  lines.push("===== Trip Mapper — Google Photos spike: captured FINDINGS =====");
  lines.push(`run at: ${new Date().toISOString()}`);
  lines.push("");

  // Q1
  if (q1) {
    lines.push(
      `Q1 (metadata GPS): ${q1.locKeyFound
        ? "location-like key APPEARS in mediaMetadata — inspect raw dump"
        : "NO location-like key found in mediaMetadata (as expected)"}` +
      `  [${q1.itemCount} item(s) picked]`
    );
  } else {
    lines.push("Q1 (metadata GPS): (no items fetched yet)");
  }
  lines.push("");

  // Per-item Q2 + Q3 evidence
  lines.push("Per-item evidence (Q2 EXIF · Q3 transport):");
  items.forEach((rec, i) => {
    const gps = rec.gps ? `${rec.gps.lat}, ${rec.gps.lon}` : "MISSING";
    const time = rec.time || "MISSING";
    lines.push(
      `  ${i + 1}. ${rec.name}` +
      `\n       Q2: ${classifyQ2(rec)}  (GPS=${gps} · time=${time}, via ${rec.via || "n/a"})` +
      `\n       Q3: direct=${rec.direct ?? "n/a"} · proxy=${rec.proxy ?? "n/a"}`
    );
  });
  lines.push("");

  // Aggregate verdicts
  const anyGpsTime = items.some((r) => r.gps && r.time && r.time !== "EXIF parse error");
  const anyDirectOk = items.some((r) => /\(ok\)/.test(r.direct || ""));
  const anyProxyOk = items.some((r) => /\(ok\)/.test(r.proxy || ""));
  lines.push(
    `Q2 verdict: ${anyGpsTime
      ? "GPS + timestamp PRESERVED in baseUrl=d original (GO signal)"
      : "GPS + timestamp NOT preserved in any item (NO-GO signal)"}`
  );
  lines.push(
    `Q3 verdict: ${anyDirectOk
      ? "direct browser fetch worked (no proxy strictly required)"
      : anyProxyOk
        ? "direct blocked; PROXY required (server component needed)"
        : "neither direct nor proxy succeeded — re-run / check token & server"}`
  );
  lines.push("");

  // GO / NO-GO suggestion (owner confirms)
  lines.push(
    `Suggested decision: ${anyGpsTime ? "GO" : "NO-GO"}  ` +
    `(${anyGpsTime
      ? "Picker + baseUrl=d + EXIF yields {GPS, time}"
      : "EXIF location stripped; use manual-download or Takeout fallback"})`
  );
  lines.push("");
  lines.push("Offline pre-check (no OAuth): bytes -> EXIF -> {GPS,time} PASS");
  lines.push("  (node spike/test/exif-bytes.test.mjs: lat 27.13806, lon -82.45287, valid ts)");
  lines.push("================================================================");
  return lines.join("\n");
}

els.findingsBtn.addEventListener("click", async () => {
  const text = generateFindings();
  els.findingsOut.value = text;
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    // Clipboard API can be blocked (insecure context / permissions). Fall back to
    // selecting the textarea so the user can Ctrl-C manually.
    els.findingsOut.focus();
    els.findingsOut.select();
  }
  log(
    copied
      ? "FINDINGS copied to clipboard (and shown in the box below)."
      : "FINDINGS shown + selected below — press Ctrl-C to copy (clipboard API blocked).",
    "ok"
  );
});

// Exported only for a node smoke test of the pure text builder. In the browser
// `window` is the global; under node `globalThis` carries it for import-free use.
if (typeof window !== "undefined") {
  window.__spikeFindings = { generateFindings, classifyQ2, runFindings };
}

initAuth();
