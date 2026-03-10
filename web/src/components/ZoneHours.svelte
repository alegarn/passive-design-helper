<script>
  import { createZonesForMedianTemp } from '../scripts/zones.js';
  import { medianTemp } from '../stores/fileStore.js';
  let { zoneData } = $props();
  const dynamicZones = $derived(createZonesForMedianTemp($medianTemp ?? 28));
  const zoneInfo = $derived(dynamicZones.find(z => z.id === zoneData.zone) || {});
</script>

<article class="stat-card" role="listitem">
  <div class="stat-card__color" style="background-color: {zoneData.color ? zoneData.color : '#999'}"></div>
  <h3 class="stat-card__zone">{zoneInfo.icon ?? '🟦'} {zoneData.zone}</h3>
  <p class="stat-card__hours">{zoneData.hours.toFixed(1)} hours</p>
  <p class="stat-card__percent">{zoneData.percent.toFixed(1)}%</p>
</article>