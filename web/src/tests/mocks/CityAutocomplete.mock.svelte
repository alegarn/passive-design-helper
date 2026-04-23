<script>
  let { value = $bindable(''), inputId = '', placeholder = 'Search city...' } = $props();
</script>

<input id={inputId} type="text" placeholder={placeholder} bind:value={value} />