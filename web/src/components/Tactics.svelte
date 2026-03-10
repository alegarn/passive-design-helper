<script>
  import { onMount } from 'svelte';
  import TacticCard from './TacticCard.svelte';
  // Load TacticModal dynamically only when needed
  let TacticModalComponent = $state(null);
  async function loadTacticModal() {
    if (!TacticModalComponent) {
      const mod = await import('./TacticModal.svelte');
      TacticModalComponent = mod.default;
    }
  }
  import { createZonesForMedianTemp } from '../scripts/zones.js';
  import { medianTemp } from '../stores/fileStore.js';

  // Svelte 5 rune state
  let query = $state('');
  let filterCategory = $state('All');
  let selectedId = $state(null);
  // no compare/favorites for simplified modal interaction

  // no persisting favorites

  let filtered = $derived.by(() => {
    const q = String(query).trim().toLowerCase();
    const dynZones = createZonesForMedianTemp($medianTemp || 28);
    return dynZones.filter(z => {
      if (filterCategory !== 'All' && z.type !== filterCategory.toLowerCase()) return false;
      if (!q) return true;
      const hay = `${z.id} ${z.description ?? ''} ${z.examples?.join(' ') ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  });

  function openTactic(t) { selectedId = t.id; }
  function closeTactic() { selectedId = null; }
  // compare/favorite functionality removed; modal-driven details are used
  
  $effect(() => {
    if (selectedId) loadTacticModal();
  });
</script>

<section aria-labelledby="tactics-heading">
  <h2 id="tactics-heading">Passive & Active Tactics</h2>

  <div class="controls">
    <input placeholder="Search tactics by name or tag..." bind:value={query} aria-label="Search tactics" />
    <select bind:value={filterCategory} aria-label="Category filter">
      <option>All</option>
      <option>Passive</option>
      <option>Active</option>
      <option>Hybrid</option>
      <option>Mechanical</option>
    </select>
    <button class="clear" onclick={() => { query = ''; filterCategory = 'All'; }}>Clear</button>
  </div>

  <div class="grid">
    {#each filtered as tactic (tactic.id)}
      <TacticCard tactic={tactic} onOpen={openTactic} />
    {/each}
  </div>

  {#if false}
    <!-- Compare strip removed -->
  {/if}

  {#if selectedId}
    {#if TacticModalComponent}
      <TacticModalComponent tactic={createZonesForMedianTemp($medianTemp || 28).find(z => z.id === selectedId)} onClose={closeTactic} />
    {:else}
      <div class="modal-loading">Loading details…</div>
    {/if}
  {/if}
</section>

<style>
  .controls { display:flex; gap:.5rem; margin-bottom:.75rem; align-items:center; }
  input { flex:1; padding:.5rem; border-radius:8px; border:1px solid #ddd; }
  select { padding:.4rem; }
  .grid { display:grid; gap: .75rem; grid-template-columns: repeat(auto-fill, minmax(var(--tactic-card-min, 260px), 1fr)); }
  /* .compare-strip removed */
</style>