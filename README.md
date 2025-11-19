# passive-design-helper

Passive-design-helper analyzes timestamped temperature and relative-humidity CSV time series and recommends passive cooling / humidity-control tactics for tropical climates (typical mean T ≈ 28°C). It classifies datapoints into zones (Comfort, Ventilation, Mass Cooling, Evaporative Cooling, Air Conditioning ± Dehumidifier, etc.), produces a timeline-ready timeseries CSV and compact summaries (MD/TXT/CSV/JSON) suitable for reports and plotting.

Contents
- Overview
- Features
- Quick start
- Input CSV format & column detection
- Zones & classification
- Outputs
- Web Application
- Troubleshooting
- Development & testing
- License

Overview
--------
This repository provides both a Node.js CLI and a modern web application that:
- Parses timestamped temperature and relative-humidity CSVs using memory-efficient streaming
- Classifies each datapoint into a "tactic" zone based on temperature and relative humidity polytopes
- Aggregates duration per zone and per time bucket (month / day / hour)
- Writes a timeseries CSV suitable for plotting and a human-readable summary (MD/TXT/CSV) and optional JSON output
- Detects data span and granularity automatically for optimal analysis

The CLI workflow is command-line driven: point to a CSV (or let the tool pick one), verify detected columns and date format (interactive by default), then inspect the generated summary and timeseries files.

The web application provides an intuitive browser-based interface with drag-and-drop upload, real-time processing feedback, and interactive data visualization.

Features
--------
- Robust CSV header/column detection with interactive overrides
- Heuristics for ambiguous date formats (day-first vs month-first)
- Optional non-interactive `--auto` mode for scripting
- Streaming processing to handle large files without high memory use
- Data span detection with confidence scoring
- Multiple summary formats: Markdown, plain text, CSV, and JSON
- Default outputs: timeseries CSV for plotting and a summary report
- Modern web interface with streaming processing capabilities

Quick start
-----------
Run the CLI interactively:
```bash
node tactics-cli.js path/to/your.csv
```

Run with explicit options:
```bash
node tactics-cli.js [input.csv] --format md --out tactics_summary.md --ts tactics_timeseries.csv --json tactics_summary.json
```

Common flags:
- `--auto` : non-interactive mode (trust detections)
- `--assume-day-first` : prefer day-first date parsing
- `--utc` : treat parsed datetimes as UTC
- `--ts <path>` : path for timeseries CSV (default: ./tactics_timeseries.csv)
- `--format, -f <md|txt|csv|json>` : summary format for the human-readable summary
- `--out, -o <path>` : summary file path
- `--json, -j [path]` : write JSON summary; when passed without a path the CLI writes `./tactics_summary.json` by default
- `--no-ts` : skip writing the timeseries CSV
- `--only <csv|md|txt|json>` : produce only a single output type (e.g., `--only json`)

Implementation entrypoints:
- CLI wrapper: [`tactics-cli.js`](tactics-cli.js:1)
- Orchestrator: [`scripts/cli.js`](scripts/cli.js:1)

Input CSV format & column detection
----------------------------------
Required columns (auto-detected when possible):
- Timestamp (header suggestions: `time`, `date`, `datetime`, `timestamp`, ...)
- Temperature (header suggestions: `temp`, `temperature`, `t`, `drybulb`, ...)
- Relative humidity (header suggestions: `rh`, `humidity`, `relative_humidity`, `%rh`, ...)

An example dataset is included:
- [`2024_04_si_samrong_hourly.csv`](2024_04_si_samrong_hourly.csv:1)

The CLI lists detected headers and allows you to override indices in interactive mode. When timestamps are ambiguous (e.g., `01/04/2024`), the tool applies heuristics to guess day-first vs month-first and asks for confirmation unless `--auto` is used.

Zones & classification
----------------------
Zone definitions and classification are implemented in:
- [`scripts/zones.js`](scripts/zones.js:1) — zone polytopes, colors, notes
- [`scripts/classify.js`](scripts/classify.js:1) — point-in-polygon tests and energy-priority tie-break

Zones include (energy-priority ordering):
- Comfort
- Ventilation
- Mass Cooling
- Evaporative Cooling
- Air Conditioning + Dehumidifier
- Air Conditioning
- Cold
- Unclassified

