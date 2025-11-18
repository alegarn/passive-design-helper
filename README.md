# passive-design-helper

Passive-design-helper analyzes timestamped temperature and relative-humidity CSV time series and recommends passive cooling / humidity-control tactics for tropical climates (typical mean T ≈ 28°C). It classifies datapoints into zones (Comfort, Ventilation, Mass Cooling, Evaporative Cooling, Air Conditioning ± Dehumidifier, etc.), produces a timeline-ready timeseries CSV and compact summaries (MD/TXT/CSV/JSON) suitable for reports and plotting.

Contents
- Overview
- Features
- Quick start
- Input CSV format & column detection
- Zones & classification
- Outputs
- Troubleshooting
- Development & testing
- License

Overview
--------
This repository provides a small Node.js CLI that:
- Parses timestamped temperature and relative-humidity CSVs
- Classifies each datapoint into a "tactic" zone based on temperature and relative humidity polytopes
- Aggregates duration per zone and per time bucket (month / day / hour)
- Writes a timeseries CSV suitable for plotting and a human-readable summary (MD/TXT/CSV) and optional JSON output

The typical workflow is command-line driven: point to a CSV (or let the tool pick one), verify detected columns and date format (interactive by default), then inspect the generated summary and timeseries files.

Features
--------
- Robust CSV header/column detection with interactive overrides
- Heuristics for ambiguous date formats (day-first vs month-first)
- Optional non-interactive `--auto` mode for scripting
- Streaming processing to handle large files without high memory use
- Multiple summary formats: Markdown, plain text, CSV, and JSON
- Default outputs: timeseries CSV for plotting and a summary report

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
- `--format, -f <md|txt|csv>` : summary format
- `--out, -o <path>` : summary file path
- `--json, -j [path]` : write JSON summary (optional path)
- `--no-ts` : skip timeseries CSV
- `--only <csv|md|txt|json>` : produce only a single output type

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
- Optional JSON summary: `tactics_summary.json`

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
- Node.js LTS recommended (v16+).
- No external dependencies required beyond standard Node.js modules.
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

Contributing
------------
- Fork the repo, make changes, and open a pull request.
- Keep changes modular and add tests where practical.
- Run linters/tests before submitting.

License
-------
This project is provided under the terms in [`LICENSE`](LICENSE:1).
