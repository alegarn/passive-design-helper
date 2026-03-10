<script>
  import { createZonesForMedianTemp } from '../scripts/zones.js';
  import { medianTemp } from '../stores/fileStore.js';
  let { zoneData: zone } = $props();
  const dynamicZones = $derived(createZonesForMedianTemp($medianTemp ?? 28));
  const zoneInfo = $derived(dynamicZones.find(z => z.id === zone.zone) || {});
</script>

<article class="stat-card" role="listitem">
  <div class="stat-card__color" style="background-color: {zone.color ? zone.color : '#999'}"></div>
  <h3 class="stat-card__zone">{zoneInfo.icon ?? '🟦'} {zone.zone}</h3>
  <p class="stat-card__hours">{zone.hours.toFixed(1)} hours</p>
  <p class="stat-card__percent">{zone.percent.toFixed(1)}%</p>
</article>