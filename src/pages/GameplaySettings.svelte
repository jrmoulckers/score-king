<script lang="ts">
  import {
    settings,
    resetPreferences,
    differsFromDefaults,
    GAMEPLAY_SETTING_KEYS,
  } from '../lib/stores/settings';
  import { isWakeLockSupported } from '../lib/wakelock';
  import { hapticsSupported } from '../lib/haptics';
  import { isAppBadgeSupported } from '../lib/badge';
  import BackLink from '../lib/components/BackLink.svelte';
  import Switch from '../lib/components/Switch.svelte';

  const wakeSupported = isWakeLockSupported();
  const canHaptics = hapticsSupported();
  const canBadge = isAppBadgeSupported();

  const canReset = $derived(differsFromDefaults($settings, GAMEPLAY_SETTING_KEYS));

  function setBool(
    key: 'keepAwake' | 'privacyGuard' | 'roastMode' | 'haptics' | 'appBadge',
    v: boolean,
  ) {
    settings.update((s) => ({ ...s, [key]: v }));
  }
</script>

<BackLink href="/settings" label="Settings" />

<h1>Gameplay</h1>
<p class="lede muted">
  Tune how Score King behaves during and after a game. Changes apply instantly.
</p>

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

<label class="card sw-row row spread">
  <span class="meta">
    <span class="name">Haptic feedback</span>
    <span class="muted sm">
      {canHaptics
        ? 'A gentle buzz when a round saves, an undo fires, or someone wins. Follows your Reduced-motion setting.'
        : 'This device doesn’t support vibration.'}
    </span>
  </span>
  <Switch
    checked={$settings.haptics}
    disabled={!canHaptics}
    onchange={(v) => setBool('haptics', v)}
  />
</label>

<label class="card sw-row row spread">
  <span class="meta">
    <span class="name">App icon badge</span>
    <span class="muted sm">
      {canBadge
        ? 'Shows how many games are still in progress on the installed app’s home-screen icon.'
        : 'Add Score King to your home screen to badge its icon with unfinished games.'}
    </span>
  </span>
  <Switch
    checked={$settings.appBadge}
    disabled={!canBadge}
    onchange={(v) => setBool('appBadge', v)}
  />
</label>

<div class="section-title">Personality</div>

<label class="card sw-row row spread">
  <span class="meta">
    <span class="name">Playful roasts</span>
    <span class="muted sm">
      Lets the Daily Crown &amp; Court dish out lighthearted rivalries and a “Wall of shame,” not
      just flexes. Turn off to keep the recaps purely celebratory.
    </span>
  </span>
  <Switch checked={$settings.roastMode} onchange={(v) => setBool('roastMode', v)} />
</label>

<div class="card reset row spread">
  <span class="meta">
    <span class="name">Reset gameplay</span>
    <span class="muted sm">Put these behaviours back to Score King’s defaults. Nothing else changes.</span>
  </span>
  <button class="btn ghost danger" onclick={() => resetPreferences(GAMEPLAY_SETTING_KEYS)} disabled={!canReset}>
    {canReset ? 'Reset to defaults' : 'All default'}
  </button>
</div>

<p class="portable muted sm">
  <span aria-hidden="true">☁️</span>
  These preferences are saved in your backup, so a restore carries them to your other devices.
</p>

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
  .reset {
    gap: 14px;
    margin-top: 4px;
  }
  .reset .btn {
    flex: none;
  }
  .portable {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 12px 4px 4px;
    max-width: 60ch;
  }
</style>
