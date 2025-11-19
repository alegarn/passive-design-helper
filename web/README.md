# Passive Design Tactics Web UI

A modern Svelte + Vite application for the Passive Design Tactics tool with streaming CSV processing capabilities.

## Overview

The web application provides a user-friendly interface for analyzing timestamped temperature and relative-humidity CSV time series data. It features memory-efficient streaming processing that can handle large files without loading the entire file into memory.

## Key Features

- **Streaming CSV Processing**: Memory-efficient chunk-based processing for large files
- **Data Span Detection**: Automatic detection of time range, data frequency, and granularity
- **Interactive UI Components**: Drag-and-drop file upload and intuitive controls
- **Multiple Export Formats**: Generate CSV, JSON, and Markdown reports
- **Real-time Analysis**: Process and visualize data without full file loading

## Getting Started

```bash
cd web
npm install
npm run dev
```

## Building

```bash
npm run build
```

The build output will be in the `dist/` directory, which can be served with an MCP server.

## Development

- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm run preview` - Preview the production build

## Streaming CSV Processing

The application uses a memory-efficient streaming approach to process CSV files:

### parseCsvStream

Extracts header and sample rows without reading the entire file into memory:

```javascript
import { parseCsvStream } from './src/utils/dataProcessor.js';

const result = await parseCsvStream(file, {
  sampleRows: 50,        // Number of sample rows to collect
  headerRowIndex: 0,      // Index of header row
  encoding: 'utf-8'       // Text encoding
});

// Returns: {
//   headerFields: string[],
//   sampleRows: string[],
//   dayFirst: boolean,
//   samplesUsed: number,
//   minDate: Date,
//   maxDate: Date,
//   estimatedSpanDays: number,
//   samplesPerDay: number
// }
```

### aggregateCsvStream

Processes the entire file using streaming aggregation without loading it into memory:

```javascript
import { aggregateCsvStream } from './src/utils/dataProcessor.js';

const result = await aggregateCsvStream(file, classifyRow, {
  timelineUnit: 'auto',           // 'auto', 'hour', 'day', or 'month'
  deltaReservoirSize: 2000,        // Size of delta reservoir for median calculation
  rowSampleLimitForOutput: 500,    // Limit of rows to store with duration
  capMultiplier: 4,                // Duration cap multiplier
                                   // Caps per-row durations to medianInterval × multiplier to avoid counting large timestamp gaps
  treatAsUTC: false,               // Treat dates as UTC
  preferDayFirst: null             // Force day-first parsing
});

// Returns aggregation result with perBucket, summary, rowsWithDur, etc.
```

### detectDataSpan

Analyzes timestamps to determine time range, granularity, and consistency:

```javascript
import { detectDataSpan } from './src/utils/dataProcessor.js';

const dataSpan = detectDataSpan(timestamps, {
  confidenceThreshold: 0.8    // Minimum confidence threshold
});

// Returns: {
//   minDate: string,
//   maxDate: string,
//   totalDays: number,
//   likelyGranularity: 'hour' | 'day' | 'month',
//   dataDescription: string,
//   confidence: number
// }
```

### exportAllFiles

Generates and downloads all export file types:

```javascript
import { exportAllFiles } from './src/utils/dataProcessor.js';

const blobs = exportAllFiles(baseName, aggregationResult, {
  includeRowsWithDur: false,   // Include rowsWithDur in JSON
  includeDur: true,             // Include duration in CSV
  tsIso: true                   // Use ISO timestamp format
});

// Downloads: baseName_time_series.csv, baseName_summary.json, baseName_summary.md
```

## UI Components

### UploadZone Component

Features:
- Drag-and-drop file upload with visual feedback
- Streaming CSV parsing for immediate header detection
- Automatic date format detection (day-first vs month-first)
- File validation and error handling

Usage:
```svelte
<UploadZone onfileparsed={handleFileParsed} />
```

### ProcessControls Component

Features:
- Column mapping with auto-detection
- Data span visualization with confidence indicators
- Processing options (timeline unit, UTC handling, duration capping)
- Export controls for multiple file formats
- Real-time processing feedback

Usage:
```svelte
<ProcessControls
  file={fileData.file}
  headerFields={fileData.headerFields}
  sampleRows={fileData.sampleRows}
  dayFirst={fileData.dayFirst}
  dataSpanInfo={fileData.dataSpanInfo}
/>
```

## Data Span Detection

The application automatically analyzes uploaded CSV files to determine:

- **Time Range**: First and last timestamps in the data
- **Granularity**: Hourly, daily, or monthly data patterns
- **Confidence**: Consistency of time intervals between data points
- **Description**: Human-readable summary of the data span

The detection algorithm samples timestamps from the file and analyzes patterns to determine the most likely data granularity. A confidence score indicates how regular the time intervals are.

## Testing

The application includes comprehensive test files for streaming functionality:

- `test-streaming.js` - Tests streaming CSV parsing and aggregation
- `test-data-span-detection.js` - Tests data span detection algorithms
- `test-ui-integration.js` - Tests UI component integration

To run tests:
```bash
node test-streaming.js
node test-data-span-detection.js
node test-ui-integration.js
```

Note: Test files use sample CSV data but do not read entire CSV files during testing.