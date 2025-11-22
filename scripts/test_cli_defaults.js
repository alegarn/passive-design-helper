const path = require('path');
const fs = require('fs');
const { readFileSample } = require('./io');
const { parseHeader, csvSplitLine, findBestColumn } = require('./csv');
const { parseTimestampOrThrow, normalizeToUTC } = require('./dateParser');
const { computeDurations, detectSampling } = require('./aggregate');
const { datePartsFactory } = require('./utils');

function detectTimelineForFile(inputPath, opts = { auto: true, assumeDayFirst: false, utc: false }) {
  const sampleLines = readFileSample(inputPath, 100);
  if (sampleLines.length < 2) {
    throw new Error('Not enough sample lines');
  }

  const headers = parseHeader(sampleLines);
  let timeCol = findBestColumn(headers, ['time', 'date', 'datetime', 'timestamp']);
  let tempCol = findBestColumn(headers, ['temp', 'temperature', 't°', 't', 'drybulb']);
  let rhCol = findBestColumn(headers, ['rh', 'relative humidity', 'relative_humidity', 'humidity', '%rh', '%', 'relative']);

  if (timeCol < 0) throw new Error('No time column detected in sample');
  if (tempCol < 0) throw new Error('No temp column detected in sample');
  if (rhCol < 0) throw new Error('No rh column detected in sample');

  const sampleRows = [];
  for (let i = 1; i < Math.min(sampleLines.length, 100); i++) {
    const cols = csvSplitLine(sampleLines[i]);
    const timeRaw = cols[timeCol];
    const tempRaw = cols[tempCol];
    const rhRaw = cols[rhCol];
    try {
      let tms = parseTimestampOrThrow(timeRaw, opts.assumeDayFirst);
      tms = normalizeToUTC(tms, opts.utc);
      const temp = Number(tempRaw);
      const rh = Number(rhRaw);
      if (!Number.isFinite(temp) || !Number.isFinite(rh)) continue;
      sampleRows.push({ ts: tms, temp, rh });
    } catch (e) {
      continue;
    }
  }

  if (sampleRows.length === 0) {
    throw new Error('No valid rows in sample');
  }

  computeDurations(sampleRows);
  const diffs = [];
  for (let i = 0; i < sampleRows.length - 1; i++) {
    diffs.push(sampleRows[i + 1].ts - sampleRows[i].ts);
  }
  const medianDiff = diffs.length ? diffs.sort((a, b) => a - b)[Math.floor(diffs.length / 2)] : 0;
  const { sampling } = detectSampling(medianDiff);

  const dateParts = datePartsFactory(opts.utc);
  const monthSet = new Set();
  for (const r of sampleRows) {
    const p = dateParts(r.ts);
    monthSet.add(`${p.year}-${String(p.month).padStart(2,'0')}`);
  }
  const monthsSpan = monthSet.size;

  const sampleRangeMs = sampleRows[sampleRows.length - 1].ts - sampleRows[0].ts;
  const fileStats = fs.statSync(inputPath);
  const estimatedLines = Math.floor(fileStats.size / 100) || 1;
  const estimatedTotalRangeMs = sampleRangeMs * (estimatedLines / sampleRows.length);
  const totalRangeMs = estimatedTotalRangeMs;

  // replicate detection logic from cli.js (prefer filename month marker)
  let detectedTimeline = 'month';
  if (opts.auto) {
    const filename = path.basename(inputPath).toLowerCase();
    const isSingleMonthFile = filename.includes('_01_') || filename.includes('_02_') || filename.includes('_03_') ||
                             filename.includes('_04_') || filename.includes('_05_') || filename.includes('_06_') ||
                             filename.includes('_07_') || filename.includes('_08_') || filename.includes('_09_') ||
                             filename.includes('_10_') || filename.includes('_11_') || filename.includes('_12_');

    // If filename uses a YYYY_MM_ prefix, prefer per-day; if filename starts with YYYY_ but not YYYY_MM_,
    // treat as a yearly file and prefer per-month.
    const yearPrefix = /^\d{4}_/;
    const yearMonthPrefix = /^\d{4}_[0-9]{2}_/;
    const hasYearPrefix = yearPrefix.test(filename);
    const hasYearMonthPrefix = yearMonthPrefix.test(filename);

    if (isSingleMonthFile || hasYearMonthPrefix) {
      detectedTimeline = 'day';
    } else if (hasYearPrefix && !hasYearMonthPrefix) {
      detectedTimeline = 'month';
    } else if (monthsSpan > 2) {
      detectedTimeline = 'month';
    } else if (monthsSpan === 1 && medianDiff <= 3 * 3600 * 1000) {
      detectedTimeline = 'day';
    } else if (totalRangeMs <= 2 * 24 * 3600 * 1000 && medianDiff <= 3 * 3600 * 1000) {
      detectedTimeline = 'hour';
    } else if ((monthsSpan <= 2) && medianDiff <= 3 * 3600 * 1000) {
      detectedTimeline = 'day';
    } else if (monthsSpan === 1) {
      detectedTimeline = 'day';
    } else {
      detectedTimeline = 'month';
    }
  } else {
    if (totalRangeMs <= 24 * 3600 * 1000) {
      detectedTimeline = 'day';
    } else if (totalRangeMs <= 31 * 24 * 3600 * 1000) {
      detectedTimeline = 'day';
    } else {
      detectedTimeline = 'month';
    }
  }

  return {
    sampling,
    medianDiff,
    monthsSpan,
    estimatedTotalRangeMs: totalRangeMs,
    detectedTimeline
  };
}

function runTests() {
  const files = [
    path.join(__dirname, '..', '2024_si_samrong.csv'),
    path.join(__dirname, '..', '2024_04_si_samrong_hourly.csv')
  ];

  for (const f of files) {
    try {
      const info = detectTimelineForFile(f, { auto: true, assumeDayFirst: false, utc: true });
      console.log(`File: ${path.basename(f)} -> detected (auto): ${info.detectedTimeline} | monthsSpan=${info.monthsSpan} | sampling=${info.sampling}`);
    } catch (e) {
      console.error(`File: ${path.basename(f)} -> Error: ${e.message}`);
    }
  }

  // Also test non-auto heuristic
  for (const f of files) {
    try {
      const info = detectTimelineForFile(f, { auto: false, assumeDayFirst: false, utc: true });
      console.log(`File: ${path.basename(f)} -> detected (interactive-style): ${info.detectedTimeline} | monthsSpan=${info.monthsSpan} | sampling=${info.sampling}`);
    } catch (e) {
      console.error(`File: ${path.basename(f)} -> Error: ${e.message}`);
    }
  }
}

runTests();
