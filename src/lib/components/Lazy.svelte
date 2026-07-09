<script lang="ts">
  import type { Component } from 'svelte';
  import { onMount } from 'svelte';

  /**
   * Loads a route page on demand.
   *
   * `App.svelte` renders one `<Lazy>` per non-critical route with a `loader` that dynamically
   * imports the page, so Vite emits each page (and its page-only dependencies — charts, the QR
   * scanner, the custom-game builder) as a separate chunk instead of bloating the initial load.
   * The loader is captured once on mount; `props` stay reactive and flow straight through to the
   * page. Keyed routes (`{#key ...}`) remount this wrapper, which reloads the already-cached
   * chunk near-instantly.
   */
  let { loader, props = {} }: { loader: () => Promise<{ default: Component<any> }>; props?: Record<string, unknown> } =
    $props();

  let Page = $state<Component<any> | null>(null);

  onMount(() => {
    let alive = true;
    loader().then((m) => {
      if (alive) Page = m.default;
    });
    return () => {
      alive = false;
    };
  });
</script>

{#if Page}
  {@const P = Page}
  <P {...props} />
{/if}
