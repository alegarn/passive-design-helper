<script>
  import { fetchOpenMeteo, loading, error } from '../stores/fileStore.js';
  
  // Form state
  let url = $state('https://archive-api.open-meteo.com/v1/archive?latitude=52.52&longitude=13.41&start_date=2025-11-16&end_date=2025-11-17&hourly=temperature_2m,relative_humidity_2m');
  let lat = $state('52.52');
  let lon = $state('13.41');
  let startDate = $state('2025-11-16');
  let endDate = $state('2025-11-17');
  let hourly = $state('temperature_2m,relative_humidity_2m');
  let format = $state('csv');
  let useParams = $state(false);
  
  // UI state
  let success = $state('');
  
  // Toggle between URL and parameters mode
  function toggleMode() {
    useParams = !useParams;
    error.set('');
    success = '';
  }
  
  // Build URL from parameters
  function buildUrl() {
    const baseUrl = 'https://archive-api.open-meteo.com/v1/archive';
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      start_date: startDate,
      end_date: endDate,
      hourly: hourly
    });
    return `${baseUrl}?${params.toString()}`;
  }
  
  // Fetch data and trigger download
  async function fetchAndDownload() {
    success = '';
    
    try {
      const params = useParams ? {
        latitude: lat,
        longitude: lon,
        start_date: startDate,
        end_date: endDate,
        hourly: hourly,
        format: format
      } : {
        url: url,
        format: format
      };
      
      await fetchOpenMeteo(params);
      
      // Generate filename for download
      const filename = `open-meteo-${startDate}-${endDate}.${format}`;
      
      // Get the data from the store for download
      const response = await fetch(useParams ? buildUrl() : url);
      const data = await response.json();
      
      let content;
      let mimeType;
      
      if (format === 'csv') {
        // Import jsonToCsv from dataProcessor
        const { jsonToCsv } = await import('../utils/dataProcessor.js');
        content = jsonToCsv(data);
        mimeType = 'text/csv';
      } else {
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
      }
      
      // Create blob and trigger download
      const blob = new Blob([content], { type: mimeType });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      
      const recordCount = data.hourly?.time?.length || 0;
      success = `Downloaded ${recordCount} records to ${filename}`;
      
    } catch (err) {
      // Error is already handled by the store, but we can add additional UI feedback if needed
      console.error('Fetch error in component:', err);
    }
  }
  
  
  // Update URL when parameters change (if in parameter mode)
  $effect(() => {
    if (useParams) {
      url = buildUrl();
    }
  });
  
  // Track individual previous parameters to detect changes
  let prevLat = $state(lat);
  let prevLon = $state(lon);
  let prevStartDate = $state(startDate);
  let prevEndDate = $state(endDate);
  let prevHourly = $state(hourly);
  let prevFormat = $state(format);
  let initialLoad = $state(true);
  
  // Auto-fetch when parameters change in parameter mode
  $effect(() => {
    if (useParams && !initialLoad && (
      prevLat !== lat ||
      prevLon !== lon ||
      prevStartDate !== startDate ||
      prevEndDate !== endDate ||
      prevHourly !== hourly ||
      prevFormat !== format
    )) {
      // Update previous parameters
      prevLat = lat;
      prevLon = lon;
      prevStartDate = startDate;
      prevEndDate = endDate;
      prevHourly = hourly;
      prevFormat = format;
      
      // Trigger fetch with new parameters
      const params = {
        latitude: lat,
        longitude: lon,
        start_date: startDate,
        end_date: endDate,
        hourly: hourly,
        format: format
      };
      
      fetchOpenMeteo(params);
    }
    
    // Set initialLoad to false after first run
    if (initialLoad) {
      initialLoad = false;
    }
  });
  
</script>

