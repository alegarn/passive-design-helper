<script>
  import { fileStore, isLoading, lastError } from '../stores/fileStore.js';
  import { cities } from '../data/cities.js';
  
  // Form state
  let url = $state('https://archive-api.open-meteo.com/v1/archive?latitude=52.52&longitude=13.41&start_date=2025-11-16&end_date=2025-11-17&hourly=temperature_2m,relative_humidity_2m');
  let lat = $state('52.52');
  let lon = $state('13.41');
  let selectedCity = $state('');
  let selectedCityName = $state('');
  let showMap = $state(false);
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
  
async function fetchAndDownload() {
  success = '';

  try {
    // Ensure we always pass a concrete URL to the store and request JSON from the API.
    // The component still allows the user to download JSON or CSV, but the store
    // needs a parsed JSON payload for column/header detection.
    const finalUrl = useParams ? buildUrl() : url;
    const params = {
      url: finalUrl,
      format: 'json' // always fetch JSON so normalizer can extract headers/samples
    };

    // Use the new fileStore API - get the normalized data result
    const requestInfo = fileStore.fetchRemote(params);
    const { result, rawPayload } = await requestInfo;

    // Generate filename for download (use selected output format)
    const filename = `open-meteo-${startDate}-${endDate}.${format}`;

    // Prepare download content according to user's chosen format
    let content;
    let mimeType;

    if (format === 'csv') {
      // Convert the JSON payload to CSV for download, but keep the store working with JSON
      // Use static import to prevent duplicate chunks
      // eslint-disable-next-line no-unused-vars
      const { jsonToCsv } = await import('../utils/dataProcessor.js');
      content = jsonToCsv(rawPayload);
      mimeType = 'text/csv';
    } else {
      content = JSON.stringify(rawPayload, null, 2);
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

    // Prefer rawPayload for Open-Meteo hourly count; fallback to result for other shapes
    const recordCount = rawPayload?.hourly?.time?.length ?? result?.hourly?.time?.length ?? 0;
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
  
  // Auto-fetch when parameters change in parameter mode
  function triggerFetch() {
    if (useParams) {
      const params = {
        latitude: lat,
        longitude: lon,
        start_date: startDate,
        end_date: endDate,
        hourly: hourly,
        format: format
      };
      fileStore.fetchRemote(params);
    }
  }

  // When a city is selected, update the lat/lon fields
  function selectCity() {
    if (!selectedCityName) return;
    const city = cities.find(c => c.name === selectedCityName);
    if (city) {
      // store lat/lon as strings to preserve exact input format and binding behavior
      lat = String(Number(city.lat).toFixed(6));
      lon = String(Number(city.lon).toFixed(6));
      selectedCity = city;
      // If we are in params mode, automatically update the URL preview
      if (useParams) url = buildUrl();
    }
  }

  function openInMap() {
    const mapLat = encodeURIComponent(lat || 0);
    const mapLon = encodeURIComponent(lon || 0);
    const url = `https://www.openstreetmap.org/?mlat=${mapLat}&mlon=${mapLon}#map=10/${mapLat}/${mapLon}`;
    window.open(url, '_blank');
  }

  function toggleMap() {
    showMap = !showMap;
  }

  // Clear selected city when user manually edits lat/lon inputs (avoids $effect and keeps logic local)
  function handleManualCoordinateChange() {
    if (!selectedCity) return;
    const currentLat = lat ? Number(lat).toFixed(6) : '';
    const currentLon = lon ? Number(lon).toFixed(6) : '';
    const cityLat = selectedCity && selectedCity.lat ? Number(selectedCity.lat).toFixed(6) : '';
    const cityLon = selectedCity && selectedCity.lon ? Number(selectedCity.lon).toFixed(6) : '';
    if (currentLat !== cityLat || currentLon !== cityLon) {
      selectedCityName = '';
      selectedCity = '';
    }
  }
  
</script>

<div class="fetch-container">
  <h2>Fetch Open-Meteo Weather Data</h2>
  
  <div class="mode-toggle">
    <button
      type="button"
      class="toggle-btn {!useParams ? 'active' : ''}"
      onclick={toggleMode}
    >
      Use URL
    </button>
    <button
      type="button"
      class="toggle-btn {useParams ? 'active' : ''}"
      onclick={toggleMode}
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
        <input id="lat" type="number" step="any" bind:value={lat} oninput={handleManualCoordinateChange} />
        <button type="button" class="map-inline-btn" onclick={openInMap} title="Open lat/lon in OpenStreetMap">Open in map</button>
        <button type="button" class="map-inline-btn" onclick={toggleMap} title="Toggle inline map preview">Preview map</button>
      </div>
      
      <div class="form-group">
        <label for="lon">Longitude:</label>
        <input id="lon" type="number" step="any" bind:value={lon} oninput={handleManualCoordinateChange} />
        <button type="button" class="map-inline-btn" onclick={openInMap} title="Open lat/lon in OpenStreetMap">Open in map</button>
        <button type="button" class="map-inline-btn" onclick={toggleMap} title="Toggle inline map preview">Preview map</button>
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
        <label for="citySelect">City (choose to update coordinates):</label>
        <select id="citySelect" bind:value={selectedCityName} onchange={selectCity}>
          <option value="">-- Custom / Select city --</option>
          {#each cities as city}
            <option value={city.name}>{city.name}</option>
          {/each}
        </select>
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
      <label for="previewUrl">Generated URL:</label>
      <input id="previewUrl" type="url" value={url} readonly class="preview-url" />
    </div>
  {/if}

  {#if showMap}
    <div class="map-preview">
      <div class="map-header">
        <div>Map preview — centered on: {lat}, {lon}</div>
        <button type="button" class="map-inline-btn" onclick={toggleMap}>Close</button>
      </div>
      <iframe
        title="OpenStreetMap preview"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(lon) - 0.6},${Number(lat) - 0.3},${Number(lon) + 0.6},${Number(lat) + 0.3}&layer=mapnik&marker=${lat},${lon}`}
        width="100%"
        height="350"
        frameborder="0"
        style="border: 1px solid var(--border-color, #dee2e6); border-radius: 4px;"
      ></iframe>
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
    class="fetch-btn {$isLoading ? 'loading' : ''}"
    onclick={fetchAndDownload}
    disabled={$isLoading}
  >
    {#if $isLoading}
      Fetching...
    {:else}
      Fetch & Download
    {/if}
  </button>
  
  {#if $lastError}
    <div class="error-message">{$lastError}</div>
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

  .map-inline-btn {
    margin-top: 0.4rem;
    margin-left: 0.5rem;
    padding: 0.35rem 0.45rem;
    font-size: 0.8rem;
    border-radius: 4px;
    border: 1px solid var(--border-color, #dee2e6);
    background: var(--button-bg, #f8f9fa);
    cursor: pointer;
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

  .map-preview {
    margin-top: 1rem;
  }

  .map-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
</style>