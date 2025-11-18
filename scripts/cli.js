// Refactor derived from logic.js
const readline = require('readline');
const path = require('path');

// Import all modules
const { parseArgs } = require('./args');
const { listCsvFiles, readFileSample, writeFileAtomic, fileExists, stat, createReadStream, createWriteStream } = require('./io');
const { csvSplitLine, parseHeader, findBestColumn } = require('./csv');
const { tryParseDate, detectDayFirstFromSamples, normalizeToUTC, parseTimestampOrThrow } = require('./dateParser');
const { ZONES } = require('./zones');
const { classifyPoint } = require('./classify');
const { computeDurations, detectSampling, buildBuckets, bucketKey, createAggregator } = require('./aggregate');
const { buildTimeseriesLines, formatSummary, buildJsonSummary, buildTimeseriesHeaderLine, buildTimeseriesLine } = require('./output');
const { parseNumberSafe, datePartsFactory, humanizePeriod } = require('./utils');

/**
 * Default prompt function for interactive mode
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User answer
 */
async function defaultPrompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

/**
 * Print help message
 */
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
  console.log('  --only <csv|md|txt|json>    Produce only one output type and skip others');
  console.log('  --no-ts                    Do not write the timeseries CSV');
  console.log('  --show-options             Append multichoice options table to summary output');
  console.log('  --choose                   In auto mode, allow simple choice of input file when multiple exist');
  console.log('  --select <N>               In auto mode select the N-th CSV (1-based) deterministically');
  console.log('\nExamples:');
  console.log('  node tactics-cli.js data.csv --format md --out summary.md --ts timeseries.csv --json summary.json');
  console.log('  node tactics-cli.js --auto --assume-day-first sample.csv');
}

/**
 * Main CLI orchestration function
 * @param {Object} options - Parsed command line options (optional, defaults to parsing process.argv)
 * @param {Function} promptFn - Prompt function for interactive mode (optional, defaults to defaultPrompt)
 * @returns {Promise<Object>} Result object with output paths
 */
