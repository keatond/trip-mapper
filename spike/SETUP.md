# Google Photos Spike — GCP + OAuth Setup

> Goal: get an **OAuth Client ID** so the spike harness (`index.html` + `server.mjs`)
> can sign you in and call the **Google Photos Picker API**. Takes ~10 minutes.
> No prior Google Cloud experience needed — follow each step in order.

You are setting up the **Picker API** (the current, supported way to read a user's
own Google Photos). The older "Library API" broad read access was restricted by
Google in 2025, so we do **not** use it.

---

## 0. Prerequisites
- A Google account (the one whose photos you want to test with).
- A browser.

---

## 1. Create a Google Cloud project
1. Go to <https://console.cloud.google.com/>.
2. Top bar → project dropdown → **New Project**.
3. Name it e.g. `trip-mapper-spike` → **Create**.
4. Make sure that new project is selected in the top bar before continuing.

## 2. Enable the Photos Picker API
1. Go to **APIs & Services → Library** (<https://console.cloud.google.com/apis/library>).
2. Search for **`Photos Picker API`**.
3. Click it → **Enable**.

   > Enable **Photos Picker API** specifically. Do **not** enable the legacy
   > "Photos Library API" — we are not using it.

## 3. Configure the OAuth consent screen
1. Go to **APIs & Services → OAuth consent screen**
   (<https://console.cloud.google.com/apis/credentials/consent>).
2. User type: **External** → **Create**.
3. Fill the required fields:
   - **App name:** `trip-mapper-spike`
   - **User support email:** your email
   - **Developer contact email:** your email
   - Leave the rest at defaults → **Save and Continue**.
4. **Scopes** step: you don't need to add scopes here — the app requests this scope
   at runtime:
   ```
   https://www.googleapis.com/auth/photospicker.mediaitems.readonly
   ```
   Click **Save and Continue**.
5. **Test users** step: click **+ Add Users** and add **your own Google account
   email** (`keatonofthedrakes@gmail.com`). **Save and Continue**.

   > Why this matters: while the app is in **Testing** mode it is "unverified", and
   > only accounts listed as **Test users** are allowed to grant consent. If you
   > skip this, sign-in will fail with "access blocked / app not verified".

## 4. Create the OAuth Client ID
1. Go to **APIs & Services → Credentials**
   (<https://console.cloud.google.com/apis/credentials>).
2. **+ Create Credentials → OAuth client ID**.
3. **Application type:** **Web application**.
4. **Name:** `trip-mapper-spike-web`.
5. Under **Authorized JavaScript origins** → **+ Add URI** and enter exactly:
   ```
   http://localhost:8787
   ```
   > This must match where the spike server runs. If you change the port in
   > `server.mjs`, register the matching origin here too. No "Authorized redirect
   > URI" is needed — the harness uses the GIS token flow, not a redirect.
6. **Create**. A dialog shows your **Client ID** (ends in
   `.apps.googleusercontent.com`). Copy it.

## 5. Put the Client ID into the harness
Open `spike/config.js` and paste your Client ID:

```js
export const CLIENT_ID = "1234567890-abcdefg.apps.googleusercontent.com";
```

You're done. Next: run the harness — see **HANDOFF-google-photos.md** ("Run it").

---

## Troubleshooting
- **"Access blocked: app not verified" / 403 at consent:** your account isn't in
  **Test users** (Step 3.5), or you signed in with a different account.
- **`redirect_uri_mismatch` / `origin mismatch`:** the **Authorized JavaScript
  origin** (Step 4.5) doesn't exactly match the URL in your browser bar
  (`http://localhost:8787`, no trailing slash, http not https).
- **Picker API 403 `PERMISSION_DENIED`:** the **Photos Picker API** isn't enabled
  on the selected project (Step 2), or you're on the wrong project.
