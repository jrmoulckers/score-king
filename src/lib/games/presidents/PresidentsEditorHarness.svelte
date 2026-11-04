<script lang="ts">
  import type { RoundContext } from '../../types';
  import PresidentsEditor from './PresidentsEditor.svelte';
  import type { PresidentsInput } from './logic';

  const { ctx, initial }: { ctx: RoundContext; initial: PresidentsInput } = $props();
  // svelte-ignore state_referenced_locally
  let input = $state(structuredClone(initial));
</script>

<PresidentsEditor bind:input {ctx} />
<output data-draft>{JSON.stringify(input)}</output>
