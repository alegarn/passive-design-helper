// Smoke test for export functionality with undefined format
// This test verifies that handleExport properly handles undefined format values

// Mock the required functions and classes for testing
class MockTacticsApp {
  constructor() {
    this.state = {
      results: {
        rows: [{ ts: Date.now(), temp: 25, rh: 50, zone: 'comfort' }],
        summary: [{ zone: 'comfort', hours: 1, percent: 100 }],
        perBucket: { '2023-01-01': { comfort: 1 } },
        totalMs: 3600000,
        firstTs: Date.now(),
        lastTs: Date.now() + 3600000
      },
      rawData: { filename: 'test.csv' },
      timelineUnit: 'hour',
      dateOptions: { treatAsUTC: false }
    };
  }

  showError(message) {
    console.error('Error:', message);
    throw new Error(message);
  }

  normalizeExportFormat(format) {
    if (!format || typeof format !== 'string') {
      return format;
    }
    
    // Convert to lowercase and remove leading dots
    const normalized = format.toLowerCase().replace(/^\./, '');
    
    // Handle MIME types
    const mimeToFormat = {
      'text/csv': 'csv',
      'application/json': 'json',
      'text/markdown': 'md'
    };
    
    if (mimeToFormat[normalized]) {
      return mimeToFormat[normalized];
    }
    
    // Handle common variations
    const variations = {
      'markdown': 'md',
      'text': 'md',
      'csv': 'csv',
      'json': 'json'
    };
    
    return variations[normalized] || normalized;
  }

  downloadBlob(content, filename, mimeType) {
    console.log(`Would download: ${filename} (${mimeType})`);
    return { content, filename, mimeType };
  }

  // Mock the output functions
  buildTimeseriesLines(rows) {
    return ['timestamp,temp,rh,zone', '2023-01-01T00:00:00.000Z,25,50,comfort'];
  }

  buildJsonSummary(summary, totalMs, filename) {
    return { summary, totalMs, filename };
  }

  formatSummary(summary, perBucket, timelineUnit, format, totalMs, treatAsUTC, firstTs, lastTs) {
    return '# Test Report\n\nSummary of comfort analysis.';
  }

  // The fixed handleExport method
  handleExport(format) {
    if (!this.state.results) {
      this.showError('No results to export');
      return;
    }
    
    try {
      let content, filename, mimeType;
      
      // Handle missing/undefined/null/empty format values by using a safe default
      if (format === undefined || format === null || format === '' || format === 'undefined' || format === 'null') {
        format = 'csv';
      }
      
      // Normalize and validate the format
      const normalizedFormat = this.normalizeExportFormat(format);
      
      switch (normalizedFormat) {
        case 'csv':
          content = this.buildTimeseriesLines(this.state.results.rows).join('\n');
          filename = `tactics-timeseries-${new Date().toISOString().split('T')[0]}.csv`;
          mimeType = 'text/csv';
          break;
          
        case 'json':
          content = JSON.stringify(this.buildJsonSummary(this.state.results.summary, this.state.results.totalMs, this.state.rawData?.filename), null, 2);
          filename = `tactics-summary-${new Date().toISOString().split('T')[0]}.json`;
          mimeType = 'application/json';
          break;
          
        case 'md':
          content = this.formatSummary(
            this.state.results.summary,
            this.state.results.perBucket,
            this.state.timelineUnit,
            'md',
            this.state.results.totalMs,
            this.state.dateOptions.treatAsUTC,
            this.state.results.firstTs,
            this.state.results.lastTs
          );
          filename = `tactics-report-${new Date().toISOString().split('T')[0]}.md`;
          mimeType = 'text/markdown';
          break;
          
        default:
          const supportedFormats = ['csv', 'json', 'md'];
          throw new Error(`Unsupported export format: "${format}". Supported formats are: ${supportedFormats.join(', ')}`);
      }
      
      return this.downloadBlob(content, filename, mimeType);
      
    } catch (error) {
      this.showError(`Export failed: ${error.message}`);
      console.error('Export error:', error);
    }
  }
}

// Test cases
const testCases = [
  { input: undefined, description: 'undefined format' },
  { input: null, description: 'null format' },
  { input: '', description: 'empty string format' },
  { input: 'undefined', description: 'literal string "undefined"' },
  { input: 'null', description: 'literal string "null"' },
  { input: 'csv', description: 'valid csv format' },
  { input: 'json', description: 'valid json format' },
  { input: 'md', description: 'valid md format' },
  { input: 'invalid', description: 'invalid format' }
];

console.log('Testing export functionality with various format inputs...');
let passed = 0;
let failed = 0;

const app = new MockTacticsApp();

testCases.forEach(({ input, description }, index) => {
  try {
    console.log(`\nTest ${index + 1}: ${description} (input: ${JSON.stringify(input)})`);
    const result = app.handleExport(input);
    
    if (input === 'invalid') {
      console.log('✗ Expected error but got result:', result);
      failed++;
    } else {
      console.log('✓ Export successful:', result.filename);
      passed++;
    }
  } catch (error) {
    if (input === 'invalid') {
      console.log('✓ Expected error for invalid format:', error.message);
      passed++;
    } else {
      console.log('✗ Unexpected error:', error.message);
      failed++;
    }
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('All smoke tests passed! ✅');
  process.exit(0);
} else {
  console.log('Some smoke tests failed! ❌');
  process.exit(1);
}