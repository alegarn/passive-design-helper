#!/usr/bin/env node
'use strict';

/*
Interactive Node CLI to classify csv rows (datetime, temperature, relative humidity)
into tactics/zones and produce:
 - summary (hours + %)
 - timeseries CSV prepared for plotting: datetime,temperature,humidity,zone,color
Prompts for input file if not provided, lets user choose summary output format (md/txt/csv),
and optionally writes a JSON summary.

Usage:
  node tactics-cli.js [input.csv] [--ts out_timeseries.csv] [--format md|txt|csv] [--out path] [--json [path]]
*/

const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function prompt(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(q, ans => { rl.close(); resolve(ans.trim()); }));
}

function printHelp() {
  console.log('Usage: node tactics-cli.js [input.csv] [options]');
  console.log('Options:');
  console.log('  -h, --help                 Show this help and exit');
  console.log('  --auto                     Non-interactive auto mode (trust detections)');
  console.log('  --assume-day-first         Assume day-first date format when ambiguous');
  console.log('  --utc                      Treat parsed datetimes as UTC');
  console.log('  --ts <path>                Path for timeseries CSV output (default: tactics_timeseries.csv)');
  console.log('  --format, -f <md|txt|csv>  Summary output format (md, txt, csv)');
  console.log('  --out, -o <path>           Path for summary output file');
  console.log('  --json, -j [path]          Write JSON summary (optional path, default tactics_summary.json)');
  console.log('\nExamples:');
  console.log('  node tactics-cli.js data.csv --format md --out summary.md --ts timeseries.csv --json summary.json');
  console.log('  node tactics-cli.js --auto --assume-day-first sample.csv');
}

