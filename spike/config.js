// Spike configuration.
// Paste your OAuth *Web application* Client ID here (see SETUP.md, step 4-5).
export const CLIENT_ID = "209959980454-sr4lp423v2v53vrlggh3i5fo85pk6d4t.apps.googleusercontent.com";

// Scope for the Google Photos Picker API (read access to items the user picks).
export const SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

// Where server.mjs listens. If you change this, also update the Authorized
// JavaScript origin in the Google Cloud console (SETUP.md step 4.5).
export const PORT = 8787;
