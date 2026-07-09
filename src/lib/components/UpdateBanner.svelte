<script lang="ts">
  import { needRefresh, applyUpdate, dismissUpdate } from '../stores/pwa';
</script>

{#if $needRefresh}
  <div class="update-banner" role="dialog" aria-labelledby="update-title" aria-modal="false">
    <div class="update-card">
      <span class="update-emoji" aria-hidden="true">👑</span>
      <div class="update-copy">
        <strong id="update-title">A new version is ready</strong>
        <span class="update-sub">Refresh to get the latest Score King.</span>
      </div>
      <div class="update-actions">
        <button class="btn" type="button" onclick={dismissUpdate}>Later</button>
        <button class="btn primary" type="button" onclick={applyUpdate}>Refresh</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* "New version ready" prompt. Persistent (never auto-dismisses mid-game), sits above the
     bottom tab bar in the thumb zone, and rides the surface ramp (surface-3 card, one Soft Lift
     shadow — no glass, glass is chrome only). State is co-signalled by the crown emoji + copy,
     never colour alone, and "Refresh" is the single Royal Violet primary action. */
  .update-banner {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(86px + env(safe-area-inset-bottom));
    z-index: 70;
    width: min(560px, calc(100% - 24px));
  }
  @media (min-width: 900px) {
    /* Desktop has no bottom tab bar; tuck it into the corner. */
    .update-banner {
      left: auto;
      right: 20px;
      transform: none;
      bottom: calc(20px + env(safe-area-inset-bottom));
    }
  }
  .update-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: var(--radius);
    background: var(--surface-3);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
  }
  .update-emoji {
    font-size: 1.6rem;
    line-height: 1;
    flex: none;
  }
  .update-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .update-sub {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .update-actions {
    display: flex;
    gap: 8px;
    flex: none;
  }
  .update-actions .btn {
    padding: 0 14px;
  }
  @media (max-width: 420px) {
    .update-card {
      flex-wrap: wrap;
    }
    .update-actions {
      width: 100%;
    }
    .update-actions .btn {
      flex: 1;
    }
  }
</style>
