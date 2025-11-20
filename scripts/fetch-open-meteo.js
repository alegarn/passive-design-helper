#!/usr/bin/env node
/**
 * CLI utility to fetch historical weather data from Open-Meteo API
 * and save it to a local file.
 * 
 * Usage:
 *   node scripts/fetch-open-meteo.js [options]
 * 
 * Options:
 *   --url <url>              API URL to fetch (required if not using --lat/--lon)
 *   --lat <latitude>         Latitude for API request
 *   --lon <longitude>        Longitude for API request
 *   --start <YYYY-MM-DD>     Start date for historical data
 *   --end <YYYY-MM-DD>       End date for historical data
 *   --hourly <variables>      Comma-separated hourly variables (default: temperature_2m,relative_humidity_2m)
 *   --out <path>             Output file path (default: open-meteo-data.json)
 *   --format <json|csv>      Output format (default: json)
 *   -h, --help               Show this help
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./io');

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
  const result = {
    url: null,
    lat: null,
    lon: null,
    start: null,
    end: null,
    hourly: 'temperature_2m,relative_humidity_2m',
    out: 'open-meteo-data.json',
    format: 'json',
    help: false
  };

  function argVal(name) {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  }

  if (argv.includes('-h') || argv.includes('--help')) {
    result.help = true;
    return result;
  }

  result.url = argVal('--url');
  result.lat = argVal('--lat');
  result.lon = argVal('--lon');
  result.start = argVal('--start');
  result.end = argVal('--end');
  result.hourly = argVal('--hourly') || result.hourly;
  result.out = argVal('--out') || result.out;
  result.format = (argVal('--format') || 'json').toLowerCase();

  if (!['json', 'csv'].includes(result.format)) {
    throw new Error('Invalid format. Must be json or csv');
  }

  return result;
}

/**
 * Build Open-Meteo API URL from parameters
 */
function buildApiUrl(params) {
  const baseUrl = 'https://archive-api.open-meteo.com/v1/archive';
  const query = new URLSearchParams({
    latitude: params.lat,
    longitude: params.lon,
    start_date: params.start,
    end_date: params.end,
    hourly: params.hourly
  });
  return `${baseUrl}?${query.toString()}`;
}

/**
 * Fetch data from URL using Node.js HTTP modules
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    
    const req = client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          // If not JSON, return raw string
          resolve(data);
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Convert Open-Meteo JSON response to CSV format
 */
function jsonToCsv(data) {
  if (!data || !data.hourly || !data.hourly.time) {
    throw new Error('Invalid API response structure');
  }

  // Use hourly variables from the data, not from hourly_units to avoid duplicate 'time'
  const variables = Object.keys(data.hourly).filter(k => k !== 'time');
  const headers = ['time', ...variables];
  const rows = [];

  // Header row
  rows.push(headers.join(','));

  // Data rows
  const timeArray = data.hourly.time;
  const numRecords = timeArray.length;

  for (let i = 0; i < numRecords; i++) {
    const row = [timeArray[i]];
    for (const key of variables) {
      const value = data.hourly[key] && data.hourly[key][i] !== null ? data.hourly[key][i] : '';
      row.push(value);
    }
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`CLI utility to fetch historical weather data from Open-Meteo API

Usage:
  node scripts/fetch-open-meteo.js [options]

Options:
  --url <url>              API URL to fetch (required if not using --lat/--lon)
  --lat <latitude>         Latitude for API request
  --lon <longitude>        Longitude for API request
  --start <YYYY-MM-DD>     Start date for historical data
  --end <YYYY-MM-DD>       End date for historical data
  --hourly <variables>      Comma-separated hourly variables (default: temperature_2m,relative_humidity_2m)
  --out <path>             Output file path (default: open-meteo-data.json)
  --format <json|csv>      Output format (default: json)
  -h, --help               Show this help

Examples:
  # Using direct URL
  node scripts/fetch-open-meteo.js --url "https://archive-api.open-meteo.com/v1/archive?latitude=52.52&longitude=13.41&start_date=2025-11-03&end_date=2025-11-17&hourly=temperature_2m,relative_humidity_2m" --out weather.json

  # Using parameters
  node scripts/fetch-open-meteo.js --lat 52.52 --lon 13.41 --start 2025-11-03 --end 2025-11-17 --hourly temperature_2m,relative_humidity_2m --out weather.csv --format csv
`);
}

/**
 * Main function
 */
async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    
    if (args.help) {
      printHelp();
      return;
    }

    let url = args.url;
    
    if (!url) {
      if (!args.lat || !args.lon || !args.start || !args.end) {
        throw new Error('Missing required parameters. Provide --url or --lat, --lon, --start, and --end');
      }
      url = buildApiUrl(args);
    }

    console.log('Fetching data from:', url);
    const data = await fetchUrl(url);
    
    let output;
    if (args.format === 'csv') {
      if (typeof data === 'string') {
        output = data;
      } else {
        output = jsonToCsv(data);
      }
    } else {
      output = JSON.stringify(data, null, 2);
    }

    const outputPath = path.resolve(args.out);
    writeFileAtomic(outputPath, output);
    
    console.log(`Data saved to: ${outputPath}`);
    console.log(`Format: ${args.format}`);
    
    if (typeof data === 'object' && data.hourly) {
      const recordCount = data.hourly.time ? data.hourly.time.length : 0;
      console.log(`Records fetched: ${recordCount}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, parseArgs, fetchUrl, jsonToCsv };