(async function main() {
  const ARGV = process.argv.slice(2);
  if (ARGV.includes('-h') || ARGV.includes('--help')) { printHelp(); process.exit(0); }
  const AUTO = ARGV.includes('--auto'); // non-interactive, trust detections
  const ASSUME_DAY_FIRST = ARGV.includes('--assume-day-first');
  const FORCE_UTC = ARGV.includes('--utc');

  function argVal(name) {
    const i = ARGV.indexOf(name);
    if (i >= 0 && ARGV[i+1] && !ARGV[i+1].startsWith('--')) return ARGV[i+1];
    return null;
  }

  let inputPath = ARGV[0] && !ARGV[0].startsWith('--') ? ARGV[0] : null;
  const formatFlag = (argVal('--format') || argVal('-f') || '').toLowerCase();
  let outPath = argVal('--out') || argVal('-o') || null;
  const outTS = argVal('--ts') || path.join(process.cwd(), 'tactics_timeseries.csv');

  // JSON output flag/option: --json [path] or -j [path]
  const jsonIdx = ARGV.indexOf('--json') >= 0 ? ARGV.indexOf('--json') : (ARGV.indexOf('-j') >= 0 ? ARGV.indexOf('-j') : -1);
  let jsonPath = null;
  if (jsonIdx >= 0) {
    if (ARGV[jsonIdx+1] && !ARGV[jsonIdx+1].startsWith('--')) jsonPath = ARGV[jsonIdx+1];
    else jsonPath = path.join(process.cwd(), 'tactics_summary.json');
  }

  // choose input if none
  if (!inputPath) {
    const files = fs.readdirSync(process.cwd()).filter(f => f.toLowerCase().endsWith('.csv'));
    if (files.length === 0) {
      if (AUTO) { console.error('No .csv found in cwd. Auto mode cannot continue.'); process.exit(1); }
      const manual = await prompt('No .csv found in cwd. Enter path to CSV file: ');
      inputPath = manual || null;
      if (!inputPath) { console.error('No input file. Exiting.'); process.exit(1); }
    } else {
      if (AUTO) {
        // choose the most recently modified CSV file deterministically
        let latest = null;
        let latestMtime = -1;
        for (const f of files) {
          try {
            const st = fs.statSync(path.join(process.cwd(), f));
            if (st.mtimeMs > latestMtime) { latestMtime = st.mtimeMs; latest = f; }
          } catch (e) { /* ignore stat errors */ }
        }
        if (!latest) { console.error('No readable CSV files found for auto mode.'); process.exit(1); }
        inputPath = path.join(process.cwd(), latest);
        console.log(`Auto mode: selected CSV '${latest}' (most recently modified)`);
      } else {
        console.log('CSV files found:');
        files.forEach((f,i) => console.log(`  [${i+1}] ${f}`));
        const ans = await prompt('Choose number or enter path: ');
        const n = Number(ans);
        if (!Number.isNaN(n) && n >= 1 && n <= files.length) inputPath = path.join(process.cwd(), files[n-1]);
        else inputPath = ans || null;
        if (!inputPath) { console.error('No input file chosen. Exiting.'); process.exit(1); }
      }
    }
  }

  if (!fs.existsSync(inputPath)) { console.error('Input file not found:', inputPath); process.exit(1); }

  // choose output format
  let outFormat = ['md','txt','csv'].includes(formatFlag) ? formatFlag : null;
  if (!outFormat) {
    const fmtAns = await prompt('Choose output format (md / txt / csv) [md]: ');
    outFormat = (fmtAns || 'md').toLowerCase();
    if (!['md','txt','csv'].includes(outFormat)) outFormat = 'md';
  }

  if (!outPath) {
    const defaultName = outFormat === 'md' ? 'tactics_summary.md' : outFormat === 'txt' ? 'tactics_summary.txt' : 'tactics_summary.csv';
    const ans = await prompt(`Output summary file path [${defaultName}]: `);
    outPath = ans || path.join(process.cwd(), defaultName);
  }

  // If JSON path not supplied via flag, ask user whether to write JSON summary
  if (jsonPath === null) {
    const jAns = await prompt('Write JSON summary as well? (y/N): ');
    if ((jAns || '').toLowerCase().startsWith('y')) {
      const ans = await prompt('JSON output path [tactics_summary.json]: ');
      jsonPath = ans || path.join(process.cwd(), 'tactics_summary.json');
    }
  }

  // ---- zone definitions (T, RH). '+' means extend to large temperature (handled below) ----
  const INF_T = 1e6;
  function p(t, rh) { if (typeof t === 'string' && t.trim().endsWith('+')) return [INF_T, Number(rh)]; return [Number(t), Number(rh)]; }

  const ZONES = [
    { id: 'Cold', color: '#88c0d0', poly: null, note: 'T < 23°C' },
    { id: 'Comfort', color: '#a3be8c', poly: [ p(23,20), p(23,80), p(25,80), p(28,67), p(29.5,50), p(29.5,20) ]},
    { id: 'Ventilation', color: '#ebcb8b', poly: [ p(23,80), p(23,100), p(29.5,100), p(34.5,50), p(34.5,20), p(29.5,20), p(29.5,50), p(28,67), p(25,80) ]},
    { id: 'Mass Cooling', color: '#5e81ac', poly: [ p(23,20), p(29.5,20), p(29.5,50), p(28,67), p(36,33), p(39.5,30), p(39.5,7) ]},
    { id: 'Evaporative Cooling', color: '#88c0d0', poly: [ p(23,20), p(29.5,20), p(29.5,50), p(28,67), p(39,30), p(42.7,20), p(43.7,10), p(43.7,0), p(31.3,0) ]},
    { id: 'Air Conditioning + Dehumidifier', color: '#bf616a', poly: [ p('34.7+',45), p('34.7+',50), p('29.8+',100) ]},
    { id: 'Air Conditioning', color: '#d08770', poly: [ p('43.7+',0), p('43.7+',6), p('47.3+',6), p('47.3+',20), p('44+',27) ]}
  ];

  function pointOnSegment(px, py, x1, y1, x2, y2) {
    const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
    if (Math.abs(cross) > 1e-8) return false;
    const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
    return dot <= 0;
  }
  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (pointOnSegment(px, py, xi, yi, xj, yj)) return true;
      const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi + 0.0) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  // classification with energy-priority tie-break (least energy consuming preferred)
  const ENERGY_PRIORITY = ['Comfort', 'Ventilation', 'Mass Cooling', 'Evaporative Cooling', 'Air Conditioning + Dehumidifier', 'Air Conditioning', 'Cold', 'Unclassified'];
  function classifyPoint(temp, rh) {
    if (temp < 23) return 'Cold';
    const matches = [];
    for (let zi = 1; zi < ZONES.length; zi++) {
      const zone = ZONES[zi];
      if (!zone.poly) continue;
      if (pointInPoly(temp, rh, zone.poly)) matches.push(zone.id);
    }
    if (matches.length === 0) {
      if (temp >= 43.7) return 'Air Conditioning';
      return 'Unclassified';
    }
    // pick match with highest priority (earliest in ENERGY_PRIORITY)
    matches.sort((a,b) => ENERGY_PRIORITY.indexOf(a) - ENERGY_PRIORITY.indexOf(b));
    return matches[0];
  }

  function csvSplitLine(line) {
    const out = []; let cur = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' ) { if (inQuotes && line[i+1] === '"') { cur += '"'; i++; continue; } inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur); return out;
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) { console.error('CSV must have header + rows'); process.exit(1); }
  const headers = csvSplitLine(lines[0]).map(h => h.trim().toLowerCase());
  function findCol(candidates) { for (const cand of candidates) { const idx = headers.findIndex(h => h.includes(cand)); if (idx >= 0) return idx; } return -1; }
  // auto-detect best-guess columns
  let timeCol = findCol(['time','date','datetime','timestamp']);
  let tempCol = findCol(['temp','temperature','t°','t','drybulb']);
  let rhCol = findCol(['rh','relative humidity','relative_humidity','humidity','%rh','%','relative']);

  // let user verify and modify detected columns
  console.log('\nDetected CSV headers:');
  headers.forEach((h, i) => console.log(`  [${i}] ${h}`));
  async function confirmCol(name, currentIdx) {
    if (AUTO) return currentIdx; // trust detection in auto mode
    const curLabel = currentIdx >= 0 ? `${currentIdx} (${headers[currentIdx]})` : 'not detected';
    const ans = await prompt(`Column for ${name} [detected: ${curLabel}] - enter index to override or press Enter to accept: `);
    if (!ans) return currentIdx;
    const n = Number(ans);
    if (!Number.isNaN(n) && n >= 0 && n < headers.length) return n;
    // try to match by header text
    const low = ans.trim().toLowerCase();
    const idx = headers.findIndex(h => h.includes(low));
    return idx >= 0 ? idx : currentIdx;
  }
  timeCol = await confirmCol('time/datetime', timeCol);
  tempCol = await confirmCol('temperature', tempCol);
  rhCol = await confirmCol('relative humidity', rhCol);
  if (timeCol < 0 || tempCol < 0 || rhCol < 0) { console.error('Missing required columns. Aborting.'); process.exit(1); }

  const rows = [];
  // helper: try multiple date parsing strategies and allow user to pick
  // parse date strings robustly; supports dd/mm/yyyy hh:mm:ss with double spaces
  function tryParseDate(s, preferDayFirst) {
    if (!s || !s.trim()) return NaN;
    const raw = s.trim();
    // 1) ISO direct
    let d = Date.parse(raw);
    if (!isNaN(d)) return d;
    // normalize spaces
    const norm = raw.replace(/\s+/g, ' ');
    // pattern: DD/MM/YYYY HH:MM:SS or MM/DD/YYYY HH:MM:SS
    const m = norm.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?$/);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
      const timePart = m[4] || '00:00:00';
      if (preferDayFirst) {
        const iso = `${y.toString().padStart(4,'0')}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}T${timePart}`;
        const dt = Date.parse(iso);
        if (!isNaN(dt)) return dt;
      }
      // try month-first
      const iso2 = `${y.toString().padStart(4,'0')}-${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}T${timePart}`;
      const dt2 = Date.parse(iso2);
      if (!isNaN(dt2)) return dt2;
    }
    // try epoch seconds or ms
    const onlyDigits = raw.replace(/[^0-9]/g, '');
    if (onlyDigits.length >= 10) {
      const n = Number(raw);
      if (!isNaN(n)) return n;
    }
    return NaN;
  }

  // sample parse first few rows to detect format and decide if day-first
  const sampleDates = [];
  for (let i = 1; i < Math.min(lines.length, 20); i++) {
    const cols = csvSplitLine(lines[i]);
    sampleDates.push(cols[timeCol]);
  }
  // try to detect day-first vs month-first by heuristics: if day>12 appears -> day-first
  let dayFirstLikely = false;
  for (const sd of sampleDates) {
    const m = sd && sd.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) { const a = Number(m[1]); if (a > 12) { dayFirstLikely = true; break; } }
  }
  if (ASSUME_DAY_FIRST) dayFirstLikely = true;
  if (!AUTO) {
    if (dayFirstLikely) {
      const pick = await prompt('Date samples look like DD/MM/YYYY. Parse as day-first? (Y/n): ');
      if ((pick || '').toLowerCase().startsWith('n')) dayFirstLikely = false; else dayFirstLikely = true;
    } else {
      const pick = await prompt('Date format uncertain. Force day-first parsing? (y/N): ');
      if ((pick || '').toLowerCase().startsWith('y')) dayFirstLikely = true;
    }
  }

  // timezone handling: let user choose local or UTC
  let treatAsUTC = false;
  if (AUTO) treatAsUTC = FORCE_UTC;
  else {
    const tzAns = await prompt('Treat parsed datetimes as (1) local time or (2) UTC? [1]: ');
    treatAsUTC = (tzAns || '1').trim() === '2';
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = csvSplitLine(lines[i]);
    const timeRaw = cols[timeCol], tempRaw = cols[tempCol], rhRaw = cols[rhCol];
    let tms = tryParseDate(timeRaw, dayFirstLikely);
    if (isNaN(tms) && timeRaw && timeRaw.trim().match(/^(\d+)$/)) {
      // maybe epoch seconds
      const n = Number(timeRaw.trim());
      if (n > 1000000000) tms = n; // ms
    }
    // if still NaN, try with swapped day/month if dayFirstLikely
    if (isNaN(tms) && dayFirstLikely) {
      const m = timeRaw && timeRaw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (m) {
        const a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
        const iso = `${y.toString().padStart(4,'0')}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}T00:00:00`;
        const d = Date.parse(iso);
        if (!isNaN(d)) tms = d;
      }
    }
    if (isNaN(tms)) continue;
    if (treatAsUTC) {
      // convert parsed time to milliseconds UTC (if parsed as local)
      const dt = new Date(tms);
      tms = Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours(), dt.getMinutes(), dt.getSeconds(), dt.getMilliseconds());
    }
    const temp = Number(tempRaw), rh = Number(rhRaw);
    if (!Number.isFinite(temp) || !Number.isFinite(rh)) continue;
    rows.push({ ts: tms, timeRaw, temp, rh });
  }
  if (rows.length === 0) { console.error('No valid data rows parsed.'); process.exit(1); }
  rows.sort((a,b) => a.ts - b.ts);

  const diffs = [];
  for (let i = 0; i < rows.length - 1; i++) diffs.push(rows[i+1].ts - rows[i].ts);
  const medianDiff = diffs.length ? diffs.sort((a,b)=>a-b)[Math.floor(diffs.length/2)] : 0;
  for (let i = 0; i < rows.length; i++) { rows[i].dur = (i < rows.length-1) ? (rows[i+1].ts - rows[i].ts) : (medianDiff || 0); if (rows[i].dur < 0) rows[i].dur = 0; }

  const agg = {}; const tsOutLines = ['datetime,temperature,humidity,zone,color'];
  // prepare bucketed aggregation (per-day or per-month) depending on total range
  const totalRangeMs = rows[rows.length-1].ts - rows[0].ts;
  const oneDayMs = 24*60*60*1000;
  const useMonthly = totalRangeMs > (30 * oneDayMs);
  function bucketKey(ts) {
    const d = new Date(ts);
    if (useMonthly) return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
  const perBucket = {};
  for (const r of rows) {
    const zone = classifyPoint(r.temp, r.rh); r.zone = zone;
    const zoneColor = (ZONES.find(z=>z.id===zone) || {color:'#999999'}).color;
    agg[zone] = (agg[zone] || 0) + r.dur;
    tsOutLines.push([new Date(r.ts).toISOString(), r.temp, r.rh, zone, zoneColor].join(','));
    const bk = bucketKey(r.ts);
    perBucket[bk] = perBucket[bk] || {};
    perBucket[bk][zone] = (perBucket[bk][zone] || 0) + r.dur;
  }

  // detect sampling resolution (from medianDiff earlier)
  const medianSeconds = Math.round((medianDiff || 0) / 1000);
  let sampling = 'irregular';
  if (medianDiff >= 22*3600*1000) sampling = 'daily';
  else if (medianDiff >= 40*60*1000 && medianDiff <= 80*60*1000) sampling = 'hourly';
  else if (medianDiff > 0) sampling = `${Math.round(medianDiff/1000)}s`; 
  console.log(`\nDetected sampling: ${sampling} (median interval ${medianSeconds}s)`);

  const totalMs = Object.values(agg).reduce((s,v)=>s+v,0) || 1;
  const summary = Object.keys(agg).map(k => {
    const ms = agg[k];
    const h = ms / (1000*60*60);
    return { zone: k, hours: Number(h.toFixed(3)), percent: Number((ms*100/totalMs).toFixed(2)), milliseconds: ms };
  }).sort((a,b)=>b.hours - a.hours);

  // write timeseries CSV
  try { fs.writeFileSync(outTS, tsOutLines.join('\n'), 'utf8'); } catch(e) { console.error('Could not write timeseries file:', e.message); }

  // prepare summary in chosen format
  let outContent = '';
  // detected period / title for summary
  const startTs = rows.length ? rows[0].ts : null;
  const endTs = rows.length ? rows[rows.length-1].ts : null;
  let periodTitle = '';
  if (startTs && endTs) {
    const sd = new Date(startTs);
    const ed = new Date(endTs);
    if (useMonthly) {
      periodTitle = `${String(sd.getUTCMonth()+1).padStart(2,'0')}-${sd.getUTCFullYear()}`;
    } else {
      // if same day
      const sISO = `${sd.getUTCFullYear()}-${String(sd.getUTCMonth()+1).padStart(2,'0')}-${String(sd.getUTCDate()).padStart(2,'0')}`;
      const eISO = `${ed.getUTCFullYear()}-${String(ed.getUTCMonth()+1).padStart(2,'0')}-${String(ed.getUTCDate()).padStart(2,'0')}`;
      if (sISO === eISO) periodTitle = sISO;
      else periodTitle = `${sISO} to ${eISO}`;
    }
  }

  // global summary
  if (outFormat === 'md') {
    outContent += `## Summary table for ${periodTitle || 'all data'}\n\n`;
    outContent += `| Zone | Hours | % of time |\n| --- | ---: | ---: |\n`;
    for (const s of summary) outContent += `| ${s.zone} | ${s.hours} | ${s.percent} % |\n`;
  } else if (outFormat === 'csv') {
    outContent += `# Summary table for ${periodTitle || 'all data'}\n`;
    outContent += 'zone,hours,percent\n';
    for (const s of summary) outContent += `${s.zone},${s.hours},${s.percent}\n`;
  } else {
    outContent += `Summary table for ${periodTitle || 'all data'}:\n`;
    for (const s of summary) outContent += `${s.zone}: ${s.hours} h (${s.percent}%)\n`;
  }

  // timeline breakdown (per-month or per-day depending on range)
  const bucketKeys = Object.keys(perBucket).sort();
  if (bucketKeys.length > 0) {
    if (outFormat === 'md') outContent += `\n## Timeline breakdown (${useMonthly ? 'per-month' : 'per-day'})\n\n`;
    else if (outFormat === 'csv') outContent += '\nperiod,zone,hours,percent\n';
    else outContent += `\nTimeline breakdown (${useMonthly ? 'per-month' : 'per-day'}):\n`;

    for (const bk of bucketKeys) {
      const bucketTotal = Object.values(perBucket[bk]).reduce((s,v)=>s+v,0) || 1;
      const rowsList = Object.keys(perBucket[bk]).map(z => ({ zone: z, ms: perBucket[bk][z] } )).sort((a,b)=>b.ms-a.ms);
      if (outFormat === 'md') {
        outContent += `### ${bk}\n\n| Zone | Hours | % of time |\n| --- | ---: | ---: |\n`;
        for (const r of rowsList) {
          const h = Number((r.ms/(1000*60*60)).toFixed(3));
          const p = Number((r.ms*100/bucketTotal).toFixed(2));
          outContent += `| ${r.zone} | ${h} | ${p} % |\n`;
        }
        outContent += '\n';
      } else if (outFormat === 'csv') {
        for (const r of rowsList) {
          const h = Number((r.ms/(1000*60*60)).toFixed(3));
          const p = Number((r.ms*100/bucketTotal).toFixed(2));
          outContent += `${bk},${r.zone},${h},${p}\n`;
        }
      } else {
        outContent += `-- ${bk} --\n`;
        for (const r of rowsList) {
          const h = Number((r.ms/(1000*60*60)).toFixed(3));
          const p = Number((r.ms*100/bucketTotal).toFixed(2));
          outContent += `  ${r.zone}: ${h} h (${p}%)\n`;
        }
        outContent += '\n';
      }
    }
  }

  // also print markdown table to console
  console.log('\nSummary table:');
  let md = `| Zone | Hours | % of time |\n| --- | ---: | ---: |\n`;
  for (const s of summary) md += `| ${s.zone} | ${s.hours} | ${s.percent} % |\n`;
  console.log(md);

  try {
    fs.writeFileSync(outPath, outContent, 'utf8');
    console.log('Summary written to', outPath);
  } catch (e) { console.error('Could not write summary file:', e.message); }

  // write JSON summary if requested
  if (jsonPath) {
    const jsonObj = { summary, total_hours: Number((totalMs/(1000*60*60)).toFixed(3)), generated_at: new Date().toISOString(), source: inputPath };
    try {
      fs.writeFileSync(jsonPath, JSON.stringify(jsonObj, null, 2), 'utf8');
      console.log('JSON summary written to', jsonPath);
    } catch (e) { console.error('Could not write JSON summary file:', e.message); }
  } else {
    console.log('JSON summary not requested.');
  }

  console.log('Timeseries for plotting written to', outTS);

})();
