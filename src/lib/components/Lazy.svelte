<script lang="ts">
  import type { Component } from 'svelte';

  /**
   * Loads a route page on demand.
   *
   * `App.svelte` renders one `<Lazy>` per non-critical route with a `loader` that dynamically
   * imports the page, so Vite emits each page (and its page-only dependencies — charts, the QR
   * scanner, the custom-game builder) as a separate chunk instead of bloating the initial load.
   * A changed loader starts a new load; `props` stay reactive and flow straight through to the
   * page. Keyed routes (`{#key ...}`) remount this wrapper, which reloads the already-cached
   * chunk near-instantly. Failed imports offer an explicit page reload because browsers can
   * cache a rejected module import for the lifetime of the document.
   */
  const {
    loader,
    props = {},
  }: { loader: () => Promise<{ default: Component<any> }>; props?: Record<string, unknown> } =
    $props();

  let Page = $state<Component<any> | null>(null);
  let failed = $state(false);
  const load = $derived(loader);

  $effect(() => {
    let alive = true;
    Page = null;
    failed = false;
    Promise.resolve()
      .then(load)
      .then(
        (m) => {
          if (alive) Page = m.default;
        },
        () => {
          if (alive) failed = true;
        },
      );
    return () => {
      alive = false;
    };
  });
</script>

{#if Page}
  {@const P = Page}
  <P {...props} />
{:else if failed}
  <div class="empty" role="alert">
    <h1>Couldn't load this page</h1>
    <p class="muted">Reload to try again, or choose another page from the navigation.</p>
    <button class="btn primary" type="button" onclick={() => location.reload()}>Reload page</button>
  </div>
{:else}
  <p class="empty" role="status">Loading this page...</p>
{/if}
