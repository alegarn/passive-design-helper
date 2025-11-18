<script>
  import { rawData, mapping, results, setResults, isMappingComplete } from '../stores/uiStore.js';
  import { processData } from '../utils/dataProcessor.js';
  import { W_from_RH_T } from '../../../scripts/psychro/math.js';
       
  // Reactive variables from stores
  $: rawDataValue = $rawData;
  $: mappingValue = $mapping;
  $: isMappingCompleteValue = $isMappingComplete;
  
  // Local state variables
  let isProcessing = false;
  let processingError = null;
  let processedData = null;
  
  // Function to handle data processing
  async function handleProcessData() {
    if (!rawDataValue || rawDataValue.length === 0) {
      processingError = "No data available to process";
      return;
    }
    
    if (!isMappingCompleteValue) {
      processingError = "Please complete the column mapping before processing";
      return;
    }
    
    try {
      isProcessing = true;
      processingError = null;
      
      // Process the data using the dataProcessor module
      const result = await processData(rawDataValue, mappingValue);
      
      // Update the results store with the processed data
      processedData = result.data;
      
      // Convert rowsWithDur (temp in °C, rh in percent) to renderer-friendly points {T, W}
      const psychroPoints = (processedData.rowsWithDur || []).map(r => {
        const RH = Number(r.rh) / 100; // percent -> 0-1
        const T = Number(r.temp);
        const W = Number.isFinite(RH) ? W_from_RH_T(RH, T, 101325) : 0;
        return { T, W, id: r.index || undefined };
      });
      
      setResults({
        data: processedData,
        psychrometricData: psychroPoints,
        comfortZones: null, // Will be calculated later
        tactics: null // Will be calculated later
      });
      
    } catch (error) {
      processingError = error.message || "An error occurred during processing";
      console.error("Data processing error:", error);
    } finally {
      isProcessing = false;
    }
  }
</script>

{#if rawDataValue && rawDataValue.length > 0 && isMappingCompleteValue}
  <div class="process-controls">
    <div class="control-header">
      <h3>Data Processing</h3>
    </div>
    
    <div class="control-body">
      <button 
        class="btn btn-primary" 
        on:click={handleProcessData}
        disabled={isProcessing}
      >
        {#if isProcessing}
          <span class="spinner"></span>
          Processing...
        {:else}
          Process Data
        {/if}
      </button>
      
      {#if processingError}
        <div class="error-message">
          <strong>Error:</strong> {processingError}
        </div>
      {/if}
      
      {#if processedData && !isProcessing && !processingError}
        <div class="success-message">
          <strong>Success!</strong> Processed {processedData.stats.rowsCount} records.
          <br>
          Data range: {new Date(processedData.stats.firstTs).toLocaleDateString()} to {new Date(processedData.stats.lastTs).toLocaleDateString()}
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
    gap: 1rem;
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
</style>