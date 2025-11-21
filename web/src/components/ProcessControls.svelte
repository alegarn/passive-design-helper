<script>
  import { createEventDispatcher } from 'svelte';
  import { aggregateCsvStream, exportAllFiles, buildTimeSeriesCsv, buildSummaryJson, buildSummaryMd, downloadBlob, detectDataSpan } from '../utils/dataProcessor.js';
  import { W_from_RH_T } from '../scripts/psychro/math.js';
  import { classifyPoint } from '../scripts/classify.js';
  import { getZoneColor } from '../scripts/ui-bridge.js';

  const dispatch = createEventDispatcher();

  // Props from parent component
  let { file, headerFields, sampleRows, dayFirst, dataSpanInfo } = $props();
  
  // Import fileStore to check for remotely fetched data
  import { fileStore } from '../stores/fileStore.js';
  import { mapping } from '../stores/fileStore.js';

  // Local state variables using $state
  let isProcessing = $state(false);
  let processingError = $state(null);
  let aggregationResult = $state(null);
  let detailedDataSpan = $state(null);
  
  
  // Column mapping state
  let timeColumn = $state('');
  let tempColumn = $state('');
  let rhColumn = $state('');
  
  // Processing options
  let timelineUnit = $state('auto');
  let treatAsUTC = $state(false);
  let capMultiplier = $state(4);

  // Reactive values for median and effective cap (populated after processing)
  let medianMs = $state(null);
  let effectiveCapMs = $state(null);
  // Tooltip state for the cap multiplier info box
  let showCapInfo = $state(false);

  $effect(() => {
    if (aggregationResult && aggregationResult.medianDelta !== undefined) {
      medianMs = aggregationResult.medianDelta;
      effectiveCapMs = medianMs * capMultiplier;
    } else {
      medianMs = null;
      effectiveCapMs = null;
    }
  });
  
  
  // Auto-select columns based on header names (with debug logging)
  $effect(() => {
    try {
      
      /* console.debug('ProcessControls: received props', {
        file: file && file.name ? { name: file.name, type: file.type } : file,
        headerFields,
        sampleRows: (sampleRows && sampleRows.slice) ? sampleRows.slice(0,3) : sampleRows,
        dayFirst,
        dataSpanInfo
      }); */
    } catch (dbgErr) {
      // console.debug('ProcessControls: props debug failed', dbgErr);
    }

    if (headerFields && headerFields.length > 0) {
      // Auto-select time column
      const timeCol = headerFields.find(h =>
        h.toLowerCase().includes('time') ||
        h.toLowerCase().includes('date') ||
        h.toLowerCase().includes('datetime')
      );
      if (timeCol) {
        timeColumn = timeCol;
      }
      
      // Auto-select temperature column
      const tempCol = headerFields.find(h =>
        h.toLowerCase().includes('temp') ||
        h.toLowerCase().includes('temperature')
      );
      if (tempCol) {
        tempColumn = tempCol;
      }
      
      // Auto-select humidity column
      const rhCol = headerFields.find(h =>
        h.toLowerCase().includes('rh') ||
        h.toLowerCase().includes('humidity')
      );
      if (rhCol) {
        rhColumn = rhCol;
      }
    } else {
      // no header fields for auto-selection
      // console.debug('ProcessControls: No header fields available for auto-selection');
    }
  });

    // Hydrate local mapping values from global fileStore.mapping when available
    $effect(() => {
      if ($mapping) {
        if (!$mapping.timestamp && !$mapping.temperature && !$mapping.humidity) return;
        if (!timeColumn && $mapping.timestamp) timeColumn = $mapping.timestamp;
        if (!tempColumn && $mapping.temperature) tempColumn = $mapping.temperature;
        if (!rhColumn && $mapping.humidity) rhColumn = $mapping.humidity;
      }
    });
  
  // Calculate detailed data span when dataSpanInfo changes
  $effect(() => {
    if (dataSpanInfo && dataSpanInfo.minDate && dataSpanInfo.maxDate && !detailedDataSpan) {
      // Only calculate once to avoid blocking the UI
      // Create sample timestamps from the range for detailed analysis
      const sampleTimestamps = [];
      const startTime = new Date(dataSpanInfo.minDate).getTime();
      const endTime = new Date(dataSpanInfo.maxDate).getTime();
      
      // Use a simpler approach - just use a few sample points
      const sampleCount = Math.min(20, Math.max(5, dataSpanInfo.samplesPerDay * Math.min(dataSpanInfo.estimatedSpanDays, 7)));
      const interval = (endTime - startTime) / sampleCount;
      
      for (let i = 0; i < sampleCount; i++) {
        const ts = startTime + (interval * i);
        if (ts <= endTime) {
          sampleTimestamps.push(ts);
        }
      }
      
      // Detect detailed data span information
      detailedDataSpan = detectDataSpan(sampleTimestamps);
    }
  });
   
  // Function to handle data processing with streaming API
  async function handleProcessData() {
    if (!file) {
      processingError = "No file available to process";
      return;
    }
    
    if (!timeColumn || !tempColumn || !rhColumn) {
      processingError = "Please select all required columns before processing";
      return;
    }
    
    try {
      isProcessing = true;
      processingError = null;
      // Persist user's mapping selection to fileStore mapping for ColumnMapper compatibility
      try {
        fileStore.setMapping({ timestamp: timeColumn, temperature: tempColumn, humidity: rhColumn });
      } catch (e) {
        // console.debug('ProcessControls: fileStore.setMapping failed:', e);
      }
      
      // Create a custom classifier that uses the selected columns
      let customClassifyRow;
      try {
        customClassifyRow = classifyPoint;
      } catch (error) {
        console.error('Failed to import classifyPoint, falling back to stub:', error);
        customClassifyRow = (temp, rh) => 'ZoneA';
      }

      // If the fetched file is JSON (Open-Meteo), convert it to CSV before passing
      // to aggregateCsvStream which expects CSV content. This preserves the
      // UI header detection done by the store while allowing streaming aggregation.
      let fileToProcess = file;
      try {
        if (file && (file.type === 'application/json' || /\.json$/i.test(file.name || ''))) {
          const text = await file.text();
          let jsonPayload = null;
          try {
            jsonPayload = JSON.parse(text);
          } catch (parseErr) {
            // console.debug('ProcessControls: JSON.parse failed for file.text():', parseErr);
            jsonPayload = null;
          }

          const { jsonToCsv } = await import('../utils/dataProcessor.js');

          if (jsonPayload) {
            // Convert JSON payload to CSV
            const csvContent = jsonToCsv(jsonPayload);
            fileToProcess = new File([csvContent], (file.name || 'remote_data').replace(/\.json$/i, '.csv'), { type: 'text/csv' });
            // console.debug('ProcessControls: converted JSON payload to CSV for processing', fileToProcess);
          } else if (headerFields && headerFields.length > 0 && Array.isArray(sampleRows) && sampleRows.length > 0) {
            // Build a minimal CSV from headerFields and sampleRows if JSON parsing failed.
            // This is a conservative fallback to allow processing when the store provided
            // parsed headers/samples.
            const lines = [];
            lines.push(headerFields.join(','));
            for (const row of sampleRows) {
              // sampleRows entries may be arrays of values
              lines.push(row.map(v => (v === null || v === undefined) ? '' : String(v)).join(','));
            }
            const csvContent = lines.join('\n');
            fileToProcess = new File([csvContent], (file.name || 'remote_data').replace(/\.json$/i, '.csv'), { type: 'text/csv' });
            // console.debug('ProcessControls: built CSV from headerFields/sampleRows for processing', fileToProcess);
          } else {
            // Cannot convert safely — throw so caller sees clear error instead of
            // passing a JSON file to a CSV parser.
            throw new Error('Cannot convert remote JSON file to CSV: missing JSON payload and no header/sample fallback available');
          }
        }
      } catch (convErr) {
        // console.debug('ProcessControls: JSON->CSV conversion failed:', convErr);
        throw convErr;
      }
      
      // Process the data using the streaming API.
      // Pass user-selected column names as explicit overrides so aggregateCsvStream
      // can honor manual mapping when available.
      const result = await aggregateCsvStream(fileToProcess, customClassifyRow, {
        timelineUnit,
        treatAsUTC,
        capMultiplier,
        preferDayFirst: dayFirst,
        timeColumn: timeColumn || undefined,
        tempColumn: tempColumn || undefined,
        rhColumn: rhColumn || undefined
      });
      
      // Generate psychrometric data points
      const psychrometricData = (result.rowsWithDur || []).map(row => ({
        T: row.temp,
        W: W_from_RH_T(row.rh / 100, row.temp),
        zone: row.zone,
        color: getZoneColor(row.zone)
      }));
      
      aggregationResult = { ...result, psychrometricData };
      
      // Debug: Log what we're creating
      // console.log('ProcessControls: Generated psychrometricData:', psychrometricData.slice(0, 5));
      // console.log('ProcessControls: aggregationResult keys:', Object.keys(aggregationResult));
      // console.log('ProcessControls: aggregationResult.psychrometricData length:', aggregationResult.psychrometricData?.length);
      
      // Dispatch event to notify parent component
      dispatch('dataprocessed', { result: aggregationResult });
      
      // Commit aggregation result into shared fileStore so charts update
      try {
        fileStore.setAggregationResult(aggregationResult);
      } catch (e) {
        console.error('ProcessControls: Failed to setAggregationResult on fileStore:', e);
      }
      
      // Lightweight internal sample (no console output)
      if (result && result.rowsWithDur && result.rowsWithDur.length > 0) {
        const sample = result.rowsWithDur.slice(0, 5);
        // sample computed for internal use
      }
      
    } catch (error) {
      processingError = error.message || "An error occurred during processing";
      console.error("Data processing error:", error);
    } finally {
      isProcessing = false;
    }
  }
  
  // Function to handle exporting all files
  function handleExportAll() {
    if (!aggregationResult || !file) return;
    
    try {
      // Derive base name from file name (strip extension)
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      
      // Export all files
      exportAllFiles(baseName, aggregationResult);
      
    } catch (error) {
      processingError = `Export failed: ${error.message}`;
      console.error("Export error:", error);
    }
  }

  // Utility: format duration in ms to human-readable string
  function formatDuration(ms) {
    if (ms === null || ms === undefined) return '';
    const hours = ms / (1000 * 60 * 60);
    if (hours >= 24) {
      const days = hours / 24;
      return `${days.toFixed(2)} days (${hours.toFixed(2)} h)`;
    }
    if (hours >= 1) return `${hours.toFixed(2)} h`;
    const minutes = ms / (1000 * 60);
    return `${Math.round(minutes)} min`;
  }
  
  // Function to export individual file types
  function handleExportTimeSeries() {
    if (!aggregationResult || !file) return;
    
    try {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const csvContent = buildTimeSeriesCsv(aggregationResult.rowsWithDur || []);
      downloadBlob(`${baseName}_time_series.csv`, csvContent, 'text/csv;charset=utf-8;');
    } catch (error) {
      processingError = `Export failed: ${error.message}`;
      console.error("Export error:", error);
    }
  }
  
  function handleExportSummaryJson() {
    if (!aggregationResult || !file) return;
    
    try {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const jsonContent = buildSummaryJson(aggregationResult);
      downloadBlob(`${baseName}_summary.json`, jsonContent, 'application/json;charset=utf-8;');
    } catch (error) {
      processingError = `Export failed: ${error.message}`;
      console.error("Export error:", error);
    }
  }
  
  function handleExportSummaryMd() {
    if (!aggregationResult || !file) return;
    
    try {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const mdContent = buildSummaryMd(aggregationResult);
      downloadBlob(`${baseName}_summary.md`, mdContent, 'text/markdown;charset=utf-8;');
    } catch (error) {
      processingError = `Export failed: ${error.message}`;
      console.error("Export error:", error);
    }
  }
