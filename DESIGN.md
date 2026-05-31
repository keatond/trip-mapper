# Trip Mapper — Design Language

A *photography-forward* visual system: the photos are the subject, so the UI
chrome stays calm and lets imagery and the map carry the color. Bolder than the
original warm-stone minimal look, but never loud enough to fight a photograph.

## Principles
1. **Photos lead.** Chrome is restrained; thumbnails, the map, and route are where
   color and energy live.
2. **One warm brand, one cool journey.** Burnt orange (`--accent`) is the brand and
   interactive color; deep teal (`--sea`) is the "journey" — it owns the route line
   and map accents. The pairing reads as *sunset over water*.
3. **Editorial warmth.** A soft serif (Fraunces) for the brand and trip titles adds a
   travel-journal character; everything else is a clean system sans.
4. **Token-driven.** Components never hard-code color/space/type — they read
   `css/tokens.css`. This keeps the five component stylesheets coherent.

## Files
- `css/tokens.css` — the single source of truth (this system).
- `css/shell.css` — global reset, header chrome, layout, sidebar, dropzone, map pane, responsive.
- `css/cards.css` — sidebar trip cards.
- `css/map.css` — popups, photo pins, cluster bubbles, route styling.
- `css/states.css` — import feedback: status line + skip list.
- `css/empty.css` — rich empty state + demo-trip banner.

## Palette
| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#faf8f5` | app canvas |
| `--surface` | `#ffffff` | cards, panels |
| `--surface-2` | `#f4f1ec` | inset / map backdrop |
| `--chrome` | `#1c1714` | dark header bar |
| `--ink` / `--ink-2` / `--muted` | `#1c1714` / `#44403c` / `#837a72` | text hierarchy |
| `--line` / `--line-strong` | `#e8e3dc` / `#d8d1c7` | borders |
| `--accent` | `#c2410c` | brand + interactive (burnt orange) |
| `--sea` | `#0f766e` | route / journey (deep teal) |
| `--ok` / `--warn` / `--danger` | green / amber / red | feedback |

## Type scale
System sans (`--font-ui`) for UI; Fraunces (`--font-display`, → Georgia fallback)
for brand + trip titles. Steps: `--fs-xs` 0.75 → `--fs-sm` 0.825 → `--fs-base` 0.95
→ `--fs-md` 1.1 → `--fs-lg` 1.35 → `--fs-xl` 1.75rem, plus a fluid `--fs-display`.

## Spacing / radii / elevation / motion
- Spacing: `--sp-1` (4px) … `--sp-7` (48px).
- Radii: `--r-sm` 6 → `--r-md` 10 → `--r-lg` 16 → `--r-xl` 22 → `--r-full` pill.
- Elevation: `--shadow-sm` / `--shadow-md` / `--shadow-lg`.
- Motion: `--dur` 0.18s default, `--dur-slow` 0.34s, `--ease` / `--ease-out`;
  collapses to ~0 under `prefers-reduced-motion`.

## Accessibility
- Focus is shown via `--focus-ring` (teal halo) on `:focus-visible`.
- Reduced-motion is honored globally in `tokens.css`.
- The display webfont is a progressive enhancement: it loads via Google Fonts and
  degrades to `Georgia, serif` if the CDN is unreachable — the app never depends on it.
