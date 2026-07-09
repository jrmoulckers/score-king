<script lang="ts">
  import { settings } from '../lib/stores/settings';
  import { isWakeLockSupported } from '../lib/wakelock';
  import BackLink from '../lib/components/BackLink.svelte';
  import Switch from '../lib/components/Switch.svelte';

  const wakeSupported = isWakeLockSupported();

  function setBool(key: 'keepAwake' | 'privacyGuard', v: boolean) {
    settings.update((s) => ({ ...s, [key]: v }));
  }
</script>

<BackLink href="/settings" label="Settings" />

<h1>Gameplay</h1>
<p class="lede muted">Tune how Score King behaves while a game is in play. Changes apply instantly and stick on this device.</p>

<div class="section-title">While playing</div>

<label class="card sw-row row spread">
  <span class="meta">
    <span class="name">Keep screen awake</span>
    <span class="muted sm">
      {wakeSupported
        ? 'Stops the screen dimming while a game is in progress.'
        : 'Your browser doesn’t support screen wake lock.'}
    </span>
  </span>
  <Switch
    checked={$settings.keepAwake}
    disabled={!wakeSupported}
    onchange={(v) => setBool('keepAwake', v)}
  />
</label>

<label class="card sw-row row spread">
  <span class="meta">
    <span class="name">Privacy peek-guard</span>
    <span class="muted sm">Blurs the board when you set the phone down, so a passer-by can’t read the scores. Tap to reveal.</span>
  </span>
  <Switch checked={$settings.privacyGuard} onchange={(v) => setBool('privacyGuard', v)} />
</label>

<style>
  .lede {
    margin: -2px 4px 18px;
    max-width: 60ch;
  }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .name {
    font-weight: 700;
  }
  .sw-row {
    cursor: pointer;
    gap: 14px;
  }
</style>
