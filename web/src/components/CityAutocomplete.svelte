<script>
  import { onMount, onDestroy } from 'svelte';

  // runes props
  let { 
    value = '' , 
    cities = [], 
    placeholder = 'Search city...', 
    select = () => {},
    inputId = undefined
  } = $props();

  let isOpen = $state(false);
  let inputEl = $state(null);
  let activeIndex = $state(-1);
  const listId = `city-list-${Math.random().toString(36).slice(2,9)}`;

  const filtered = $derived.by(() => {
    const q = String(value || '').trim().toLowerCase();
    if (!q) return cities.slice(0, 30);
    return cities.filter(c => c.name.toLowerCase().includes(q)).slice(0, 30);
  });

  function open() {
    isOpen = true;
  }
  function close() {
    isOpen = false;
    activeIndex = -1;
  }

  function chooseCity(city) {
    // Set the bound `value` - runs in parent via binding
    value = city.name;
    // call the passed-in callback prop
    try { select(city); } catch (e) { /* ignore */ }
    close();
  }

  function onInput(e) {
    value = e.target.value;
    isOpen = true;
  }

  function onKeydown(e) {
    const list = filtered;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(list.length - 1, activeIndex + 1);
      isOpen = true;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(-1, activeIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && activeIndex >= 0 && activeIndex < list.length) {
        chooseCity(list[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      close();
    }
  }

  function onBlur(e) {
    // Delay closing to let click handlers run
    setTimeout(() => close(), 120);
  }

  onMount(() => {
    // nothing for now
  });

  onDestroy(() => {
  });
</script>

<div class="city-autocomplete">
  <input
    bind:this={inputEl}
    id={inputId}
    type="text"
    class="city-input"
    placeholder={placeholder}
    bind:value={value}
    oninput={onInput}
    onkeydown={onKeydown}
    onfocus={() => (isOpen = true)}
    onblur={onBlur}
    aria-autocomplete="list"
    aria-expanded={isOpen}
    aria-haspopup="listbox"
    aria-controls={listId}
    role="combobox"
    />

  {#if isOpen}
    <ul id={listId} class="city-list" role="listbox" aria-label="Cities">
      {#if (filtered.length === 0)}
        <li class="city-list-item empty">No results</li>
      {/if}
      {#each filtered as city, idx}
        <li
          role="option"
          class="city-list-item {idx === activeIndex ? 'active' : ''}"
          aria-selected={idx === activeIndex}
          id={`city-item-${idx}`}
          tabindex="-1"
          onmousedown={() => chooseCity(city)}
        >
          {city.name}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .city-autocomplete { position: relative; }
  .city-input { width: 100%; padding: 0.5rem; }
  .city-list {
    position: absolute; z-index: 20; left: 0; right: 0; background: var(--card-bg, white);
    border: 1px solid var(--border-color, #ddd); max-height: 240px; overflow: auto; margin-top: 4px; padding: 0;
    list-style: none; border-radius: 6px;
  }
  .city-list-item { padding: 0.6rem; cursor: pointer; }
  .city-list-item.active { background: var(--primary-color, #007bff); color: white; }
  .city-list-item.empty { opacity: 0.6; }
</style>
