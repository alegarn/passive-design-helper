<script>
  // Component props
  let { 
    label,           // String: The label for the stat
    value,           // Number|null: The value to display
    color,           // Optional string: Color for the accent bar
    decimals = 1     // Optional number: Decimal places for formatting
  } = $props();
  
  // Format the value for display
  function formatValue(val, dec) {
    if (val === null || val === undefined || !Number.isFinite(val)) {
      return '-';
    }
    
    // Round to specified decimal places
    const multiplier = Math.pow(10, dec);
    const rounded = Math.round(val * multiplier) / multiplier;
    return rounded.toFixed(dec);
  }
</script>

<div class="stat-card" role="listitem" aria-label="{label}: {formatValue(value, decimals)}">
  {#if color}
    <div class="stat-card__color" style="background-color: {color};"></div>
  {/if}
  <div class="stat-card__label">{label}</div>
  <div class="stat-card__value">{formatValue(value, decimals)}</div>
</div>

<style>
  .stat-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background-color: #fff;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
  }

  .stat-card:hover {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  .stat-card__color {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    border-radius: 8px 8px 0 0;
  }

  .stat-card__label {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: #495057;
    padding-top: 0.25rem;
  }

  .stat-card__value {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: #007bff;
  }

  @media (max-width: 640px) {
    .stat-card {
      padding: 0.75rem;
    }
  }
</style>