<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import type { TallyInput } from './index';

  let { input = $bindable(), ctx }: { input: TallyInput; ctx: RoundContext } = $props();
</script>

<div class="stack">
  {#each ctx.players as p (p.id)}
    <div class="row spread">
      <span class="row" style="gap: 8px">
        <Avatar name={p.name} color={p.color} />
        <strong>{p.name}</strong>
      </span>
      <Stepper bind:value={input.deltas[p.id]} step={1} />
    </div>
  {/each}
</div>
