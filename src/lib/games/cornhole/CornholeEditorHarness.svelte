<script lang="ts">
  import type { RoundContext } from '../../types';
  import CornholeEditor from './CornholeEditor.svelte';
  import type { CornholeInput } from './logic';

  const { ctx, initial }: { ctx: RoundContext; initial: CornholeInput } = $props();
  // svelte-ignore state_referenced_locally
  let input = $state(initial);
</script>

<CornholeEditor bind:input {ctx} />
<output data-draft>{JSON.stringify(input)}</output>
