// Simple test for export format normalization
// This can be run with node to verify our logic

function normalizeExportFormat(format) {
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
    'text': 'md', // Common mistake
    'csv': 'csv',
    'json': 'json'
  };
  
  return variations[normalized] || normalized;
}

// Test cases
const testCases = [
  { input: 'csv', expected: 'csv' },
  { input: 'CSV', expected: 'csv' },
  { input: '.csv', expected: 'csv' },
  { input: 'json', expected: 'json' },
  { input: 'JSON', expected: 'json' },
  { input: '.json', expected: 'json' },
  { input: 'md', expected: 'md' },
  { input: 'markdown', expected: 'md' },
  { input: 'text/csv', expected: 'csv' },
  { input: 'application/json', expected: 'json' },
  { input: 'text/markdown', expected: 'md' },
  { input: 'text', expected: 'md' },
  { input: 'xml', expected: 'xml' }, // Should pass through unchanged
  { input: '', expected: '' },
  { input: null, expected: null },
  { input: undefined, expected: undefined }
];

console.log('Testing export format normalization...');
let passed = 0;
let failed = 0;

testCases.forEach(({ input, expected }, index) => {
  const result = normalizeExportFormat(input);
  if (result === expected) {
    console.log(`✓ Test ${index + 1}: "${input}" → "${result}"`);
    passed++;
  } else {
    console.log(`✗ Test ${index + 1}: "${input}" → "${result}" (expected "${expected}")`);
    failed++;
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('All tests passed! ✅');
  process.exit(0);
} else {
  console.log('Some tests failed! ❌');
  process.exit(1);
}