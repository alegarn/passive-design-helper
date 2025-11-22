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