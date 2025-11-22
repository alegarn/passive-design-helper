// Refactor derived from logic.js
import { datePartsFactory } from './utils.js';
import { classifyPoint } from './classify.js';

function computeDurations(rows) {
  if (rows.length === 0) return rows;
  rows.sort((a, b) => a.ts - b.ts);
  const diffs = [];
  for (let i = 0; i < rows.length - 1; i++) {
    diffs.push(rows[i + 1].ts - rows[i].ts);
  }
  const medianDiff = diffs.length ? diffs.sort((a, b) => a - b)[Math.floor(diffs.length / 2)] : 0;
  for (let i = 0; i < rows.length; i++) {
    if (i < rows.length - 1) rows[i].dur = rows[i + 1].ts - rows[i].ts; else rows[i].dur = medianDiff || 0;
    if (rows[i].dur < 0) rows[i].dur = 0;
  }
  return rows;
}

function detectSampling(medianDiff) {
  const medianSeconds = Math.round((medianDiff || 0) / 1000);
  let sampling = 'irregular';
  if (medianDiff >= 22 * 3600 * 1000) sampling = 'daily';
  else if (medianDiff >= 40 * 60 * 1000 && medianDiff <= 80 * 60 * 1000) sampling = 'hourly';
  else if (medianDiff > 0) sampling = `${Math.round(medianDiff / 1000)}s`;
  let samplingUnit = 'irregular';
  if (medianDiff === 0) samplingUnit = 'single';
  else if (medianDiff <= 90 * 1000) samplingUnit = 'seconds';
  else if (medianDiff <= 90 * 60 * 1000) samplingUnit = 'minutes';
  else if (medianDiff <= 3 * 3600 * 1000) samplingUnit = 'hour';
  else if (medianDiff <= 2 * 24 * 3600 * 1000) samplingUnit = 'day';
  else samplingUnit = 'month+';
  return { sampling, samplingUnit, medianDiff };
}

function buildBuckets(rows, timelineUnit, treatAsUTC) {
  const dateParts = datePartsFactory(treatAsUTC);
  const perBucket = {};
  for (const row of rows) {
    const bk = bucketKey(row.ts, timelineUnit, dateParts);
    perBucket[bk] = perBucket[bk] || {};
    perBucket[bk][row.zone] = (perBucket[bk][row.zone] || 0) + row.dur;
  }
  return perBucket;
}

function bucketKey(ts, timelineUnit, dateParts) {
  const parts = dateParts(ts);
  if (timelineUnit === 'month') return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
  if (timelineUnit === 'day') return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} ${String(parts.hours).padStart(2, '0')}:00`;
}

function createAggregator(options = {}) {
  const { maxDeltasForMedian = 1000, treatAsUTC = false } = options;
  const dateParts = datePartsFactory(treatAsUTC);
  let previousRow = null, deltas = [], agg = {}, perBucket = {}, rowsCount = 0, totalMs = 0, firstTs = null, lastTs = null, timelineUnit = null, rowsWithDur = [];

  function pushRow(row) {
    row.zone = classifyPoint(row.temp, row.rh);
    if (!previousRow) { firstTs = row.ts; previousRow = row; rowsCount++; return; }
    const delta = row.ts - previousRow.ts;
    const duration = delta > 0 ? delta : 0;
    if (deltas.length < maxDeltasForMedian) deltas.push(delta);
    agg[row.zone] = (agg[row.zone] || 0) + duration;
    totalMs += duration;
    lastTs = row.ts;
    rowsCount++;
    rowsWithDur.push({ ...row, dur: duration });
    previousRow = row;
  }

  function setTimelineUnit(unit) { timelineUnit = unit; }

  function finish() {
    if (previousRow && deltas.length > 0) {
      const sortedDeltas = [...deltas].sort((a, b) => a - b);
      const medianDelta = sortedDeltas[Math.floor(sortedDeltas.length / 2)] || 0;
      const lastDuration = medianDelta > 0 ? medianDelta : 0;
      agg[previousRow.zone] = (agg[previousRow.zone] || 0) + lastDuration;
      totalMs += lastDuration;
      rowsWithDur.push({ ...previousRow, dur: lastDuration });
    }
    if (timelineUnit) {
      perBucket = {};
      const minTs = Math.min(...rowsWithDur.map(r => r.ts));
      const maxTs = Math.max(...rowsWithDur.map(r => r.ts));
      const zoneTotals = {};
      for (const row of rowsWithDur) {
        const bk = bucketKey(row.ts, timelineUnit, dateParts);
        perBucket[bk] = perBucket[bk] || {};
        perBucket[bk][row.zone] = (perBucket[bk][row.zone] || 0) + row.dur;
        zoneTotals[row.zone] = (zoneTotals[row.zone] || 0) + row.dur;
      }
      if (rowsWithDur.length > 0) {
        let currentTs = minTs;
        while (currentTs <= maxTs) {
          const bk = bucketKey(currentTs, timelineUnit, dateParts);
          if (!perBucket[bk]) perBucket[bk] = {};
          if (timelineUnit === 'hour') currentTs += 3600 * 1000; else if (timelineUnit === 'day') currentTs += 24 * 3600 * 1000; else currentTs = Date.UTC(dateParts(currentTs).year, dateParts(currentTs).month, 1);
        }
      }
    }
    return {
      agg,
      perBucket,
      summary: Object.keys(agg).map(k => { const ms = agg[k]; const h = ms / (1000 * 60 * 60); return { zone: k, hours: Number(h.toFixed(3)), percent: Number((ms * 100 / totalMs).toFixed(2)), milliseconds: ms }; }).sort((a, b) => b.hours - a.hours),
      rowsCount,
      totalMs,
      firstTs,
      lastTs,
      medianDelta: deltas.length > 0 ? [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length / 2)] : 0,
      rowsWithDur
    };
  }

  return { pushRow, finish, setTimelineUnit };
}

export { computeDurations, detectSampling, buildBuckets, bucketKey, createAggregator };
