// Content verification test for export functionality
// This test verifies that export formats produce the correct content type and structure

class MockTacticsApp {
  constructor() {
    this.state = {
      results: {
        rows: [
          { ts: Date.now(), temp: 25, rh: 50, zone: 'comfort' },
          { ts: Date.now() + 3600000, temp: 22, rh: 60, zone: 'comfort' }
        ],
        summary: [{ zone: 'comfort', hours: 2, percent: 100 }],
        perBucket: { '2023-01-01': { comfort: 2 } },
        totalMs: 7200000,
        firstTs: Date.now(),
        lastTs: Date.now() + 7200000
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

  // Mock the output functions to simulate the actual behavior
  buildTimeseriesLines(rows) {
    const lines = ['datetime,temperature,humidity,zone,color'];
    
    for (const row of rows) {
      const zoneColor = '#4CAF50'; // Mock color for comfort zone
      const line = [new Date(row.ts).toISOString(), row.temp, row.rh, row.zone, zoneColor].join(',');
      lines.push(line);
    }
    
    return lines;
  }

  buildJsonSummary(summary, totalMs, filename) {
    return {
      summary,
      total_hours: Number((totalMs / (1000 * 60 * 60)).toFixed(3)),
      generated_at: new Date().toISOString(),
      source: filename
    };
  }

  formatSummary(summary, perBucket, timelineUnit, format, totalMs, treatAsUTC, firstTs, lastTs) {
    let content = '';
    
    // Global summary
    if (format === 'md') {
      content += `## Summary table for all data\n\n`;
      content += `| Zone | Hours | % of time |\n| --- | ---: | ---: |\n`;
      for (const s of summary) {
        content += `| ${s.zone} | ${s.hours} | ${s.percent} % |\n`;
      }
    } else if (format === 'csv') {
      content += `# Summary table for all data\n`;
      content += 'zone,hours,percent\n';
      for (const s of summary) {
        content += `${s.zone},${s.hours},${s.percent}\n`;
      }
    } else {
      content += `Summary table for all data:\n`;
      for (const s of summary) {
        content += `${s.zone}: ${s.hours} h (${s.percent}%)\n`;
      }
    }
    
    return content;
  }

  // The handleExport method from scripts/app.js
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
  { input: 'csv', description: 'CSV export' },
  { input: 'json', description: 'JSON export' },
  { input: 'md', description: 'Markdown export' }
];

console.log('Testing export content generation...');
let passed = 0;
let failed = 0;

const app = new MockTacticsApp();

testCases.forEach(({ input, description }, index) => {
  try {
    console.log(`\nTest ${index + 1}: ${description} (input: "${input}")`);
    const result = app.handleExport(input);
    
    // Verify filename extension
    const expectedExtension = input === 'md' ? 'md' : input;
    const hasCorrectExtension = result.filename.endsWith(`.${expectedExtension}`);
    
    // Verify MIME type
    const expectedMimeTypes = {
      'csv': 'text/csv',
      'json': 'application/json',
      'md': 'text/markdown'
    };
    const hasCorrectMimeType = result.mimeType === expectedMimeTypes[input];
    
    // Verify content structure
    let hasCorrectContent = false;
    
    if (input === 'csv') {
      // CSV should contain commas and headers
      hasCorrectContent = result.content.includes(',') && result.content.includes('datetime,temperature,humidity,zone,color');
    } else if (input === 'json') {
      // JSON should be parseable and have expected structure
      try {
        const parsed = JSON.parse(result.content);
        hasCorrectContent = parsed && typeof parsed === 'object' && parsed.summary && Array.isArray(parsed.summary);
      } catch (e) {
        hasCorrectContent = false;
      }
    } else if (input === 'md') {
      // Markdown should contain markdown headers
      hasCorrectContent = result.content.includes('##') && result.content.includes('|');
    }
    
    console.log(`  Filename: ${result.filename} - ${hasCorrectExtension ? '✓' : '✗'}`);
    console.log(`  MIME type: ${result.mimeType} - ${hasCorrectMimeType ? '✓' : '✗'}`);
    console.log(`  Content structure: ${hasCorrectContent ? '✓' : '✗'}`);
    
    if (hasCorrectExtension && hasCorrectMimeType && hasCorrectContent) {
      console.log('✓ All checks passed');
      passed++;
    } else {
      console.log('✗ Some checks failed');
      failed++;
    }
    
  } catch (error) {
    console.log('✗ Unexpected error:', error.message);
    failed++;
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('All content tests passed! ✅');
  process.exit(0);
} else {
  console.log('Some content tests failed! ❌');
  process.exit(1);
}