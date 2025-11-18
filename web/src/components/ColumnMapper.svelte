<script>
  import { rawData, mapping, setMapping } from '../stores/uiStore.js';
  
  // Define the required fields that need mapping
  const requiredFields = ['timestamp', 'temperature', 'humidity'];
  
  // Reactive variables
  $: availableColumns = $rawData.length > 0 ? Object.keys($rawData[0]) : [];
  $: currentMapping = { ...$mapping };
  
  // Log reactive values for diagnostics
  $: console.log('ColumnMapper reactive', { availableColumns, currentMapping });
  // Temporary mapping state for form inputs
  let tempMapping = {};
  
  // Initialize tempMapping only once when availableColumns first appear
  $: if (availableColumns.length > 0 && Object.keys(tempMapping).length === 0) {
    tempMapping = { ...currentMapping };
    console.log('ColumnMapper: initialized tempMapping once', tempMapping, { availableColumns });
  }
  
  // Check if all required fields are mapped
  $: isMappingComplete = requiredFields.every(field => tempMapping[field]);
  
  // Apply the mapping to the store
  function applyMapping() {
    if (isMappingComplete) {
      setMapping(tempMapping);
    }
  }
  
  // Handle field selection change
  function handleFieldChange(field, value) {
    tempMapping = {
      ...tempMapping,
      [field]: value
    };
    console.log('ColumnMapper: field change', { field, value, tempMapping });
  }
</script>

{#if $rawData.length > 0}
  <div class="column-mapper">
    <h2 class="export-controls__title">Map CSV Columns</h2>
    
    <div class="form-fields">
      {#each requiredFields as field}
        <div class="form-field">
          <label for="{field}" class="form-field__label">
            {field.charAt(0).toUpperCase() + field.slice(1)} Column
          </label>
          <select 
            id="{field}" 
            class="form-field__select"
            bind:value={tempMapping[field]}
            on:change={() => handleFieldChange(field, tempMapping[field])}
          >
            <option value="">Select a column...</option>
            {#each availableColumns as column}
              <option value={column}>{column}</option>
            {/each}
          </select>
        </div>
      {/each}
    </div>
    
    <div class="mapping-status">
      {#if isMappingComplete}
        <p class="mapping-status__complete">All required fields are mapped</p>
      {:else}
        <p class="mapping-status__incomplete">Please map all required fields</p>
      {/if}
    </div>
    
    <button 
      class="btn btn--primary" 
      on:click={applyMapping}
      disabled={!isMappingComplete}
    >
      Apply Mapping
    </button>
    
    {#if $mapping.timestamp && $mapping.temperature && $mapping.humidity}
      <div class="current-mapping">
        <h3 class="current-mapping__title">Current Mapping:</h3>
        <ul class="current-mapping__list">
          <li>Timestamp: <strong>{$mapping.timestamp}</strong></li>
          <li>Temperature: <strong>{$mapping.temperature}</strong></li>
          <li>Humidity: <strong>{$mapping.humidity}</strong></li>
        </ul>
      </div>
    {/if}
  </div>
{/if}

<style>
  .form-fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }
  
  .mapping-status {
    margin: var(--space-md) 0;
    padding: var(--space-sm);
    border-radius: 6px;
  }
  
  .mapping-status__complete {
    color: var(--color-success);
    margin: 0;
  }
  
  .mapping-status__incomplete {
    color: var(--color-warning);
    margin: 0;
  }
  
  .current-mapping {
    margin-top: var(--space-lg);
    padding: var(--space-md);
    background-color: var(--color-bg);
    border-radius: 6px;
    border: 1px solid var(--color-border);
  }
  
  .current-mapping__title {
    margin: 0 0 var(--space-sm) 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text);
  }
  
  .current-mapping__list {
    margin: 0;
    padding-left: var(--space-md);
  }
  
  .current-mapping__list li {
    margin-bottom: var(--space-xs);
    font-size: var(--font-size-sm);
  }
</style>