<script lang="ts">
  import type { Component } from 'svelte';
  import type { RoundContext, RoundEditorProps } from '../types';

  const {
    Editor,
    ctx,
    initial,
  }: {
    Editor: Component<RoundEditorProps>;
    ctx: RoundContext;
    initial: RoundEditorProps['input'];
  } = $props();

  // svelte-ignore state_referenced_locally
  let input = $state(initial);
</script>

<Editor bind:input {ctx} />
<output data-draft>{JSON.stringify(input)}</output>
