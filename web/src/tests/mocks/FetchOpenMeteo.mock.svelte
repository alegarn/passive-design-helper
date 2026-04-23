<script>
  let { onAnalyze = null } = $props();
</script>

<button type="button" onclick={() => onAnalyze?.()}>
  Trigger Analyze
</button>