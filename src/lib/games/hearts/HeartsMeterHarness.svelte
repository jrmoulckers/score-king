<script lang="ts">
  import { untrack } from 'svelte';
  import type { RoundContext } from '../../types';
  import type { HeartsInput } from './logic';
  import HeartsEditor from './HeartsEditor.svelte';

  const { initialInput, ctx }: { initialInput: HeartsInput; ctx: RoundContext } = $props();
  let input = $state(untrack(() => initialInput));
</script>

<HeartsEditor bind:input {ctx} />
