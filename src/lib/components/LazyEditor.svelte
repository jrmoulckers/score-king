<script lang="ts">
  import type { Component } from 'svelte';
  import { onMount } from 'svelte';
  import type { RoundContext } from '../types';
  import type { EditorLoader } from '../games/editor';

  /**
   * Renders a game's round editor, loaded on demand.
   *
   * The editor's Svelte component lives behind `loader` (a dynamic `import()`), so it is fetched
   * only when a round is actually being entered — keeping every editor out of the initial bundle.
   * `input` stays two-way (`bind:input`) so the real editor's mutations propagate to the play
   * screen exactly as a direct child would. A subtle, reduced-motion-safe placeholder holds the
   * space while the (tiny, usually precached) chunk loads.
   */
  let {
    loader,
    input = $bindable(),
    ctx,
  }: { loader: EditorLoader; input: any; ctx: RoundContext } = $props();

  let Editor = $state<Component<any> | null>(null);
  let failed = $state(false);

  function load() {
    failed = false;
    Editor = null;
    loader().then(
      (m) => (Editor = m.default),
      () => (failed = true),
    );
  }

  onMount(load);
</script>

{#if Editor}
  {@const E = Editor}
  <E bind:input {ctx} />
{:else if failed}
  <p class="entry-error" role="alert">
    ⚠️ Couldn’t load this game’s controls.
    <button type="button" class="retry" onclick={load}>Try again</button>
  </p>
{:else}
  <div class="editor-loading" role="status" aria-live="polite">
    <span class="sr-only">Loading the round editor…</span>
    <span class="ph ph-line" aria-hidden="true"></span>
    <span class="ph ph-line short" aria-hidden="true"></span>
  </div>
{/if}

<style>
  /* Placeholder while an editor chunk loads: surface-2 skeleton lines on the surface ramp,
     no extra shadow. The shimmer is motion and is disabled under prefers-reduced-motion. */
  .editor-loading {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 6px 0;
  }
  .ph {
    height: 46px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .ph-line.short {
    width: 60%;
  }
  @media (prefers-reduced-motion: no-preference) {
    .ph {
      background: linear-gradient(
        90deg,
        var(--surface-2) 25%,
        var(--surface-3) 37%,
        var(--surface-2) 63%
      );
      background-size: 400% 100%;
      animation: editor-shimmer 1.4s ease-in-out infinite;
    }
  }
  @keyframes editor-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  .retry {
    min-height: 40px;
    margin-left: 6px;
    padding: 0 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-3);
    color: var(--text);
    font-weight: 700;
    cursor: pointer;
  }
  .retry:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
