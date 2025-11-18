// Refactor derived from logic.js
/**
 * Split a CSV line handling quoted fields and escaped quotes
 * @param {string} line - CSV line to split
 * @returns {string[]} Array of field values
 */
function csvSplitLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' ) {
      if (inQuotes && line[i+1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Parse CSV header and return normalized headers
 * @param {string[]} lines - Array of CSV lines (first line should be header)
 * @returns {string[]} Normalized headers (lowercased, trimmed)
 */
function parseHeader(lines) {
  if (lines.length === 0) {
    throw new Error('No lines provided for header parsing');
  }
  
  const headerLine = lines[0];
  const headers = csvSplitLine(headerLine).map(h => h.trim().toLowerCase());
  return headers;
}

/**
 * Find the best column index for a given set of candidate names
 * @param {string[]} headers - Normalized headers array
 * @param {string[]} candidates - Array of candidate column names
 * @returns {number} Column index or -1 if not found
 */
function findBestColumn(headers, candidates) {
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => h.includes(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}

export { csvSplitLine, parseHeader, findBestColumn };