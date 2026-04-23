<script>
  import { fileStore, isLoading, lastError } from '../stores/fileStore.js';
  import { cities } from '../data/cities.js';
  import LeafletMap from './LeafletMap.svelte';
  import CityAutocomplete from './CityAutocomplete.svelte';
  
  let { onAnalyze = null } = $props();
  
  // Form state
  const DEFAULT_CITY = cities.find((city) => city.name === 'Berlin') ?? cities[0] ?? { name: 'Berlin', lat: 52.52, lon: 13.41 };
  const DEFAULT_START_DATE = '2025-01-01';
  const DEFAULT_END_DATE = '2025-12-31';
  const DEFAULT_YEAR = DEFAULT_START_DATE.slice(0, 4);

  let lat = $state(String(Number(DEFAULT_CITY.lat).toFixed(6)));
  let lon = $state(String(Number(DEFAULT_CITY.lon).toFixed(6)));
  let selectedCity = $state(DEFAULT_CITY);
  let selectedCityName = $state(DEFAULT_CITY.name);
  let selectedYear = $state(DEFAULT_YEAR);
  let showMap = $state(false);
  let startDate = $state(DEFAULT_START_DATE);
  let endDate = $state(DEFAULT_END_DATE);
  let hourly = $state('temperature_2m,relative_humidity_2m');
  let url = $state(`https://archive-api.open-meteo.com/v1/archive?latitude=${DEFAULT_CITY.lat}&longitude=${DEFAULT_CITY.lon}&start_date=${DEFAULT_START_DATE}&end_date=${DEFAULT_END_DATE}&hourly=temperature_2m,relative_humidity_2m`);
  let format = $state('csv');
  // show/hide sections
  let showAdvanced = $state(false);
  let showParameters = $state(false);
  let showLeafletMap = $state(false);
  
  // UI state
  let success = $state('');
  // Transient state to animate input flash when coords are updated
  let coordsUpdated = $state(false);
  // Geolocation UI state
  let geolocLoading = $state(false);
  let geolocSuccess = $state(false);
  
  // Toggle showing parameters map UI
  function toggleParameters() {
    showParameters = !showParameters;
    success = '';
    if (showParameters) {
      url = buildUrl();
    }
  }

  function toggleLeafletPreview() {
    showLeafletMap = !showLeafletMap;
    if (showLeafletMap) {
      url = buildUrl();
    }
  }

  function toggleAdvanced() {
    showAdvanced = !showAdvanced;
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

  function handleYearChange(event) {
    const nextYear = String(event.currentTarget.value || '').slice(0, 4);
    selectedYear = nextYear;
    if (!/^\d{4}$/.test(nextYear)) return;

    startDate = `${nextYear}-01-01`;
    endDate = `${nextYear}-12-31`;
    url = buildUrl();
  }
  
async function fetchAndDownload() {
  success = '';

  try {
    // Ensure we always pass a concrete URL to the store and request JSON from the API.
    // The component still allows the user to download JSON or CSV, but the store
    // needs a parsed JSON payload for column/header detection.
    const final = finalUrl;
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
      const { jsonToCsv } = await import('../utils/jsonToCsv.js');
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

  async function analyzeRemoteData() {
    success = '';

    try {
      const params = {
        url: finalUrl,
        format: 'json'
      };

      await fileStore.fetchRemote(params);

      if (typeof onAnalyze === 'function') {
        await onAnalyze();
      }

      success = 'Fetched weather data for analysis';
    } catch (err) {
      console.error('Analyze error in component:', err);
    }
  }
  
  
  // Derived URL from parameters for the casual city/year workflow.
  const builtUrl = $derived(buildUrl());
  const finalUrl = $derived(url);

  function scheduleUploadDebounced() {
    url = buildUrl();
  }

  function scheduleUploadImmediate() {
    url = buildUrl();
  }

  function handleCitySelected(city) {
    if (!city) return;
    lat = String(Number(city.lat).toFixed(6));
    lon = String(Number(city.lon).toFixed(6));
    selectedCity = city;
    selectedCityName = city.name;
    url = buildUrl();
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
      selectedCity = null;
    }
    url = buildUrl();
  }

  function handleParameterChange() {
    selectedYear = startDate.slice(0, 4);
    url = buildUrl();
  }

  function handleMapSelect(e) {
    if (!e || !e.detail) return;
    const { lat: newLat, lon: newLon } = e.detail;
    lat = String(Number(newLat).toFixed(6));
    lon = String(Number(newLon).toFixed(6));
    selectedCityName = '';
    selectedCity = null;
    url = buildUrl();
  }

  function geolocateMe() {
    // Clear any prior success or error messages
    success = '';
    // Clear global store error to ensure the geolocation flow starts clean
    fileStore.setMetaLastError(null);
    geolocSuccess = false;
    if (!navigator.geolocation) {
      fileStore.setMetaLastError('Geolocation is not supported by your browser');
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
        selectedCity = null;
        url = buildUrl();
        success = 'Updated coordinates from your device location';
        coordsUpdated = true;
        setTimeout(() => { coordsUpdated = false; }, 650);
        fileStore.setMetaLastError(null);
        geolocSuccess = true;
        setTimeout(() => { geolocSuccess = false; }, 2000);
        geolocLoading = false;
      },
      (err) => {
        geolocLoading = false;
        fileStore.setMetaLastError(err?.message || 'Unable to determine location');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }
  
</script>

<div class="fetch-container">
  <h2>Fetch Open-Meteo Weather Data</h2>
  {#if showAdvanced}
    <div class="advanced-header">
      <div>
        <p class="panel-label">Advanced tools</p>
        <p class="panel-description">Reveal the older fetch and processing controls.</p>
      </div>
      <button type="button" class="toggle-btn toggle-btn--primary" onclick={toggleAdvanced}>Back to casual view</button>
    </div>

    <div class="mode-toggle">
      <button type="button" class="toggle-btn {showParameters ? 'active' : ''}" onclick={toggleParameters}>Choose parameters</button>
      <button type="button" class="toggle-btn {showLeafletMap ? 'active' : ''}" onclick={toggleLeafletPreview}>
        {#if showLeafletMap}Close Map Preview{:else}Open Map Preview{/if}
      </button>
      <div class="tooltip-wrap">
        <button id="geolocate" type="button" class="toggle-btn mode-locate-btn" onclick={geolocateMe} disabled={geolocLoading} aria-disabled={geolocLoading} title="Use your device's location — Only used to construct the Open‑Meteo API query; not stored or shared." aria-label="Use your current location" aria-describedby="geolocate-tooltip">
        {#if geolocLoading}
          <span class="spinner" aria-hidden="true"></span>
          <span class="btn-text" style="margin-left:0.35rem;">Locating…</span>
        {:else}
          {#if geolocSuccess}
            <svg class="icon icon--success" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
            </svg>
          {:else}
            <svg class="icon icon--pin" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
            </svg>
          {/if}
          <span class="btn-text" style="margin-left:0.35rem;">Locate me</span>
        {/if}
        </button>
        <div id="geolocate-tooltip" class="privacy-tooltip" role="tooltip">Only used to construct the Open‑Meteo API query; not stored or shared.</div>
        {#if geolocSuccess}
          <span class="geoloc-badge" role="status" aria-live="polite">Location accepted</span>
        {/if}
      </div>
    </div>

    <div class="form-group">
      <label for="format-advanced">Output Format:</label>
      <select id="format-advanced" bind:value={format} onchange={handleParameterChange}>
        <option value="json">JSON</option>
        <option value="csv">CSV</option>
      </select>
    </div>

    {#if showParameters}
      <div class="form-group">
        <label for="url">API URL:</label>
        <input
          id="url"
          type="url"
          bind:value={url}
          placeholder="https://archive-api.open-meteo.com/v1/archive?..."
          class="url-input"
        />
        <p class="field-help">Edit the URL directly if you want a fully manual fetch.</p>
      </div>

      <div class="params-grid">
          <div class="form-group geo-controls" role="group" aria-labelledby="geoControlsLabel">
            <div id="geoControlsLabel" class="sr-only">Geolocation actions</div>
            <div class="geo-stack">
              <button id="resetCoordinates" type="button" class="map-inline-btn" onclick={() => { lat = String(Number(DEFAULT_CITY.lat).toFixed(6)); lon = String(Number(DEFAULT_CITY.lon).toFixed(6)); selectedCityName = DEFAULT_CITY.name; selectedCity = DEFAULT_CITY; selectedYear = DEFAULT_YEAR; startDate = DEFAULT_START_DATE; endDate = DEFAULT_END_DATE; url = buildUrl(); fileStore.setMetaLastError(null); geolocSuccess = false; geolocLoading = false; coordsUpdated = false; }} title="Reset to the default city" aria-label="Reset coordinates to the default city">Use default city</button>
              <button id="openMap" type="button" class="map-inline-btn" onclick={openInMap} title="Open lat/lon in OpenStreetMap" aria-label="Open coordinates in OpenStreetMap">Open in map</button>
            </div>
          </div>
          <div class="form-group">
            <label for="lat">Latitude:</label>
            <input id="lat" type="number" step="any" bind:value={lat} oninput={handleManualCoordinateChange} class:flash={coordsUpdated} />
          </div>
        
          <div class="form-group">
            <label for="lon">Longitude:</label>
            <input id="lon" type="number" step="any" bind:value={lon} oninput={handleManualCoordinateChange} class:flash={coordsUpdated} />
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

      </div>
    {/if}

    {#if showLeafletMap}
      <div class="map-mode">
        <div class="map-controls">
          <div class="form-group">
            <label for="citySelect">City (autocomplete):</label>
            <CityAutocomplete inputId="citySelect" bind:value={selectedCityName} {cities} placeholder="Search or choose a city" select={handleCitySelected} />
          </div>

            {#if !showParameters}
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
          <LeafletMap lat={Number(lat)} lon={Number(lon)} on:select={handleMapSelect} />
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

    <div class="action-row action-row--advanced">
      <button
        type="button"
        class="fetch-btn fetch-btn--primary {$isLoading ? 'loading' : ''}"
        onclick={analyzeRemoteData}
        disabled={$isLoading}
      >
        {#if $isLoading}
          Analyzing...
        {:else}
          Analyze
        {/if}
      </button>

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
    </div>
  {:else}
    <div class="casual-grid">
      <div class="form-group">
        <label for="city-search">Location:</label>
        <CityAutocomplete
          inputId="city-search"
          bind:value={selectedCityName}
          {cities}
          placeholder="Search a city or keep the default"
          select={handleCitySelected}
        />
        <p class="field-help">Default city: {DEFAULT_CITY.name}. Or open the map and click a location.</p>
      </div>

      <div class="form-group">
        <label for="year">Year:</label>
        <input
          id="year"
          type="number"
          min="1940"
          max="2100"
          step="1"
          bind:value={selectedYear}
          oninput={handleYearChange}
        />
        <p class="field-help">This fetches hourly data from 1 Jan to 31 Dec.</p>
      </div>
    </div>

    <p class="selection-summary">
      Using {selectedCity?.name ?? 'custom coordinates'} at {lat}, {lon} for {selectedYear || DEFAULT_YEAR}.
    </p>

    <div class="casual-footer">
      <div class="form-group casual-format">
        <label for="format-casual">Output Format:</label>
        <select id="format-casual" bind:value={format} onchange={handleParameterChange}>
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
        </select>
      </div>

      <div class="action-row">
        <button
          type="button"
          class="fetch-btn fetch-btn--primary {$isLoading ? 'loading' : ''}"
          onclick={analyzeRemoteData}
          disabled={$isLoading}
        >
          {#if $isLoading}
            Analyzing...
          {:else}
            Analyze
          {/if}
        </button>

        <button type="button" class="toggle-btn toggle-btn--secondary" onclick={toggleAdvanced}>
          Show advanced tools
        </button>
      </div>
    </div>
  {/if}
  
  {#if $lastError}
    <div class="error-message" aria-live="assertive" aria-atomic="true">{$lastError}</div>
  {/if}
  <!-- Geolocation errors are surfaced in the global `$lastError` store so they appear in the main error area -->
  
  {#if success}
    <div class="success-message" aria-live="polite" aria-atomic="true">{success}</div>
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
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .casual-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .field-help,
  .selection-summary {
    margin: 0.25rem 0 0;
    color: var(--muted-text-color, #5c6773);
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .selection-summary {
    margin-bottom: 1rem;
  }
  
  .toggle-btn {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-color, #dee2e6);
    background: var(--button-bg, #f8f9fa);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
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

  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
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
    min-width: 44px; /* touch target */
    min-height: 36px;
  }

  /* Ensure Locate me uses the same padding and behaviour as other toggle buttons; allow icon + text */
  .mode-toggle .mode-locate-btn {
    gap: 0.5rem;
  }

  /* Make toggle buttons share available space so three toggles fit on a single line on small screens */
  .mode-toggle .toggle-btn { flex: 1 1 0; min-width: 0; }

  /* Keep icon and text visible on larger screens, hide text on very small screens but maintain touch target */
  .mode-toggle .toggle-btn .btn-text { display: inline; }
  @media (max-width: 420px) {
    .mode-toggle .toggle-btn .btn-text { display: none; }
  }

  /* Tooltip wrapper for locate-me button; allow it to expand in the mode-toggle flex row */
  .tooltip-wrap {
    position: relative;
    display: block;
  }
  .mode-toggle .tooltip-wrap { flex: 1 1 0; min-width: 0; }
  .mode-toggle .tooltip-wrap .toggle-btn { width: 100%; height: 100%; }

  .privacy-tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%) translateY(6px);
    background: var(--tooltip-bg, #222);
    color: var(--tooltip-fg, #fff);
    font-size: 0.75rem;
    line-height: 1;
    padding: 0.35rem 0.5rem;
    border-radius: 4px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease, transform 120ms ease;
    z-index: 9999;
  }
  .privacy-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--tooltip-bg, #222);
  }
  .tooltip-wrap:hover .privacy-tooltip,
  .tooltip-wrap:focus-within .privacy-tooltip {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    pointer-events: auto;
  }

  .geoloc-badge {
    display: inline-block;
    background: var(--success-color, #28a745);
    color: white;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    position: absolute;
    top: 50%;
    right: -8px;
    transform: translateY(-50%);
  }

  .geo-controls .geo-stack { display:flex; flex-direction:column; gap:0.5rem; }
  .geo-controls .map-inline-btn { min-width: 120px; }

  .toggle-btn .icon {
    display:inline-block; vertical-align:middle; margin-right:0.25rem;
    color: var(--primary-color, #007bff);
  }
  .toggle-btn .icon--success { color: var(--success-color, #28a745); }
  .toggle-btn .spinner {
    display:inline-block; width:14px; height:14px; border-radius:50%; border:2px solid currentColor; border-right-color:transparent; box-sizing:border-box; vertical-align:middle;
    animation: _pdt_spin 0.75s linear infinite;
  }
  @keyframes _pdt_spin { to { transform: rotate(360deg); } }
  /* Button focus visible for keyboard users */
  .map-inline-btn:focus-visible {
    outline: 3px solid rgba(0,123,255,0.25);
    outline-offset: 2px;
  }

  /* Responsive: hide text on smaller screens to conserve space */

  /* Input flash animation */
  .flash {
    animation: _pdt_flash 0.65s ease-in-out;
  }
  @keyframes _pdt_flash {
    0% { box-shadow: 0 0 0 0 rgba(0,123,255,0.25); }
    50% { box-shadow: 0 0 0 6px rgba(0,123,255,0.06); }
    100% { box-shadow: 0 0 0 0 rgba(0,123,255,0); }
  }

  /* Visually-hidden helper for screen readers */
  /* `sr-only` utility is provided at a global level in styles/utilities/visibility.css; use that instead */
  
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