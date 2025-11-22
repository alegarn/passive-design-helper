````markdown
# Passive Design Tactics — Web UI

A Svelte 5 + Vite single-page app for browser-based analysis of timestamped temperature and relative-humidity CSV data (streaming parsing, psychrometric charts, time-series aggregation, and export).

<!-- Badges -->
[![License](https://img.shields.io/github/license/alegarn/passive-design-helper)](https://github.com/alegarn/passive-design-helper/blob/main/LICENSE)
[![Node.js version](https://img.shields.io/badge/node-%3E%3D21-brightgreen.svg)](https://nodejs.org/)
[![Build](https://img.shields.io/badge/build-local-lightgrey.svg)](#)

This directory contains the web UI that runs fully client-side and is designed to work with large CSV files by processing input in streaming chunks.

---

## Table of contents
- Features
- Quick start
- Development
- Build & deploy
- Project layout
- CSV expectations & sample data
- Troubleshooting
- Contributing
- License

---

## Features
- Streaming CSV processing (large-file friendly)
- Drag-and-drop upload with automatic column detection
- Interactive psychrometric chart + time-series visualizations
- Multi-period aggregation (hourly/daily/weekly/monthly)
- Export processed data (CSV / JSON / Markdown)

## Prerequisites
- Node.js 21+ (or a recent stable Node.js) — tested with Node 21
- npm (bundled with Node.js)

This project uses Vite and Svelte 5. If you use another Node version, consider using nvm to switch Node versions.

## Quick start
From the `web/` directory:

```bash
cd web
npm ci        # or `npm install` for non-CI environments
npm run dev
```

Open the URL shown in the CLI (default `http://localhost:5173`). The dev server supports hot module reloading for fast iteration.

## Development
- Start the Vite dev server: `npm run dev`
- If you need the dev server to be reachable from other devices on your LAN, run: `npm run dev -- --host` or set `VITE_HOST=0.0.0.0`.
- To change the port: `npm run dev -- --port 3000` or set `VITE_PORT`.

Scripts available in `package.json`:
- `dev` — Run the local development server with Vite
- `build` — Build the production-ready static files into `dist/`
- `preview` — Serve the `dist/` build locally for verification

## Build (production)
Create a production build and verify the static output:

```bash
cd web
npm run build
npm run preview   # preview the build locally
```

The build output is in the `dist/` directory. This app is static and can be hosted on any static hosting provider (Netlify, Vercel, GitHub Pages, S3, etc.). The Vite `base` option is set to `./` so relative builds work in subfolders and local file deployments.

## Project layout (key files)
- `web/index.html` — App entry HTML
- `web/src/main.js` — App bootstrap
- `web/src/App.svelte` — Top-level app component
- `web/src/components/` — UI components (UploadZone, ProcessControls, PsychroChart, TimeSeriesChart, etc.)
- `web/src/utils/` — CSV parsing, aggregation, and helper utilities
- `web/src/stores/fileStore.js` — Canonical file and UI store for parsed rows, mapping configuration, and results
- `web/vite.config.js` — Vite configuration (base path, build options)
- `web/package.json` — Local package.json and scripts

## CSV expectations & sample data
- The app expects CSV rows with a timestamp and two measured columns (temperature and relative humidity). Auto-detection looks for column names matching common patterns, but mappings can be overridden in the UI.
  - Timestamp column names: `time`, `date`, `datetime`, `timestamp`, etc.
  - Temperature column names: `temp`, `temperature` (with or without 'c' or 'f' suffixes)
  - Relative humidity column names: `rh`, `humidity`
- Sample data for quick testing: `open-meteo-test.csv` in the repository root. Use the sample CSV to confirm the psychrometric chart behavior and time-series aggregation.

### Sample CSV formats (examples)
The application supports UTF-8 CSV files and will attempt to auto-detect date/time columns, temperature, and relative humidity columns.

Example CSV (timestamps in full ISO 8601 with timezone):
```csv
time,temperature_2m,relative_humidity_2m
2025-11-03T00:00:00+00:00,9.5,93
2025-11-03T01:00:00+00:00,8.8,93
2025-11-03T02:00:00+00:00,8.6,95
```

Example CSV (UTC timestamps without timezone):
```csv
datetime,temp_c,rh
2025-11-03T00:00,9.5,93
2025-11-03T01:00,8.8,93
```

Column mapping notes:
- If your CSV uses different names (e.g., `temp_C`, `temperature_celsius`, `rh_pct`), use the `ProcessControls` UI to map them to the app’s internal field names.
- If your timestamps are in local time without timezone, the app assumes local browser timezone — consider converting to UTC for consistent behavior.

## Troubleshooting
- If you see build errors, verify your Node version is >= 21.
- If the dev server port is in use, Vite will select another port — check the CLI output for the URL.
- If files aren’t hot-reloading, ensure you’re editing files under `web/src/` and the dev server console shows changes.

## Contributing & Developer notes
- Please follow the repo-level contribution guidelines (PRs, branch naming, and commit conventions) in the project root.
- When making UI or behavior changes, prefer updating/adding components under `web/src/components` and central state in `web/src/stores/fileStore.js`.
- This sub-project has no automated front-end test runner configured; manual testing via `npm run dev` is the recommended approach for now.

## License
Check the repo-level `LICENSE` file at the project root.

---

If you’d like me to add a `lint`, `test` or `format` script, or to include GitHub Actions for building the web app on PRs, I can add/update the `web/package.json` and a small CI workflow to complement this README.

````
# Passive Design Tactics — Web UI

A Svelte 5 + Vite single-page app for browser-based analysis of timestamped temperature and relative-humidity CSV data (streaming parsing, psychrometric charts, time-series aggregation, and export).

## Features
- Streaming CSV processing (large-file friendly)
- Drag-and-drop upload with automatic column detection
- Interactive psychrometric chart + time-series visualizations
- Multi-period aggregation (hourly/daily/weekly/monthly)
- Export processed data (CSV / JSON / Markdown)

## Prerequisites
- Node.js 21+ (or a recent stable Node.js)
- npm (bundled with Node.js)

## Installation
Run from the project `web/` directory:

```bash
cd web
npm install
```

If you need deterministic installs in CI use:

```bash
npm ci
```

## Development
Start the Vite dev server:

```bash
npm run dev
```

By default Vite serves on `http://localhost:5173` (or the next available port).

## Build (production)
Create a production build:

```bash
npm run build
```

Build output is placed in `dist/`.

## Preview production build
Serve the built app locally:

```bash
npm run preview
```

## Where the source lives
- Entry: [`web/src/main.js`](web/src/main.js:1)  
- Top-level app component: [`web/src/App.svelte`](web/src/App.svelte:1)  
- HTML template: [`web/index.html`](web/index.html:1)  
- Vite config: [`web/vite.config.js`](web/vite.config.js:1)  
- Package metadata & scripts: [`web/package.json`](web/package.json:1)

Key components:
- [`web/src/components/UploadZone.svelte`](web/src/components/UploadZone.svelte:1) — CSV drag-and-drop & file input
- [`web/src/components/ProcessControls.svelte`](web/src/components/ProcessControls.svelte:1) — Processing options UI
- [`web/src/components/PsychroChart.svelte`](web/src/components/PsychroChart.svelte:1) — Psychrometric visualization
- [`web/src/components/TimeSeriesChart.svelte`](web/src/components/TimeSeriesChart.svelte:1) — Time-series charts
- [`web/src/utils/dataProcessor.js`](web/src/utils/dataProcessor.js:1) — Streaming CSV parsing & aggregation logic
- [`web/src/utils/timeSeriesAggregator.js`](web/src/utils/timeSeriesAggregator.js:1) — Aggregation helpers
+ [`web/src/stores/fileStore.js`](web/src/stores/fileStore.js:1) — Canonical file and UI store
  
> Note: The app now uses `fileStore` as the single source-of-truth for file data, parsed rows, mapping configuration, and results. Any previous reference to `uiStore` has been removed and code should import from `fileStore` instead.

## CSV expectations
- A timestamp column (auto-detected by names containing "time", "date", "datetime")
- A temperature column (names with "temp" or "temperature")
- A relative-humidity column (names with "rh" or "humidity")

The app auto-detects date formats and can treat dates as UTC if configured.

## Notes & caveats
- The app runs fully client-side; no server required.
- Uses a relative base path (`./`) for deployment compatibility.
- Large CSVs are processed in chunks to avoid memory exhaustion.
- If ports conflict, Vite will choose the next available port.

## Quick checklist of important files
- [`web/package.json`](web/package.json:1)  
- [`web/vite.config.js`](web/vite.config.js:1)  
- [`web/index.html`](web/index.html:1)  
- [`web/src/main.js`](web/src/main.js:1)  
- [`web/src/App.svelte`](web/src/App.svelte:1)  
- [`web/src/utils/dataProcessor.js`](web/src/utils/dataProcessor.js:1)  
- [`web/src/components/UploadZone.svelte`](web/src/components/UploadZone.svelte:1)