<div class="fetch-container">
  <h2>Fetch Open-Meteo Weather Data</h2>
  
  <div class="mode-toggle">
    <button 
      type="button" 
      class="toggle-btn {!useParams ? 'active' : ''}"
      on:click={toggleMode}
    >
      Use URL
    </button>
    <button 
      type="button" 
      class="toggle-btn {useParams ? 'active' : ''}"
      on:click={toggleMode}
    >
      Use Parameters
    </button>
  </div>
  
  {#if !useParams}
    <div class="form-group">
      <label for="url">API URL:</label>
      <input 
        id="url"
        type="url" 
        bind:value={url} 
        placeholder="https://archive-api.open-meteo.com/v1/archive?..."
        class="url-input"
      />
    </div>
  {:else}
    <div class="params-grid">
      <div class="form-group">
        <label for="lat">Latitude:</label>
        <input id="lat" type="number" step="any" bind:value={lat} />
      </div>
      
      <div class="form-group">
        <label for="lon">Longitude:</label>
        <input id="lon" type="number" step="any" bind:value={lon} />
      </div>
      
      <div class="form-group">
        <label for="startDate">Start Date:</label>
        <input id="startDate" type="date" bind:value={startDate} />
      </div>
      
      <div class="form-group">
        <label for="endDate">End Date:</label>
        <input id="endDate" type="date" bind:value={endDate} />
      </div>
      
      <div class="form-group">
        <label for="hourly">Hourly Variables:</label>
        <input 
          id="hourly"
          type="text" 
          bind:value={hourly} 
          placeholder="temperature_2m,relative_humidity_2m"
        />
      </div>
      
      <div class="form-group">
        <label for="format">Format:</label>
        <select id="format" bind:value={format}>
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
        </select>
      </div>
    </div>
    
    <div class="url-preview">
      <label>Generated URL:</label>
      <input type="url" value={url} readonly class="preview-url" />
    </div>
  {/if}
  
  <div class="form-group">
    <label for="format">Output Format:</label>
    <select id="format" bind:value={format}>
      <option value="json">JSON</option>
      <option value="csv">CSV</option>
    </select>
  </div>
  
  <button
    type="button"
    class="fetch-btn {$loading ? 'loading' : ''}"
    on:click={fetchAndDownload}
    disabled={$loading}
  >
    {#if $loading}
      Fetching...
    {:else}
      Fetch & Download
    {/if}
  </button>
  
  {#if $error}
    <div class="error-message">{$error}</div>
  {/if}
  
  {#if success}
    <div class="success-message">{success}</div>
  {/if}
</div>

<style>
  .fetch-container {
    background: var(--card-bg, #ffffff);
    border: 1px solid var(--border-color, #dee2e6);
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1rem;
  }
  
  h2 {
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--text-color, #333);
  }
  
  .mode-toggle {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  
  .toggle-btn {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-color, #dee2e6);
    background: var(--button-bg, #f8f9fa);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s ease;
  }
  
  .toggle-btn:hover {
    background: var(--button-hover-bg, #e9ecef);
  }
  
  .toggle-btn.active {
    background: var(--primary-color, #007bff);
    color: white;
    border-color: var(--primary-color, #007bff);
  }
  
  .form-group {
    margin-bottom: 1rem;
  }
  
  label {
    display: block;
    margin-bottom: 0.25rem;
    font-weight: 500;
    color: var(--text-color, #333);
  }
  
  input, select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border-color, #dee2e6);
    border-radius: 4px;
    font-size: 0.875rem;
  }
  
  .url-input {
    font-family: monospace;
    font-size: 0.75rem;
  }
  
  .params-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }
  
  .url-preview {
    margin-bottom: 1rem;
  }
  
  .preview-url {
    font-family: monospace;
    font-size: 0.75rem;
    background: var(--code-bg, #f8f9fa);
  }
  
  .fetch-btn {
    background: var(--primary-color, #007bff);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.2s ease;
  }
  
  .fetch-btn:hover:not(:disabled) {
    background: var(--primary-hover-color, #0056b3);
  }
  
  .fetch-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .fetch-btn.loading {
    background: var(--secondary-color, #6c757d);
  }
  
  .error-message {
    background: #f8d7da;
    color: #721c24;
    padding: 0.75rem;
    border-radius: 4px;
    margin-top: 1rem;
    border: 1px solid #f5c6cb;
  }
  
  .success-message {
    background: #d4edda;
    color: #155724;
    padding: 0.75rem;
    border-radius: 4px;
    margin-top: 1rem;
    border: 1px solid #c3e6cb;
  }
</style>