<script lang="ts">
  import type { RoundContext } from '../../types';
  import StardewEditor from './StardewEditor.svelte';
  import type { StardewSeasonInput } from './logic';

  const { ctx, initial }: { ctx: RoundContext; initial: StardewSeasonInput } = $props();
  // svelte-ignore state_referenced_locally
  let input = $state(structuredClone(initial));
</script>

<StardewEditor bind:input {ctx} />
<output data-draft>{JSON.stringify(input)}</output>
