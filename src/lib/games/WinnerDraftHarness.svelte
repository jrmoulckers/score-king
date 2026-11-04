<script lang="ts">
  import type { Component } from 'svelte';
  import type { RoundContext, RoundEditorProps } from '../types';

  const {
    Editor,
    ctx,
    initial,
    fresh,
  }: {
    Editor: Component<RoundEditorProps>;
    ctx: RoundContext;
    initial: RoundEditorProps['input'];
    fresh: RoundEditorProps['input'];
  } = $props();

  // svelte-ignore state_referenced_locally
  let input = $state(structuredClone(initial));
</script>

<Editor bind:input {ctx} />
<button type="button" data-reset onclick={() => (input = structuredClone(fresh))}>
  Reset draft
</button>
<button
  type="button"
  data-clear-hand
  onclick={() => (input.hands.a = structuredClone(fresh.hands.a))}
>
  Clear hand
</button>
<output data-draft>{JSON.stringify(input)}</output>
