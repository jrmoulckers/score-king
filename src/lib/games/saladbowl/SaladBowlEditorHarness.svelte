<script lang="ts">
  import type { RoundContext } from '../../types';
  import SaladBowlEditor from './SaladBowlEditor.svelte';
  import type { SaladBowlInput } from './logic';

  const { ctx, initial }: { ctx: RoundContext; initial: SaladBowlInput } = $props();
  // svelte-ignore state_referenced_locally
  let input = $state(initial);
  // svelte-ignore state_referenced_locally
  let context = $state(ctx);

  export function setRound(roundIndex: number) {
    context = { ...context, roundIndex };
  }

  export function setTurn(turnSeconds: number) {
    context = { ...context, config: { ...context.config, turnSeconds } };
  }
</script>

<SaladBowlEditor bind:input ctx={context} />
<output data-draft>{JSON.stringify(input)}</output>