</script>

{#if file && headerFields}
  <div class="process-controls">
    <div class="control-header">
      <h3>Data Processing</h3>
    </div>
    
    <div class="control-body">
      <!-- Data Span Information Section -->
      {#if dataSpanInfo && detailedDataSpan}
        <div class="data-span-section">
          <h4>Data Span Information</h4>
          <div class="data-span-content">
            <div class="data-description">
              <strong>{detailedDataSpan.dataDescription}</strong>
            </div>
            
            <div class="data-details">
              <div class="detail-item">
                <span class="detail-label">Time Range:</span>
                <span class="detail-value">
                  {new Date(detailedDataSpan.minDate).toLocaleDateString()} to {new Date(detailedDataSpan.maxDate).toLocaleDateString()}
                </span>
              </div>
              
              <div class="detail-item">
                <span class="detail-label">Total Days:</span>
                <span class="detail-value">{detailedDataSpan.totalDays}</span>
              </div>
              
              <div class="detail-item">
                <span class="detail-label">Detected Granularity:</span>
                <span class="detail-value">{detailedDataSpan.likelyGranularity}</span>
              </div>
              
              <div class="detail-item">
                <span class="detail-label">Confidence:</span>
                <div class="confidence-container">
                  <div class="confidence-bar">
                    <div
                      class="confidence-fill"
                      class:high={detailedDataSpan.confidence > 0.9}
                      class:medium={detailedDataSpan.confidence > 0.7 && detailedDataSpan.confidence <= 0.9}
                      class:low={detailedDataSpan.confidence <= 0.7}
                      style="width: {detailedDataSpan.confidence * 100}%"
                    ></div>
                  </div>
                  <span class="confidence-text">{(detailedDataSpan.confidence * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
            
            <div class="data-span-explanation">
              <p>The data span detection analyzes your file to determine the time range, data frequency, and consistency of timestamps.</p>
              <p>Higher confidence indicates more regular time intervals between data points.</p>
            </div>
          </div>
        </div>
      {/if}
      <!-- Column Mapping Section -->
      <div class="mapping-section">
        <h4>Column Mapping</h4>
        <div class="mapping-controls">
          <div class="mapping-control">
            <label for="time-column">Time Column:</label>
            <select id="time-column" bind:value={timeColumn} aria-label="Time column">
              <option value="">Select column...</option>
              {#if headerFields && headerFields.length > 0}
                {#each headerFields as field}
                  <option value={field}>{field}</option>
                {/each}
              {:else}
                <option value="" disabled>No header fields detected</option>
              {/if}
            </select>
          </div>
          
          <div class="mapping-control">
            <label for="temp-column">Temperature Column:</label>
            <select id="temp-column" bind:value={tempColumn} aria-label="Temperature column">
              <option value="">Select column...</option>
              {#if headerFields && headerFields.length > 0}
                {#each headerFields as field}
                  <option value={field}>{field}</option>
                {/each}
              {:else}
                <option value="" disabled>No header fields detected</option>
              {/if}
            </select>
          </div>
          
          <div class="mapping-control">
            <label for="rh-column">Humidity Column:</label>
            <select id="rh-column" bind:value={rhColumn} aria-label="Humidity column">
              <option value="">Select column...</option>
              {#if headerFields && headerFields.length > 0}
                {#each headerFields as field}
                  <option value={field}>{field}</option>
                {/each}
              {:else}
                <option value="" disabled>No header fields detected</option>
              {/if}
            </select>
          </div>
        </div>
      </div>
      
      <!-- Processing Options Section -->
      <div class="options-section">
        <h4>Processing Options</h4>
        <div class="options-controls">
          <div class="option-control">
            <label for="timeline-unit">Timeline Unit:</label>
            <select id="timeline-unit" bind:value={timelineUnit}>
              <option value="auto">Auto-detect</option>
              <option value="hour">Hour</option>
              <option value="day">Day</option>
              <option value="month">Month</option>
            </select>
          </div>
          
          <div class="option-control">
            <label>
              <input type="checkbox" bind:checked={treatAsUTC} />
              Treat as UTC
            </label>
          </div>
          
          <div class="option-control cap-multiplier-control">
            <label for="cap-multiplier">Duration Cap Multiplier:</label>
            <div class="cap-control-row">
              <input
                type="number"
                id="cap-multiplier"
                bind:value={capMultiplier}
                min="1"
                max="10"
                step="0.5"
                aria-describedby="cap-info"
              />
              <button
                type="button"
                class="info-button"
                aria-label="Duration cap information"
                aria-expanded={showCapInfo}
                onclick={() => showCapInfo = !showCapInfo}
              >
                ⓘ
              </button>
            </div>

            {#if showCapInfo}
              <div id="cap-info" class="tooltip-box" role="region">
                <strong>Why this exists</strong>
                <p>Missing samples or device downtime can create very large gaps between timestamps. Without capping, those gaps would add large amounts of time to your zone totals.</p>
                <strong>How it works</strong>
                <p>The app computes the median interval between recent samples and caps each computed per-row duration to <em>median × multiplier</em> (default 4). This prevents single large gaps from inflating totals.</p>
                <strong>Example</strong>
                <p>If your data is hourly (median ≈ 1 hour) and multiplier = 4, any gap larger than 4 hours is counted as 4 hours to avoid over-counting sensor outages.</p>
                <strong>Guidance</strong>
                <p>Lower the multiplier to be stricter, or raise it if you expect legitimately long continuous conditions.</p>
              </div>
            {/if}
          </div>
        </div>
      </div>
      
      <!-- Process Button -->
      <button
        class="btn btn-primary"
        onclick={handleProcessData}
        disabled={isProcessing || !timeColumn || !tempColumn || !rhColumn}
      >
        {#if isProcessing}
          <span class="spinner"></span>
          Processing...
        {:else}
          Process Data
        {/if}
      </button>
      
      <!-- Button to process remotely fetched data -->
      {#if $fileStore.raw.file}
        <button
          class="btn btn-primary"
          onclick={handleProcessData}
          disabled={!timeColumn || !tempColumn || !rhColumn}
        >
          Process Remote Data
        </button>
      {/if}
      
      <!-- Error Message -->
      {#if processingError}
        <div class="error-message">
          <strong>Error:</strong> {processingError}
        </div>
      {/if}
      
      <!-- Success Message -->
      {#if aggregationResult && !isProcessing && !processingError}
        <div class="success-message">
          <strong>Success!</strong> Processed {aggregationResult.rowsCount} records.
          <br>
          Timeline unit: {aggregationResult.timelineUnit}
          <br>
          Data range: {new Date(aggregationResult.firstTs).toLocaleDateString()} to {new Date(aggregationResult.lastTs).toLocaleDateString()}
          {#if medianMs}
            <br>
            <small>Median interval: {formatDuration(medianMs)} — Effective cap: {formatDuration(effectiveCapMs)} (multiplier ×{capMultiplier})</small>
          {/if}
        </div>
        
        <!-- Export Section -->
        <div class="export-section">
          <h4>Export Options</h4>
          <div class="export-controls">
            <div class="export-buttons">
              <button class="btn btn-secondary" onclick={handleExportTimeSeries}>
                Export Time Series CSV
              </button>
              <button class="btn btn-secondary" onclick={handleExportSummaryJson}>
                Export Summary JSON
              </button>
              <button class="btn btn-secondary" onclick={handleExportSummaryMd}>
                Export Summary MD
              </button>
            </div>
            <button class="btn btn-primary" onclick={handleExportAll}>
              Export All Files
            </button>
            <p class="export-hint">Exports time_series.csv, summary.json, and summary.md</p>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .process-controls {
    margin: 1rem 0;
    padding: 1rem;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    background-color: #f9f9f9;
  }
  
  .control-header h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    color: #333;
  }
  
  .control-body {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .mapping-section, .options-section, .export-section {
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    padding: 1rem;
    background-color: white;
  }
  
  .mapping-section h4, .options-section h4, .export-section h4 {
    margin-top: 0;
    margin-bottom: 1rem;
    color: #555;
    font-size: 1rem;
  }
  
  .mapping-controls, .options-controls, .export-controls {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .export-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  
  .export-buttons .btn {
    flex: 1;
    min-width: 150px;
  }
  
  .mapping-control, .option-control {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .mapping-control label, .option-control label {
    font-weight: 500;
    color: #333;
  }
  
  select, input[type="number"] {
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.9rem;
  }
  
  input[type="checkbox"] {
    margin-right: 0.5rem;
  }
  
  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: background-color 0.2s;
  }
  
  .btn-primary {
    background-color: #3f51b5;
    color: white;
  }
  
  .btn-primary:hover:not(:disabled) {
    background-color: #303f9f;
  }
  
  .btn-secondary {
    background-color: #4caf50;
    color: white;
  }
  
  .btn-secondary:hover:not(:disabled) {
    background-color: #388e3c;
  }
  
  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: #fff;
    animation: spin 1s ease-in-out infinite;
    margin-right: 0.5rem;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .error-message {
    padding: 0.75rem;
    background-color: #ffebee;
    border-left: 4px solid #f44336;
    color: #c62828;
    border-radius: 4px;
  }
  
  .success-message {
    padding: 0.75rem;
    background-color: #e8f5e9;
    border-left: 4px solid #4caf50;
    color: #2e7d32;
    border-radius: 4px;
  }
  
  .export-hint {
    font-size: 0.8rem;
    color: #666;
    margin: 0.5rem 0 0 0;
  }
  
  .data-span-section {
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    padding: 1rem;
    background-color: white;
    margin-bottom: 1.5rem;
  }
  
  .data-span-section h4 {
    margin-top: 0;
    margin-bottom: 1rem;
    color: #555;
    font-size: 1rem;
  }
  
  .data-description {
    font-size: 1.1rem;
    font-weight: bold;
    color: #333;
    margin-bottom: 1rem;
    padding: 0.5rem;
    background-color: #f0f8ff;
    border-radius: 4px;
  }
  
  .data-details {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  
  .detail-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .detail-label {
    font-weight: 500;
    color: #333;
  }
  
  .detail-value {
    color: #555;
  }
  
  .confidence-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .confidence-bar {
    width: 100px;
    height: 12px;
    background-color: #e0e0e0;
    border-radius: 6px;
    overflow: hidden;
  }
  
  .confidence-fill {
    height: 100%;
    transition: width 0.3s ease;
  }
  
  .confidence-fill.high {
    background-color: #4caf50;
  }
  
  .confidence-fill.medium {
    background-color: #ff9800;
  }
  
  .confidence-fill.low {
    background-color: #f44336;
  }
  
  .confidence-text {
    font-size: 0.9rem;
    font-weight: 500;
  }
  
  .data-span-explanation {
    font-size: 0.85rem;
    color: #666;
    background-color: #f9f9f9;
    padding: 0.75rem;
    border-radius: 4px;
    border-left: 3px solid #3f51b5;
  }
  
  .data-span-explanation p {
    margin: 0.25rem 0;
  }

  /* Cap multiplier info styles */
  .cap-multiplier-control .cap-control-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .info-button {
    border: 1px solid #cbd5e0;
    background: white;
    border-radius: 50%;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.9rem;
    color: #3f51b5;
  }

  .tooltip-box {
    margin-top: 0.5rem;
    padding: 0.75rem;
    background: #fff;
    border: 1px solid #e0e6f8;
    box-shadow: 0 2px 6px rgba(47,63,150,0.06);
    border-radius: 6px;
    font-size: 0.85rem;
    color: #333;
  }

  .tooltip-box p { margin: 0.35rem 0; }
</style>