<script>
  // Svelte 5 rune API
  let { tactic, onOpen } = $props();

  function onclickOpen() {
    onOpen?.(tactic);
  }

  // toggle not used in current UI (compare/favorite removed)

  function onKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') onclickOpen();
  }
</script>

<div
  class="card"
  role="button"
  tabindex="0"
  onclick={onclickOpen}
  onkeydown={onKeydown}
  aria-label={`View details for ${tactic.id}`}>
  <div class="left">
    <div class="icon">{tactic.icon ?? '🟦'}</div>
  </div>

  <div class="body">
    <h3 class="title">{tactic.id}</h3>
    <p class="short">{tactic.description}</p>

    <div class="meta">
      <span class="pill type">{tactic.type}</span>
      <span class="pill complexity">{tactic.complexity}</span>
      {#if tactic.examples?.length}
        <div class="example">Example: {tactic.examples[0]}</div>
      {/if}
    </div>
  </div>

    <div class="actions"></div>
</div>

<style>
  .card { display:flex; gap:0.75rem; padding: 0.8rem; border-radius: 0.6rem; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.06); cursor:pointer; transition: transform .12s ease; align-items:flex-start; }
  .card:focus, .card:hover { transform: translateY(-3px); box-shadow: 0 6px 18px rgba(0,0,0,0.08); }
  .left { display:flex; align-items:center; }
  .icon { font-size:1.6rem; }
  .body { flex: 1; }
  .title { margin:0; font-size:1rem; }
  .short { margin:.25rem 0; color:#6b7280; font-size:.9rem; }
  .pill { background:#eef2ff; padding:0.18rem 0.5rem; border-radius:999px; font-size:.75rem; margin-right:0.4rem; display:inline-block; }
  .complexity { background:#fff3cd; }
  .example { color:#6b7280; font-size:.85rem; margin-top:.35rem; }
  /* .select removed */
</style>