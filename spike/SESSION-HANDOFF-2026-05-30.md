# Session Handoff — 2026-05-30 (evening)

> Continuing the **trip-mapper Google Photos data-access spike**. This session ran
> the live Picker test to a decision. **Result: NO-GO** for Picker import.
> For the full evidence read `spike/FINDINGS.md`; for how the harness runs read
> `spike/HANDOFF-google-photos.md`.

## Accomplished
- **Ran the spike to a GO/NO-GO decision** (it was "built but never run" before).
  Used the `/project-plan` flow: reviewed the whole tool, interviewed, got APPROVED,
  executed in phases with QA gates and zero rework cycles.
- **Harness pre-flight (verified):**
  - `node spike/test/exif-bytes.test.mjs` → PASS (lat 27.13806, lon -82.45287, valid ts).
  - `node spike/server.mjs` smoke test → `/` and `spike.js` 200; `/proxy` rejects
    missing-url (400) and non-Google host (400); allowed Google host relays upstream.
- **New feature — one-click "Copy FINDINGS" capture** added to the spike:
  - `spike/index.html` — added "Step 4 — Capture FINDINGS" block: `#findingsBtn`
    (disabled until items processed) + readonly `#findingsOut` textarea.
  - `spike/spike.js` — accumulate real per-item results (`runFindings`), thread a
    `rec` through `processItem`/`parseAndShow`, and `generateFindings()` emits a
    pasteable Q1/Q2/Q3 + GO/NO-GO block from the actual run values. Exposed as
    `window.__spikeFindings` for testing.
  - Verified with a node DOM-stub harness (`/tmp/tm-findings-test.mjs`, throwaway):
    15/15 logic assertions PASS (real GPS/timestamp values, Q2 classification across
    preserved/time-only/stripped, Q3 direct-vs-proxy, GO and NO-GO verdicts).
- **OAuth wired:** pasted the owner's Client ID into `spike/config.js`
  (`209959980454-…apps.googleusercontent.com`). Cleared the live 403 by adding the
  account as an OAuth **Test user**.
- **Live run + deliverable:** signed in, picked real photos (incl. May-2026 NYC set),
  downloaded `baseUrl=d`, parsed EXIF. **Wrote `spike/FINDINGS.md`** as the completed
  deliverable (was a template).
- **Memory updated:** `project_google_photos_spike.md` → NO-GO; new
  `feedback_background_server_lifecycle.md`; both indexed in `MEMORY.md`.

## Current State
- **DECISION: NO-GO** for Google Photos **Picker API** import.
  - **Q1** — Picker `mediaFileMetadata` has **no GPS** (only dimensions + camera +
    photoMetadata). Expected; not the blocker.
  - **Q2 (make-or-break)** — `baseUrl=d` original **strips EXIF GPS, keeps timestamp**
    (15/15 photos `GPS=MISSING`, valid DateTimeOriginal). The same photos retain GPS
    via **manual** ⋮→Download, so Google strips GPS specifically on the Picker path.
  - **Q3 surprise** — direct browser fetch of `baseUrl=d` **worked (HTTP 200)**; the
    CORS proxy was never needed (`proxy=n/a`). Contradicts the original assumption.
- **Working:** the main trip-mapper app (drag-drop EXIF → cluster → map) is unchanged
  and unaffected — the spike never touched it. Spike harness is sound and stays as
  reference. The capture button works.
- **Stopped/clean:** the background spike server (was on :8787) is shut down.
- **Left for later (deferred, not started):** any Google Photos importer. If revisited,
  do **Takeout `geoData` sidecar**, not Picker.

## Pending
1. **(Decision needed, low urgency)** Whether to build a **Google Takeout batch
   importer** (reads `*.json` `geoData` for lat/lon when EXIF is stripped). This is the
   only viable Google-Photos route after the NO-GO. Not started; scope as a separate
   `/project-plan` if wanted.
2. **(Supported path, no work needed)** Manual ⋮→Download keeps EXIF GPS and feeds the
   existing drag-drop flow — this is the recommended way to get photos in today.
3. **(Optional cleanup)** `spike/server.mjs` proxy is now known to be unnecessary for
   Picker downloads (direct works). Keep as reference; no action required.
4. **Other enhancement ideas** raised during review (not chosen this session):
   per-trip photo gallery, session persistence (IndexedDB), export (GPX/GeoJSON/PDF),
   manual trip editing. Also a real bug noted: `thumbUrl` object URLs are never revoked
   (`js/exif.js` / `js/map.js`) — a memory leak worth fixing in any future map work.

## Context for Next Session
- **Read first:** `spike/FINDINGS.md` (the verdict + evidence), then this file. For the
  main app, `README.md` + `PLAN.md`. Memory: `project_google_photos_spike.md`.
- **Key non-obvious decisions / gotchas:**
  - "GPS is missing" is ambiguous — **metadata absence (Q1, expected)** vs
    **downloaded-bytes absence (Q2, the real test)**. Don't conclude NO-GO from a
    metadata dump alone; require the Step-3 EXIF line.
  - Picker download keeps **timestamp** but strips **GPS** — partial, not a full wipe.
  - OAuth: app is in **Testing** mode → only **Test users** can sign in (the 403).
    Origin must be exactly `http://localhost:8787`.
  - **Server lifecycle gotcha:** `cd dir && node server.mjs &` + `kill $!`/`pkill`
    leaves the node child running (subshell PID issue). Kill by **port-owning PID** or
    use the harness `run_in_background`. Verify down via the **port**, not `pgrep`
    (which self-matches the command line). See `feedback_background_server_lifecycle.md`.
  - Editing files requires a prior **Read-tool** read; `cat` via Bash doesn't satisfy it.
  - `exifr` for node tests lives in a scratch dir `/tmp/tm-spike/node_modules` (kept out
    of the repo); the offline test looks there first.

## Resume Commands
```bash
# 0) Verify the decision + deliverable
sed -n '1,6p' /home/drake/Developer/trip-mapper/spike/FINDINGS.md   # Status COMPLETE / NO-GO

# 1) Re-prove the offline EXIF path (needs exifr in the scratch dir)
mkdir -p /tmp/tm-spike && cd /tmp/tm-spike && npm install exifr --silent
cd /home/drake/Developer/trip-mapper && node spike/test/exif-bytes.test.mjs   # expect PASS

# 2) (Only if re-running the live spike) start the server, then open the page
cd /home/drake/Developer/trip-mapper/spike && node server.mjs &   # serves http://localhost:8787
#   ...open http://localhost:8787, Sign in (Test user keatonofthedrakes@gmail.com),
#   pick 2-3 geotagged photos, Fetch, then Step 4 → Copy FINDINGS.
# Stop it cleanly (do NOT rely on kill %1):
ss -ltnp 2>/dev/null | grep ':8787' | grep -o 'pid=[0-9]*' | cut -d= -f2 | xargs -r kill
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8787/   # 000 = down

# 3) Run the main app (unchanged, still works)
cd /home/drake/Developer/trip-mapper && python3 -m http.server 8000   # open http://localhost:8000
```