async function run(options = null, promptFn = defaultPrompt) {
  try {
    // Parse arguments if not provided
    const opts = options || parseArgs(process.argv.slice(2));
    
    if (opts.help) {
      printHelp();
      return {};
    }

    // Choose input file
    let inputPath = opts.inputPath;
    if (!inputPath) {
      const files = listCsvFiles();
      if (files.length === 0) {
        if (opts.auto) {
          throw new Error('No .csv found in cwd. Auto mode cannot continue.');
        }
        const manual = await promptFn('No .csv found in cwd. Enter path to CSV file: ');
        inputPath = manual || null;
        if (!inputPath) {
          throw new Error('No input file. Exiting.');
        }
      } else {
        if (opts.auto) {
          if (opts.select) {
            const n = Number(opts.select);
            if (Number.isNaN(n) || n < 1 || n > files.length) {
              throw new Error('--select index out of range');
            }
            inputPath = path.join(process.cwd(), files[n - 1]);
            console.log(`Auto mode: selected CSV '${files[n - 1]}' by --select`);
          } else {
            // Choose the most recently modified CSV file deterministically
            let latest = null;
            let latestMtime = -1;
            for (const f of files) {
              try {
                const st = stat(path.join(process.cwd(), f));
                if (st.mtimeMs > latestMtime) {
                  latestMtime = st.mtimeMs;
                  latest = f;
                }
              } catch (e) { /* ignore stat errors */ }
            }
            if (!latest) {
              throw new Error('No readable CSV files found for auto mode.');
            }
            inputPath = path.join(process.cwd(), latest);
            console.log(`Auto mode: selected CSV '${latest}' (most recently modified)`);
          }
          
          if (opts.choose) {
            console.log('Multiple CSV files available:');
            files.forEach((f, i) => console.log(`  [${i + 1}] ${f}`));
            const ans = await promptFn(`Accept '${path.basename(inputPath)}'? Enter number to choose different file or press Enter to accept: `);
            if (ans) {
              const n = Number(ans);
              if (!Number.isNaN(n) && n >= 1 && n <= files.length) {
                inputPath = path.join(process.cwd(), files[n - 1]);
              } else {
                console.log('Invalid choice, keeping auto-selected file.');
              }
            }
            console.log('Using file:', path.basename(inputPath));
          }
        } else {
          console.log('CSV files found:');
          files.forEach((f, i) => console.log(`  [${i + 1}] ${f}`));
          const ans = await promptFn('Choose number or enter path: ');
          const n = Number(ans);
          if (!Number.isNaN(n) && n >= 1 && n <= files.length) {
            inputPath = path.join(process.cwd(), files[n - 1]);
          } else {
            inputPath = ans || null;
          }
          if (!inputPath) {
            throw new Error('No input file chosen. Exiting.');
          }
        }
      }
    }

    if (!fileExists(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Read and parse CSV
    const sampleLines = readFileSample(inputPath, 20);
    if (sampleLines.length < 2) {
      throw new Error('CSV must have header + rows');
    }

    const headers = parseHeader(sampleLines);
    let timeCol = findBestColumn(headers, ['time', 'date', 'datetime', 'timestamp']);
    let tempCol = findBestColumn(headers, ['temp', 'temperature', 't°', 't', 'drybulb']);
    let rhCol = findBestColumn(headers, ['rh', 'relative humidity', 'relative_humidity', 'humidity', '%rh', '%', 'relative']);

    // Interactive column confirmation
    async function confirmCol(name, currentIdx) {
      if (opts.auto) return currentIdx;
      const curLabel = currentIdx >= 0 ? `${currentIdx} (${headers[currentIdx]})` : 'not detected';
      const ans = await promptFn(`Column for ${name} [detected: ${curLabel}] - enter index to override or press Enter to accept: `);
      if (!ans) return currentIdx;
      const n = Number(ans);
      if (!Number.isNaN(n) && n >= 0 && n < headers.length) return n;
      const low = ans.trim().toLowerCase();
      const idx = headers.findIndex(h => h.includes(low));
      return idx >= 0 ? idx : currentIdx;
    }

    timeCol = await confirmCol('time/datetime', timeCol);
    tempCol = await confirmCol('temperature', tempCol);
    rhCol = await confirmCol('relative humidity', rhCol);

    if (timeCol < 0 || tempCol < 0 || rhCol < 0) {
      throw new Error('Missing required columns. Aborting.');
    }

    // Date format detection
    const sampleDates = [];
    for (let i = 1; i < Math.min(sampleLines.length, 20); i++) {
      const cols = csvSplitLine(sampleLines[i]);
      sampleDates.push(cols[timeCol]);
    }

    let dayFirstLikely = detectDayFirstFromSamples(sampleDates, inputPath);
    if (opts.assumeDayFirst) dayFirstLikely = true;

    if (!opts.auto) {
      if (dayFirstLikely) {
        const pick = await promptFn('Date samples look like DD/MM/YYYY. Parse as day-first? (Y/n): ');
        if ((pick || '').toLowerCase().startsWith('n')) dayFirstLikely = false;
        else dayFirstLikely = true;
      } else {
        const pick = await promptFn('Date format uncertain. Force day-first parsing? (y/N): ');
        if ((pick || '').toLowerCase().startsWith('y')) dayFirstLikely = true;
      }
    }

    // Timezone handling
    let treatAsUTC = false;
    if (opts.auto) {
      treatAsUTC = opts.utc;
    } else {
      const tzAns = await promptFn('Treat parsed datetimes as (1) local time or (2) UTC? [1]: ');
      treatAsUTC = (tzAns || '1').trim() === '2';
    }

    // Create streaming aggregator
    const aggregator = createAggregator({ treatAsUTC });
    let rowsCount = 0;
    let firstTs = null;
    let lastTs = null;
    let medianDiff = 0;
    let totalRangeMs = 0;
    
    // First pass: sample to detect sampling and timeline
    const sampleRows = [];
    
    for (let i = 1; i < sampleLines.length; i++) {
      const cols = csvSplitLine(sampleLines[i]);
      const timeRaw = cols[timeCol];
      const tempRaw = cols[tempCol];
      const rhRaw = cols[rhCol];

      let tms = parseTimestampOrThrow(timeRaw, dayFirstLikely);
      tms = normalizeToUTC(tms, treatAsUTC);

      const temp = parseNumberSafe(tempRaw);
      const rh = parseNumberSafe(rhRaw);

      if (!Number.isFinite(temp) || !Number.isFinite(rh)) continue;
      sampleRows.push({ ts: tms, temp, rh });
    }
    
    if (sampleRows.length === 0) {
      throw new Error('No valid data rows in sample.');
    }
    
    // Compute sample durations for median detection
    computeDurations(sampleRows);
    const diffs = [];
    for (let i = 0; i < sampleRows.length - 1; i++) {
      diffs.push(sampleRows[i + 1].ts - sampleRows[i].ts);
    }
    medianDiff = diffs.length ? diffs.sort((a, b) => a - b)[Math.floor(diffs.length / 2)] : 0;
    const { sampling } = detectSampling(medianDiff);
    console.log(`\nDetected sampling: ${sampling} (median interval ${Math.round((medianDiff || 0) / 1000)}s)`);

    // Determine timeline grouping
    const dateParts = datePartsFactory(treatAsUTC);
    
    // Count distinct months from sample
    const monthSet = new Set();
    for (const row of sampleRows) {
      const parts = dateParts(row.ts);
      monthSet.add(`${parts.year}-${String(parts.month).padStart(2, '0')}`);
    }
    const monthsSpan = monthSet.size;
    
    // Estimate total range from sample
    const sampleRangeMs = sampleRows[sampleRows.length - 1].ts - sampleRows[0].ts;
    const fileStats = stat(inputPath);
    const estimatedLines = Math.floor(fileStats.size / 100); // Rough estimate
    const estimatedTotalRangeMs = sampleRangeMs * (estimatedLines / sampleRows.length);
    totalRangeMs = estimatedTotalRangeMs;

    // Detect timeline unit
    let detectedTimeline = 'month';
    if (opts.auto) {
      const filename = path.basename(inputPath).toLowerCase();
      const isSingleMonthFile = filename.includes('_01_') || filename.includes('_02_') || filename.includes('_03_') ||
                               filename.includes('_04_') || filename.includes('_05_') || filename.includes('_06_') ||
                               filename.includes('_07_') || filename.includes('_08_') || filename.includes('_09_') ||
                               filename.includes('_10_') || filename.includes('_11_') || filename.includes('_12_');

      if (monthsSpan > 2) detectedTimeline = 'month';
      else if (monthsSpan === 1 && medianDiff <= 3 * 3600 * 1000) detectedTimeline = 'day';
      else if (totalRangeMs <= 2 * 24 * 3600 * 1000 && medianDiff <= 3 * 3600 * 1000) detectedTimeline = 'hour';
      else if ((monthsSpan <= 2 || isSingleMonthFile) && medianDiff <= 3 * 3600 * 1000) detectedTimeline = 'day';
      else if (monthsSpan === 1) detectedTimeline = 'day';
      else detectedTimeline = 'month';
    } else {
      if (totalRangeMs <= 24 * 3600 * 1000) {
        detectedTimeline = 'day';
      } else if (totalRangeMs <= 31 * 24 * 3600 * 1000) {
        detectedTimeline = 'day';
      } else {
        detectedTimeline = 'month';
      }
    }

    let timelineUnit = detectedTimeline;
    if (!opts.auto) {
      const ans = await promptFn(`Choose timeline grouping for the summary (month / day / hour) [auto=${detectedTimeline}]: `);
      const pick = (ans || '').trim().toLowerCase();
      if (pick === '') {
        timelineUnit = detectedTimeline;
      } else if (['month', 'day', 'hour'].includes(pick)) {
        timelineUnit = pick;
      } else if (pick === 'auto') {
        timelineUnit = detectedTimeline;
      } else {
        console.log('Unrecognized choice, using detected grouping:', detectedTimeline);
        timelineUnit = detectedTimeline;
      }
    }

    // Choose output format
    let outFormat = ['md', 'txt', 'csv'].includes(opts.format) ? opts.format : null;
    if (!outFormat) {
      const fmtAns = await promptFn('Choose output format (md / txt / csv) [md]: ');
      outFormat = (fmtAns || 'md').toLowerCase();
      if (!['md', 'txt', 'csv'].includes(outFormat)) outFormat = 'md';
    }

    // Choose output paths
    let outPath = opts.outPath;
    if (!outPath) {
      const defaultName = outFormat === 'md' ? 'tactics_summary.md' : outFormat === 'txt' ? 'tactics_summary.txt' : 'tactics_summary.csv';
      const ans = await promptFn(`Output summary file path [${defaultName}]: `);
      outPath = ans || path.join(process.cwd(), defaultName);
    }

    let jsonPath = opts.jsonPath;
    if (opts.jsonPath === null && !opts.auto) {
      const jAns = await promptFn('Write JSON summary as well? (y/N): ');
      if ((jAns || '').toLowerCase().startsWith('y')) {
        const ans = await promptFn('JSON output path [tactics_summary.json]: ');
        jsonPath = ans || path.join(process.cwd(), 'tactics_summary.json');
      }
    } else if (opts.jsonPath === null) {
      jsonPath = null;
    }

    // Set default paths
    const tsPath = opts.tsPath || path.join(process.cwd(), 'tactics_timeseries.csv');
    if (jsonPath === undefined && opts.jsonPath !== null) {
      jsonPath = path.join(process.cwd(), 'tactics_summary.json');
    }

    // If user requested only json and provided --out, treat --out as the json output path
    if ((opts.only || '').toLowerCase() === 'json' && outPath) {
      jsonPath = outPath;
    }

    // Stream processing of the entire file
    aggregator.setTimelineUnit(timelineUnit);
    const rl = createReadStream(inputPath);
    let lineIndex = 0;
    let tsWriteStream = null;
    
    // Process lines using streaming
    for await (const line of rl) {
      lineIndex++;
      if (lineIndex === 1) continue; // Skip header
      
      if (!line.trim()) continue;
      
      try {
        const cols = csvSplitLine(line);
        const timeRaw = cols[timeCol];
        const tempRaw = cols[tempCol];
        const rhRaw = cols[rhCol];

        let tms = parseTimestampOrThrow(timeRaw, dayFirstLikely);
        tms = normalizeToUTC(tms, treatAsUTC);

        const temp = parseNumberSafe(tempRaw);
        const rh = parseNumberSafe(rhRaw);

        if (!Number.isFinite(temp) || !Number.isFinite(rh)) continue;
        
        const row = { ts: tms, temp, rh };
        
        // Process row through aggregator
        aggregator.pushRow(row);
        
        // Write to timeseries stream if enabled
        if (writeTS && !tsWriteStream) {
          tsWriteStream = createWriteStream(tsPath);
          tsWriteStream.write(buildTimeseriesHeaderLine() + '\n');
        }
        
        if (tsWriteStream) {
          // We need to classify the point for timeseries output
          row.zone = classifyPoint(row.temp, row.rh);
          tsWriteStream.write(buildTimeseriesLine(row) + '\n');
        }
        
      } catch (error) {
        if (error.message.includes('DateParseError:') || error.message.includes('IOError:')) {
          throw error;
        }
        // Skip malformed lines
        continue;
      }
    }
    
    // Close timeseries stream if opened
    if (tsWriteStream) {
      tsWriteStream.end();
    }
    
    // Get final aggregation results
    const result = aggregator.finish();
    const { agg, perBucket, summary, totalMs, firstTs: ft, lastTs: lt, rowsWithDur } = result;
    
    // Update first and last timestamps
    firstTs = ft;
    lastTs = lt;

    // Determine which outputs to write
    let writeTS = true;
    let writeSummary = true;
    let writeJSON = Boolean(jsonPath);

    if (opts.only) {
      writeTS = false;
      writeSummary = false;
      writeJSON = false;
      const of = (opts.only || '').toLowerCase();
      if (of === 'csv') writeTS = true;
      else if (of === 'md' || of === 'txt' || of === 'csv') writeSummary = true;
      else if (of === 'json') writeJSON = true;
    }
    if (opts.noTs) writeTS = false;

    // Ensure JSON output when explicitly requested via --only json
    if ((opts.only || '').toLowerCase() === 'json') {
      writeJSON = true;
      if (!jsonPath) {
        jsonPath = path.join(process.cwd(), 'tactics_summary.json');
      }
    }

    // Interactive confirmation for timeseries (before we actually write it)
    if (!opts.auto && writeTS) {
      // Show a sample of what would be written
      console.log('\nExample of timeseries output:');
      console.log(buildTimeseriesHeaderLine());
      // Show a sample row from our processed data
      if (sampleRows.length > 0) {
        const sampleRow = { ...sampleRows[0], zone: classifyPoint(sampleRows[0].temp, sampleRows[0].rh) };
        console.log(buildTimeseriesLine(sampleRow));
      }
      const ans = await promptFn('Write timeseries CSV? (Y/n): ');
      if ((ans || '').toLowerCase().startsWith('n')) writeTS = false;
    }

    const outputResult = {};

    // Write timeseries (already written during streaming)
    if (writeTS && tsWriteStream) {
      console.log('Timeseries for plotting written to', tsPath);
      outputResult.tsPath = tsPath;
    } else if (writeTS) {
      // We need to write it now since we didn't stream it
      const tsLines = buildTimeseriesLines(sampleRows.map(r => ({ ...r, zone: classifyPoint(r.temp, r.rh) })));
      writeFileAtomic(tsPath, tsLines.join('\n'));
      console.log('Timeseries for plotting written to', tsPath);
      outputResult.tsPath = tsPath;
    } else {
      console.log('Timeseries CSV skipped.');
    }

    // Write summary
    if (writeSummary) {
      const summaryContent = formatSummary(summary, perBucket, timelineUnit, outFormat, totalMs, treatAsUTC, firstTs, lastTs, { showOptions: opts.showOptions, rowsWithDur });
      writeFileAtomic(outPath, summaryContent);
      console.log('Summary written to', outPath);
      outputResult.summaryPath = outPath;
    } else {
      console.log('Summary output skipped.');
    }

    // Write JSON
    if (writeJSON && jsonPath) {
      const jsonObj = buildJsonSummary(summary, totalMs, inputPath);
      writeFileAtomic(jsonPath, JSON.stringify(jsonObj, null, 2));
      console.log('JSON summary written to', jsonPath);
      outputResult.jsonPath = jsonPath;
    } else {
      console.log('JSON summary not requested.');
    }

    // Print summary to console
    console.log('\nSummary table:');
    let md = `| Zone | Hours | % of time |\n| --- | ---: | ---: |\n`;
    for (const s of summary) md += `| ${s.zone} | ${s.hours} | ${s.percent} % |\n`;
    console.log(md);

    return outputResult;

  } catch (error) {
    // Re-throw with proper error prefix if not already present
    if (error.message.includes(':')) {
      throw error;
    } else {
      throw new Error(`Unexpected: ${error.message}`);
    }
  }
}

module.exports = { run };