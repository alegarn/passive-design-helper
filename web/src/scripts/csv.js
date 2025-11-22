// Refactor derived from logic.js
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

function parseHeader(lines) {
  if (lines.length === 0) {
    throw new Error('No lines provided for header parsing');
  }
  
  const headerLine = lines[0];
  const headers = csvSplitLine(headerLine).map(h => h.trim().toLowerCase());
  return headers;
}

function findBestColumn(headers, candidates) {
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => h.includes(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}

export { csvSplitLine, parseHeader, findBestColumn };
