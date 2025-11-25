<script>
  import { onMount, onDestroy } from 'svelte';
  let { tactic, onClose } = $props();
  let container = $state(null);

  function close() {
    onClose?.();
  }

  function handleKey(e) {
    if (e.key === 'Escape') close();
  }

  function onBackdropClick(e) {
    if (e.target === e.currentTarget) close();
  }

  const prev = { el: null };
  onMount(() => {
    // trap focus and prevent background scroll
    prev.el = document.activeElement;
    document.body.style.overflow = 'hidden';
    container?.focus?.();
    window.addEventListener('keydown', handleKey);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKey);
    document.body.style.overflow = '';
    prev.el?.focus?.();
  });
</script>

{#if tactic}
  <div class="backdrop" role="button" tabindex="0" onclick={onBackdropClick} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onBackdropClick(e); }}>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="tactic-title" bind:this={container} tabindex="0">
      <button class="close" onclick={close} aria-label="Close details">✕</button>
      <header>
        <div class="icon big">{tactic.icon ?? '🟦'}</div>
        <div>
          <h2 id="tactic-title">{tactic.id}</h2>
          <div class="tags">
            <span class="pill">{tactic.type}</span>
            <span class="pill complexity">{tactic.complexity}</span>
          </div>
        </div>
      </header>

      <section class="meaning">
        <h3>What it means</h3>
        <p>{tactic.description}</p>
      </section>

      <section class="how">
        <h3>How to apply</h3>
        {#if tactic.howToApply}
          {#if tactic.howToApply.beginner && tactic.howToApply.beginner.length}
            <h4>Beginner</h4>
            <ol>
              {#each tactic.howToApply.beginner as step}
                <li>{step}</li>
              {/each}
            </ol>
          {/if}

          {#if tactic.howToApply.advanced && tactic.howToApply.advanced.length}
            <h4>Advanced</h4>
            <ol>
              {#each tactic.howToApply.advanced as step}
                <li>{step}</li>
              {/each}
            </ol>
          {/if}
        {:else}
          <ol>
            {#each tactic.examples ?? [] as ex}
              <li>{ex}</li>
            {/each}
          </ol>
        {/if}
      </section>

      <section class="details">
        <ul class="proscons">
          {#if tactic.pros}
            <li><strong>Pros</strong><ul>{#each tactic.pros as p}<li>{p}</li>{/each}</ul></li>
          {/if}
          {#if tactic.cons}
            <li><strong>Cons</strong><ul>{#each tactic.cons as c}<li>{c}</li>{/each}</ul></li>
          {/if}
        </ul>

        <div class="meta-grid">
          <div>Complexity: <strong>{tactic.complexity}</strong></div>
        </div>
      </section>

      {#if tactic.examples?.length}
        <section class="examples">
          <h4>Examples</h4>
          <ul>
            {#each tactic.examples as ex}
              <li>{ex}</li>
            {/each}
          </ul>
        </section>
      {/if}

      <footer class="actions">
        {#if tactic.resources?.[0]?.url}
          <a href={tactic.resources[0].url} target="_blank" rel="noopener">Read more</a>
        {/if}
      </footer>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; padding:1rem; z-index: 999; }
  .modal { max-width: 760px; width: 100%; background: white; border-radius: 12px; padding: 1.25rem; box-shadow: 0 10px 30px rgba(0,0,0,0.25); max-height: 90vh; overflow:auto; outline: none; position: relative; }
  .close { position:absolute; right:12px; top:12px; background:transparent; border:none; font-size:1.2rem; cursor:pointer; }
  header { display:flex; gap: 0.75rem; align-items:center; }
  .icon.big { font-size:2rem; }
  .pill { background:#eee; padding:.25rem .5rem; border-radius:999px; font-size:.8rem; }
  .how ol { padding-left: 1.1rem; }
  .how { margin-bottom: 1.25rem; }
  .meta-grid { display:flex; gap: 1rem; flex-wrap:wrap; margin-top:0.5rem; color:#333; }
  .actions { display:flex; gap:0.5rem; justify-content:flex-end; margin-top:1rem; }
  .examples { margin-bottom: 1.25rem; }
  .how h4, .examples h4 { margin-bottom: 0.4rem; margin-top: 0.6rem; }
</style>