Each data point (temperature, RH) is tested against zone polytopes. If multiple zones match, the system selects the least-energy option according to a priority list.

Outputs
-------
Default outputs:
- Timeseries CSV for plotting: `tactics_timeseries.csv` (columns: datetime,temperature,humidity,zone,color)
- Summary report: Markdown/TXT/CSV (e.g., `tactics_summary.md`)
- Optional JSON summary: `tactics_summary.json` (written when `--json` is used; default file path shown above if no path supplied)

Summary report includes:
- Global aggregated hours per zone and percent of time
- Timeline breakdown per month/day/hour depending on data span
- Detected sampling information (median interval)

Troubleshooting
---------------
- Date parsing: multiple strategies are attempted (ISO, dd/mm/yyyy, mm/dd/yyyy, epoch). Use `--assume-day-first` to force day-first parsing. See [`scripts/dateParser.js`](scripts/dateParser.js:1).
- Timezone handling: interactive prompt asks local vs UTC; use `--utc` to force UTC in non-interactive runs.
- Large files: the refactored CLI streams input and can write the timeseries incrementally.
- Missing columns / malformed rows: rows with non-numeric temperature or humidity are skipped. Verify input CSV quality.

Development & testing
---------------------
Run CLI locally:
```bash
# from repository root
node tactics-cli.js path/to/data.csv
```

Programmatic invocation:
```js
const { run } = require('./scripts/cli');
run({ inputPath: './2024_04_si_samrong_hourly.csv', auto: true }).then(console.log).catch(console.error);
```

Quick test helper:
```bash
sh scripts/test-run.sh
```

Development notes
- Node.js LTS recommended for the CLI (v21+). The CLI uses only built-in Node modules and has no runtime external dependencies listed.
- The web application (found in [`web/`](web/)) requires Node.js + npm (or yarn) for development; see [`web/package.json`](web/package.json:1) for dev-time dependencies and scripts.
- The project is modular; prefer changing `scripts/*` modules and adding unit tests for parsing/classification logic.
- Tests: add simple fixtures in `test/` and use `node` or your preferred test runner to validate `parseTimestamp`, `classifyPoint`, and aggregator behaviour.

Code structure (high level)
- [`scripts/cli.js`](scripts/cli.js:1) — orchestration, argument parsing, streaming
- [`scripts/args.js`](scripts/args.js:1) — argument parsing helpers
- [`scripts/csv.js`](scripts/csv.js:1) — CSV helpers
- [`scripts/dateParser.js`](scripts/dateParser.js:1) — robust timestamp parsing & heuristics
- [`scripts/io.js`](scripts/io.js:1) — file I/O helpers (stream wrappers, atomic writes)
- [`scripts/aggregate.js`](scripts/aggregate.js:1) — duration computation, bucket aggregation, streaming aggregator
- [`scripts/output.js`](scripts/output.js:1) — timeseries and summary formatting
- [`scripts/zones.js`](scripts/zones.js:1) & [`scripts/classify.js`](scripts/classify.js:1) — zone definitions and classification
- [`logic.js`](logic.js:1) — original single-file CLI (kept for reference)
- [`tactics-cli.js`](tactics-cli.js:1) — thin entrypoint invoking the refactor

Web Application
---------------

A modern Svelte5-based web application is available in the [`web/`](web/) directory, providing:

- **Streaming CSV Processing**: Memory-efficient chunk-based processing for large files
- **Interactive UI**: Drag-and-drop file upload with real-time feedback
- **Data Span Detection**: Automatic detection of time range and data granularity
- **Column Mapping**: Interactive column selection with auto-detection
- **Export Options**: Generate CSV, JSON, and Markdown reports
- **Visualization**: Psychrometric charts and zone analysis

For detailed documentation on the web application, see [`web/README.md`](web/README.md).

Quick start with the web app:
```bash
cd web
npm install
npm run dev
```
Then open your browser to the provided localhost URL.

Contributing
------------
- Fork the repo, make changes, and open a pull request.
- Keep changes modular and add tests where practical.
- Run linters/tests before submitting.

License
-------
This project is provided under the terms in [`LICENSE`](LICENSE:1).
