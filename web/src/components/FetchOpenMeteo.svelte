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
  // show/hide sections
  let showParameters = $state(false);
  let showLeafletMap = $state(false);
  import LeafletMap from './LeafletMap.svelte';
  import CityAutocomplete from './CityAutocomplete.svelte';
  let mapModuleLoaded = $state(true);
  
  // UI state
  let success = $state('');
  // Local geolocation error state (don't attempt to write to readonly `lastError` store)
  let geolocError = $state('');
  // Geolocation UI state
  let geolocLoading = $state(false);
  
  // Toggle showing parameters map UI
  function toggleParameters() {
    showParameters = !showParameters;
    success = '';
    if (showParameters) {
      url = builtUrl();
      scheduleUploadDebounced();
    }
  }

  // Toggle showing Leaflet map component (lazy loaded)
  async function openLeafletPreview() {
    // We already import LeafletMap statically for now — open preview
    showLeafletMap = true;
    url = builtUrl();
    scheduleUploadDebounced();
  }

  function closeLeafletPreview() {
    showLeafletMap = false;
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
    const final = finalUrl();
    const params = {
      url: final,
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
  
  
  // Derived URL from parameters (computed, doesn't overwrite manual input unless we explicitly copy)
  const builtUrl = $derived(() => buildUrl());
  // Final URL used for all uploads and network calls: if parameters or map UI active, use builtUrl, otherwise manual `url` value.
  const finalUrl = $derived(() => (showParameters || showLeafletMap) ? builtUrl() : url);
  
  // Auto-fetch when parameters change (only active when `Choose parameters` or Map preview are open)
  function triggerFetch() {
    const urlToUse = finalUrl();
    const params = { url: urlToUse, format: format };
    fileStore.fetchRemote(params);
  }

  // Debounced upload helpers
  let uploadDebounceTimer = null;
  const UPLOAD_DEBOUNCE_MS = 450;

  function scheduleUploadDebounced() {
    if (uploadDebounceTimer) clearTimeout(uploadDebounceTimer);
    uploadDebounceTimer = setTimeout(() => {
      const urlToUse = finalUrl();
      const params = { url: urlToUse, format: 'json' };
      fileStore.fetchRemote(params);
    }, UPLOAD_DEBOUNCE_MS);
  }

  function scheduleUploadImmediate() {
    if (uploadDebounceTimer) clearTimeout(uploadDebounceTimer);
    const urlToUse = finalUrl();
    const params = { url: urlToUse, format: 'json' };
    fileStore.fetchRemote(params);
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
      // If parameters or map UI is visible, update the URL and schedule a fetch
      if (showParameters || showLeafletMap) {
        url = builtUrl();
        scheduleUploadDebounced();
      }
    }
  }

  function handleCitySelected(city) {
    if (!city) return;
    lat = String(Number(city.lat).toFixed(6));
    lon = String(Number(city.lon).toFixed(6));
    selectedCity = city;
    selectedCityName = city.name;
    if (showParameters || showLeafletMap) {
      url = finalUrl();
      scheduleUploadDebounced();
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
    const currentLat = lat ? Number(lat).toFixed(6) : '';
    const currentLon = lon ? Number(lon).toFixed(6) : '';
    const cityLat = selectedCity && selectedCity.lat ? Number(selectedCity.lat).toFixed(6) : '';
    const cityLon = selectedCity && selectedCity.lon ? Number(selectedCity.lon).toFixed(6) : '';
    if (currentLat !== cityLat || currentLon !== cityLon) {
      selectedCityName = '';
      selectedCity = '';
      scheduleUploadDebounced();
    }
    // Always schedule upload for manual coordinate edits
    scheduleUploadDebounced();
  }

  function handleParameterChange() {
    // Keep the URL preview in sync and schedule an upload each time a parameter changes
    url = builtUrl();
    scheduleUploadDebounced();
  }

  function handleMapSelect(e) {
    if (!e || !e.detail) return;
    const { lat: newLat, lon: newLon } = e.detail;
    lat = String(Number(newLat).toFixed(6));
    lon = String(Number(newLon).toFixed(6));
    // selecting via the map is a 'manual coordinate' update: clear selected city
    selectedCityName = '';
    selectedCity = '';
    url = builtUrl();
    scheduleUploadDebounced();
  }

  function geolocateMe() {
    // Clear any prior success or error messages
    success = '';
    geolocError = '';
    if (!navigator.geolocation) {
      geolocError = 'Geolocation is not supported by your browser';
      return;
    }
    geolocLoading = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // Keep the same formatting as other coordinate handling
        lat = String(Number(latitude).toFixed(6));
        lon = String(Number(longitude).toFixed(6));
        selectedCityName = '';
        selectedCity = '';
        url = builtUrl();
        scheduleUploadDebounced();
        success = 'Updated coordinates from your device location';
        geolocError = '';
        geolocLoading = false;
      },
      (err) => {
        geolocLoading = false;
        geolocError = err?.message || 'Unable to determine location';
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }
  
</script>

<div class="fetch-container">
  <h2>Fetch Open-Meteo Weather Data</h2>
  
  <div class="mode-toggle">
    <button type="button" class="toggle-btn {showParameters ? 'active' : ''}" onclick={() => { showParameters = !showParameters; }}>Choose parameters</button>
    <button type="button" class="toggle-btn {showLeafletMap ? 'active' : ''}" onclick={() => { if (!mapModuleLoaded) openLeafletPreview(); else showLeafletMap = !showLeafletMap; }}>
      {#if showLeafletMap}Close Map Preview{:else}Open Map Preview{/if}
    </button>
  </div>
  
  <div class="form-group">
    <label for="url">API URL:</label>
    <input 
      id="url" 
      type="url" 
      bind:value={url} 
      placeholder="https://archive-api.open-meteo.com/v1/archive?..."
      class="url-input"
      oninput={() => { // when user manually edits URL, automatically upload the custom URL after a brief debounce
        scheduleUploadDebounced();
      }}
    />
  </div>

  {#if showParameters}
    <div class="params-grid">
        <div class="form-group">
          <label for="lat">Latitude:</label>
          <input id="lat" type="number" step="any" bind:value={lat} oninput={handleManualCoordinateChange} />
          <button type="button" class="map-inline-btn" onclick={openInMap} title="Open lat/lon in OpenStreetMap">Open in map</button>
        </div>
      
        <div class="form-group">
          <label for="lon">Longitude:</label>
          <input id="lon" type="number" step="any" bind:value={lon} oninput={handleManualCoordinateChange} />
          <button type="button" class="map-inline-btn" onclick={openInMap} title="Open lat/lon in OpenStreetMap">Open in map</button>
        </div>

        <div class="form-group">
          <label for="geolocate" style="display:none;">Geolocation actions</label>
          <div style="display:flex; gap:0.5rem; align-items:center;">
            <button id="geolocate" type="button" class="map-inline-btn" onclick={geolocateMe} disabled={geolocLoading} title="Use your device's location" aria-label="Use your current location">
              {#if geolocLoading}Locating...{:else}Use my location{/if}
            </button>
            <button id="resetCoordinates" type="button" class="map-inline-btn" onclick={() => { selectedCityName=''; selectedCity=''; url=builtUrl(); scheduleUploadDebounced(); geolocError=''; }} title="Reset to URL coordinates" aria-label="Reset coordinates to URL values">Reset</button>
          </div>
        </div>
      
      <div class="form-group">
        <label for="startDate">Start Date:</label>
        <input id="startDate" type="date" bind:value={startDate} onchange={handleParameterChange} />
      </div>
      
      <div class="form-group">
        <label for="endDate">End Date:</label>
        <input id="endDate" type="date" bind:value={endDate} onchange={handleParameterChange} />
      </div>
      
      <div class="form-group">
        <label for="hourly">Hourly Variables:</label>
        <input 
          id="hourly"
          type="text" 
          bind:value={hourly} 
          placeholder="temperature_2m,relative_humidity_2m"
          oninput={handleParameterChange}
        />
      </div>

      <!-- City selection moved to Use Map mode -->
      
      <!-- Output format is below (global control) -->
    </div>
    
    <!-- URL preview removed here: we keep a single editable API URL field at the top -->
  {/if}
  {#if showLeafletMap}
    <div class="map-mode">
      <div class="map-controls">
        <div class="form-group">
          <label for="citySelect">City (autocomplete):</label>
          <CityAutocomplete bind:value={selectedCityName} {cities} placeholder="Search or choose a city" select={handleCitySelected} />
        </div>

          {#if !showParameters}
            <!-- Map preview should show only the map and allow click to set coordinates. Remove static details but add date inputs for convenience. -->
            <div class="map-controls-mini">
              <div class="form-group">
                <label for="startDateMap">Start Date:</label>
                <input id="startDateMap" type="date" bind:value={startDate} onchange={handleParameterChange} />
              </div>
              <div class="form-group">
                <label for="endDateMap">End Date:</label>
                <input id="endDateMap" type="date" bind:value={endDate} onchange={handleParameterChange} />
              </div>
            </div>
          {/if}
      </div>

      <div class="map-preview">
        <div class="map-header">
          <div>Map preview — centered on: {lat}, {lon}</div>
        </div>
        {#if mapModuleLoaded}
          <LeafletMap lat={Number(lat)} lon={Number(lon)} on:select={handleMapSelect} />
        {:else}
          <iframe
          title="OpenStreetMap preview"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(lon) - 0.6},${Number(lat) - 0.3},${Number(lon) + 0.6},${Number(lat) + 0.3}&layer=mapnik&marker=${lat},${lon}`}
          width="100%"
          height="350"
          frameborder="0"
          style="border: 1px solid var(--border-color, #dee2e6); border-radius: 4px;"
          ></iframe>
        {/if}
      </div>
    </div>
  {/if}

  {#if showMap && showParameters}
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
    <select id="format" bind:value={format} onchange={handleParameterChange}>
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
  {#if geolocError}
    <div class="error-message">{geolocError}</div>
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

  .map-controls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .map-controls-mini {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  /* no additional coordinates summary styles required */

  /* no longer used — keep for compatibility if we later convert to field labels */
  
  /* url-preview & preview-url removed; main `API URL` is the single source of truth */
  
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