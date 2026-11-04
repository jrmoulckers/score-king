<script lang="ts">
  import type { RoundContext } from '../../types';
  import type { SKInput } from './logic';
  import SkullKingEditor from './SkullKingEditor.svelte';

  const { ctx, initial }: { ctx: RoundContext; initial: SKInput } = $props();
  // svelte-ignore state_referenced_locally
  let input = $state(initial);
</script>

<SkullKingEditor bind:input {ctx} />
<output data-draft>{JSON.stringify(input)}</output>
