<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  let { lat = 0, lon = 0, zoom = 5, mapClass = 'leaflet-map' } = $props();

  const dispatch = createEventDispatcher();
  let containerEl;
  let map = null;
  let marker = null;
  let L = null;
  let cssLoaded = false;

  // Load leaflet dynamically
  async function loadLeaflet() {
    const mod = await import('leaflet');
    L = mod && (mod.default || mod);

    try {
      // If using a bundler that supports CSS import, we can import CSS dynamically
      await import('leaflet/dist/leaflet.css');
      cssLoaded = true;
    } catch (e) {
      // Ignore CSS import issues — in that case, users should include CSS globally
      // Optionally, we could insert a link element to the leaflet CSS CDN
    }
  }

  function createMarkerIfNotExist() {
    if (!marker && L && map) {
      marker = L.marker([lat, lon], { draggable: false }).addTo(map);
    }
  }

  function updateMarker() {
    if (!map || !L) return;
    if (!marker) createMarkerIfNotExist();
    if (marker) marker.setLatLng([lat, lon]);
    map.setView([lat, lon], zoom);
  }

  onMount(async () => {
    await loadLeaflet();
    if (!L) return;

    // Create map
    map = L.map(containerEl).setView([lat, lon], zoom);

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    createMarkerIfNotExist();

    // Click handler
    map.on('click', (e) => {
      const latlng = e.latlng;
      // Update marker and center
      if (marker) marker.setLatLng(latlng);
      map.setView(latlng, map.getZoom());
      dispatch('select', { lat: latlng.lat, lon: latlng.lng });
    });

    // When passed-in props change, update marker
    updateMarker();
  });

  onDestroy(() => {
    if (map) {
      map.off();
      map.remove();
      map = null;
    }
  });

  // Watch for prop changes from parent (use $effect for runes mode compatibility)
  $effect(() => {
    // Read lat and lon inside the effect body so changes cause runs
    const _latDep = lat;
    const _lonDep = lon;
    if (map && L) {
      updateMarker();
    }
  });
</script>

<div bind:this={containerEl} class={mapClass} style="width:100%; height:350px;"></div>

<style>
  /* Fallback/basic style if leaflet CSS wasn't loaded via import */
  .leaflet-map { min-height: 220px; border: 1px solid var(--border-color, #dee2e6); border-radius: 4px; }
</style>
