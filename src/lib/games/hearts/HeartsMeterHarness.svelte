<script lang="ts">
  import type { RoundContext } from '../../types';
  import type { HeartsInput } from './logic';
  import HeartsEditor from './HeartsEditor.svelte';

  const { initialInput, ctx }: { initialInput: HeartsInput; ctx: RoundContext } = $props();
  let input = $state(initialInput);
</script>

<HeartsEditor bind:input {ctx} />
