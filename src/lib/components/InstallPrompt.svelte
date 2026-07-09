<script lang="ts">
  import { installAvailable, promptInstall, isIOS, isStandalone } from '../stores/install';

  // Decide the affordance once: a real install button where the browser supports it, a manual
  // "Add to Home Screen" hint on iOS, and nothing at all when already installed.
  const standalone = isStandalone();
  const ios = isIOS();

  let busy = $state(false);
  async function install() {
    busy = true;
    try {
      await promptInstall();
    } finally {
      busy = false;
    }
  }
</script>

{#if !standalone}
  {#if $installAvailable}
    <button class="btn primary block" onclick={install} disabled={busy}>
      <span aria-hidden="true">⬇️</span> Install Score King
    </button>
  {:else if ios}
    <p class="ioshint muted sm">
      <span aria-hidden="true">📲</span>
      Install it: tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.
    </p>
  {/if}
{/if}

<style>
  .ioshint {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
    margin: 0;
    text-align: center;
  }
  .sm {
    font-size: 0.85rem;
  }
</style>
