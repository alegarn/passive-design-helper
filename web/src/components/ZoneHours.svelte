<script>
  let { zoneData: zone } = $props();
</script>

<article class="stat-card" role="listitem">
  <div class="stat-card__color" style="background-color: {zone.color ? zone.color : '#999'}"></div>
  <h3 class="stat-card__zone">{zone.zone}</h3>
  <p class="stat-card__hours">{zone.hours.toFixed(1)} hours</p>
  <p class="stat-card__percent">{zone.percent.toFixed(1)}%</p>
</article>