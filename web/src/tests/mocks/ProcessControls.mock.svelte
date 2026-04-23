<script>
  import { createEventDispatcher } from 'svelte';

  let { analyzeRequestId = 0 } = $props();
  const dispatch = createEventDispatcher();
</script>

<div data-testid="analyze-request-id">{analyzeRequestId}</div>
<button type="button" onclick={() => dispatch('dataprocessed', { result: { rowsCount: 1 } })}>
  Emit Processed
</button>