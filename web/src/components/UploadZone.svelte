<script>
  import { parseCsvStream } from '../utils/dataProcessor.js';
  import { createEventDispatcher } from 'svelte';

  let { onFileParsed = null } = $props();
  const dispatch = createEventDispatcher();
  
  let statusText = $state('');
  let parsedRowCount = $state(0);
  let dayFirst = $state(null);
  let dragActive = $state(false);
  
  /**
   * Handle file input change and parse CSV using streaming API
   */
  async function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;
    await processFile(file);
  }
  
  /**
   * Process file using streaming API
   */
  async function processFile(file) {
    statusText = `Reading ${file.name}...`;
    parsedRowCount = 0;
    dayFirst = null;
    
    try {
      // Use the streaming parser to get header fields and sample rows
      statusText = 'Parsing CSV header and samples...';
      
      const {
        headerFields,
        sampleRows,
        dayFirst: detectedDayFirst,
        samplesUsed,
        minDate,
        maxDate,
        estimatedSpanDays,
        samplesPerDay
      } = await parseCsvStream(file, {
        sampleRows: 50,
        headerRowIndex: 0
      });
      
      parsedRowCount = samplesUsed;
      dayFirst = detectedDayFirst;
      
      statusText = `Parsed ${samplesUsed} sample rows; detected day-first: ${detectedDayFirst}`;
      
      // Create data span information object
      const dataSpanInfo = {
        minDate,
        maxDate,
        estimatedSpanDays,
        samplesPerDay
      };
      
      // Emit custom event with parsed data
      console.log('UploadZone: Dispatching fileparsed event with:', {
        file: file.name,
        headerFieldsCount: headerFields.length,
        sampleRowsCount: sampleRows.length,
        dayFirst: detectedDayFirst,
        dataSpanInfo
      });
      
      // Try both dispatch methods for compatibility
      try {
        dispatch('fileparsed', {
          file,
          headerFields,
          sampleRows,
          dayFirst: detectedDayFirst,
          dataSpanInfo
        });
        console.log('UploadZone: Event dispatched successfully');
      } catch (error) {
        console.error('UploadZone: Error dispatching event:', error);
      }
      
      // Call callback prop with parsed data (for backward compatibility)
      if (typeof onFileParsed === 'function') {
        onFileParsed({
          file,
          headerFields,
          sampleRows,
          dayFirst: detectedDayFirst,
          dataSpanInfo
        });
      }
      
    } catch (error) {
      console.error('Error parsing CSV:', error);
      statusText = `Error: ${error.message}`;
    }
  }
  
  /**
   * Handle drag events
   */
  function handleDragOver(event) {
    event.preventDefault();
    dragActive = true;
  }
  
  function handleDragLeave(event) {
    event.preventDefault();
    dragActive = false;
  }
  
  function handleDrop(event) {
    event.preventDefault();
    dragActive = false;
    
    const file = event.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      processFile(file);
    } else {
      statusText = 'Error: Please upload a CSV file';
    }
  }
</script>

<div class="upload-zone" class:active={dragActive}>
  <input
    type="file"
    accept=".csv"
    onchange={handleFileChange}
    id="file-input"
    class="file-input"
  />
  <label
    for="file-input"
    class="file-label"
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    <div class="upload-icon">📁</div>
    <p>Click to upload a CSV file or drag and drop</p>
    <p class="upload-hint">CSV files only</p>
  </label>
  
  {#if statusText}
    <div class="status-text">
      {statusText}
    </div>
  {/if}
</div>

<style>
  .upload-zone {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    border: 2px dashed #ccc;
    border-radius: 4px;
    background-color: #f9f9f9;
    transition: all 0.3s ease;
  }
  
  .upload-zone:hover, .upload-zone.active {
    border-color: #007bff;
    background-color: #f0f8ff;
  }
  
  .file-input {
    position: absolute;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
  
  .file-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    width: 100%;
    height: 100%;
  }
  
  .upload-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }
  
  .upload-hint {
    font-size: 0.8rem;
    color: #666;
    margin-top: 0.5rem;
  }
  
  .status-text {
    margin-top: 1rem;
    font-size: 0.9rem;
    color: #333;
    text-align: center;
  }
</style>