// Refactor derived from logic.js
/**
 * Parse command line arguments for tactics CLI
 * @param {string[]} argv - Command line arguments (process.argv.slice(2))
 * @returns {Object} Parsed arguments object
 * @throws {Error} With 'ArgError:' prefix for invalid argument combinations
 */
function parseArgs(argv) {
  const result = {
    auto: false,
    assumeDayFirst: false,
    utc: false,
    tsPath: null,
    format: null,
    outPath: null,
    jsonPath: null,
    only: null,
    noTs: false,
    choose: false,
    select: null,
    inputPath: null,
    help: false
  };

  // Helper function to get argument value
  function argVal(name) {
    const i = argv.indexOf(name);
    if (i >= 0 && argv[i+1] && !argv[i+1].startsWith('--')) return argv[i+1];
    return null;
  }

  // Check for help flag first
  if (argv.includes('-h') || argv.includes('--help')) {
    result.help = true;
    return result;
  }

  // Parse boolean flags
  result.auto = argv.includes('--auto');
  result.assumeDayFirst = argv.includes('--assume-day-first');
  result.utc = argv.includes('--utc');
  result.noTs = argv.includes('--no-ts');
  result.choose = argv.includes('--choose') || argv.includes('--auto-choose');

  // Parse values
  result.only = argVal('--only');
  result.select = argVal('--select');
  result.format = (argVal('--format') || argVal('-f') || '').toLowerCase();
  result.outPath = argVal('--out') || argVal('-o');
  result.tsPath = argVal('--ts');

  // Parse JSON path
  const jsonIdx = argv.indexOf('--json') >= 0 ? argv.indexOf('--json') : (argv.indexOf('-j') >= 0 ? argv.indexOf('-j') : -1);
  if (jsonIdx >= 0) {
    if (argv[jsonIdx+1] && !argv[jsonIdx+1].startsWith('--')) {
      result.jsonPath = argv[jsonIdx+1];
    } else {
      result.jsonPath = null; // Will use default later
    }
  }

  // Parse input path: find the first standalone argument that is not a flag or a flag value
  const flagsWithValue = new Set(['--ts', '--format', '-f', '--out', '-o', '--json', '-j', '--select', '--only']);
  result.inputPath = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;

    // If this token is a flag, skip its value (if any) and continue
    if (a.startsWith('-')) {
      if (flagsWithValue.has(a) && i + 1 < argv.length) {
        i++; // skip the flag value
      }
      continue;
    }

    // If previous token is a flag that expects a value, this token is that flag's value, skip it
    if (i > 0) {
      const prev = argv[i - 1];
      if (prev && flagsWithValue.has(prev)) {
        continue;
      }
    }

    // First non-flag token that is not a value for a flagged option
    result.inputPath = a;
    break;
  }

  // Validate format
  if (result.format && !['md', 'txt', 'csv'].includes(result.format)) {
    throw new Error('ArgError: Invalid format. Must be md, txt, or csv');
  }

  // Validate only flag
  if (result.only && !['csv', 'md', 'txt', 'json'].includes(result.only)) {
    throw new Error('ArgError: Invalid --only value. Must be csv, md, txt, or json');
  }

  // Validate select
  if (result.select) {
    const n = Number(result.select);
    if (Number.isNaN(n) || n < 1) {
      throw new Error('ArgError: --select must be a positive integer');
    }
  }

  // Validate conflicting flags
  if (result.only && result.noTs && result.only === 'csv') {
    throw new Error('ArgError: Cannot use --only csv with --no-ts');
  }

  return result;
}

module.exports = { parseArgs };