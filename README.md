# Passive Design Tactics

A comprehensive tool for analyzing passive design strategies using weather data and psychrometric charts. This project provides both CLI and web interfaces for fetching and analyzing historical weather data from Open-Meteo.

## Features

- 🌤️ Fetch historical weather data from Open-Meteo API
- 📊 Generate psychrometric charts and visualizations
- 🖥️ Both CLI and web-based interfaces
- 📁 Support for multiple output formats (JSON, CSV)
- 📈 Time series analysis with zone classification

## Quick Start

### CLI Usage

#### Using Direct URL
```bash
node scripts/fetch-open-meteo.js \
  --url "https://archive-api.open-meteo.com/v1/archive?latitude=52.52&longitude=13.41&start_date=2025-11-03&end_date=2025-11-17&hourly=temperature_2m,relative_humidity_2m" \
  --out weather-data.json \
  --format json
```

#### Using Parameters
```bash
node scripts/fetch-open-meteo.js \
  --lat 52.52 \
  --lon 13.41 \
  --start 2025-11-03 \
  --end 2025-11-17 \
  --hourly temperature_2m,relative_humidity_2m \
  --out weather-data.csv \
  --format csv
```

#### CLI Help
```bash
node scripts/fetch-open-meteo.js --help
```

### Web Interface

1. Start the development server:
```bash
cd web
npm install
npm run dev
```

2. Open your browser to `http://localhost:5173`

3. Use the "Fetch Open-Meteo Weather Data" component to:
   - Enter API parameters directly
   - Choose between JSON and CSV output
   - Download data directly to your browser

## Available Components

### CLI Tools

- **`scripts/fetch-open-meteo.js`** - Fetch weather data from Open-Meteo API
- **`scripts/cli.js`** - Main CLI for processing weather data
- **`tactics-cli.js`** - Entry point for the CLI application

### Web Components

- **`FetchOpenMeteo.svelte`** - Web component for fetching weather data
- **`UploadZone.svelte`** - File upload component
- **`ProcessControls.svelte`** - Data processing controls
- **`PsychroChart.svelte`** - Psychrometric chart visualization
- **`TimeSeriesChart.svelte`** - Time series chart component

### Frontend / Stores

- **`fileStore.js`** - Central state management for file data and operations
- Legacy store shims (fileData, loading, error) removed — use fileStore API and derived selectors (timeSeries, aggregationSummary, isLoading, lastError). See [`web/src/stores/fileStore.js`](web/src/stores/fileStore.js) for migration details.

## API Reference

### Open-Meteo API Parameters

- **latitude** (required): Latitude in decimal degrees
- **longitude** (required): Longitude in decimal degrees
- **start_date** (required): Start date in YYYY-MM-DD format
- **end_date** (required): End date in YYYY-MM-DD format
- **hourly** (required): Comma-separated list of hourly variables

### Common Hourly Variables

- `temperature_2m` - Air temperature at 2 meters above ground
- `relative_humidity_2m` - Relative humidity at 2 meters above ground
- `dew_point_2m` - Dew point temperature at 2 meters above ground
- `precipitation` - Total precipitation
- `wind_speed_10m` - Wind speed at 10 meters above ground

## Output Formats

### JSON Format
```json
{
  "latitude": 52.52,
  "longitude": 13.41,
  "hourly": {
    "time": ["2025-11-03T00:00", "2025-11-03T01:00", ...],
    "temperature_2m": [9.5, 8.8, ...],
    "relative_humidity_2m": [93, 93, ...]
  }
}
```

### CSV Format
```csv
time,temperature_2m,relative_humidity_2m
2025-11-03T00:00,9.5,93
2025-11-03T01:00,8.8,93
...
```

## Testing

### CLI Tests
Run the automated test suite:
```bash
./test-fetch-cli.sh
```

This script tests:
- Direct URL fetching
- Parameter-based fetching
- JSON and CSV output formats
- Error handling
- Help functionality

### Manual Testing

1. **CLI Testing**:
   ```bash
   # Test with your location
   node scripts/fetch-open-meteo.js --lat YOUR_LAT --lon YOUR_LON --start 2025-01-01 --end 2025-01-31 --hourly temperature_2m,relative_humidity_2m --out test.csv --format csv
   ```

2. **Web Testing**:
   - Start the web server
   - Test the fetch component with different parameters
   - Verify downloads work correctly

## Integration Examples

### Integration with Existing Workflow

#### 1. CLI Workflow
```bash
# Fetch weather data
node scripts/fetch-open-meteo.js --lat 52.52 --lon 13.41 --start 2025-01-01 --end 2025-12-31 --hourly temperature_2m,relative_humidity_2m --out yearly-data.csv --format csv

# Process with tactics CLI
node tactics-cli.js yearly-data.csv --format md --out summary.md --json summary.json
```

#### 2. Web Workflow
1. Use the web interface to fetch data
2. The fetched data automatically integrates with the psychrometric chart
3. Export visualizations as needed

## Troubleshooting

### Common Issues

1. **CORS Errors**: The web interface uses direct browser fetching. If you encounter CORS issues, you can use the optional proxy server:
   ```bash
   cd server
   npm install
   npm start
   ```

2. **Invalid Date Ranges**: Ensure start_date is before end_date and both are in valid YYYY-MM-DD format.

3. **Rate Limiting**: Open-Meteo has rate limits. For large datasets, consider breaking requests into smaller date ranges.

### Debug Mode

For CLI debugging, add verbose logging:
```bash
DEBUG=* node scripts/fetch-open-meteo.js --your-parameters
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Related Links

- [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api)
- [Psychrometric Chart Theory](https://en.wikipedia.org/wiki/Psychrometrics)
- [Passive Design Strategies](https://www.wbdg.org/design-objectives/sustainable/passive-design)

## File Structure

```
├── scripts/                 # CLI utilities
│   ├── fetch-open-meteo.js # Open-Meteo fetcher
│   ├── cli.js              # Main CLI logic
│   └── ...                # Other utilities
├── web/                    # Web interface
│   ├── src/
│   │   └── components/     # Svelte components
│   └── package.json
├── server/                 # Optional proxy server
│   ├── fetch-proxy.js      # Express proxy
│   └── package.json
├── test-fetch-cli.sh       # Test suite
└── README.md
