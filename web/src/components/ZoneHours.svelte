<script>
  let { zone } = $props();
</script>

<div class="stat-card" role="listitem">
  <div class="stat-card__zone">{zone.zone}</div>
  <div class="stat-card__hours">{zone.hours.toFixed(2)} hours</div>
  <div class="stat-card__percent">{zone.percent.toFixed(2)}%</div>
</div>

<style>
  .stat-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 0.5rem);
    padding: var(--space-lg, 1.5rem);
    background-color: var(--color-bg-elevated, #ffffff);
    border: 1px solid var(--color-border, #d8dee9);
    border-radius: 8px;
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05));
    transition: all var(--transition-base, 250ms ease);
    position: relative;
    overflow: hidden;
    min-width: 180px;
  }

  .stat-card:hover {
    box-shadow: var(--shadow-md, 0 4px 6px rgba(0,0,0,0.1));
    transform: translateY(-2px);
  }

  .stat-card__zone {
    margin: 0;
    font-size: var(--font-size-base, 1rem);
    font-weight: 600;
    color: var(--color-text, #2e3440);
    padding-top: var(--space-xs, 0.25rem);
  }

  .stat-card__hours {
    margin: 0;
    font-size: var(--font-size-xl, 1.5rem);
    font-weight: 700;
    color: var(--color-primary, #5e81ac);
  }

  .stat-card__percent {
    margin: 0;
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--color-text-muted, #4c566a);
  }

  @media (max-width: 640px) {
    .stat-card {
      padding: var(--space-md, 1rem);
      min-width: auto;
    }
  }
</style>