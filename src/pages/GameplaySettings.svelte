<script lang="ts">
  import { settings } from '../lib/stores/settings';
  import { isWakeLockSupported } from '../lib/wakelock';

  const wakeSupported = isWakeLockSupported();

  function setBool(key: 'keepAwake' | 'privacyGuard', v: boolean) {
    settings.update((s) => ({ ...s, [key]: v }));
  }
</script>

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
  <span class="switch">
    <input
      type="checkbox"
      checked={$settings.keepAwake}
      disabled={!wakeSupported}
      onchange={(e) => setBool('keepAwake', e.currentTarget.checked)}
    />
    <span class="track"><span class="thumb"></span></span>
  </span>
</label>

<label class="card sw-row row spread">
  <span class="meta">
    <span class="name">Privacy peek-guard</span>
    <span class="muted sm">Blurs the board when you set the phone down, so a passer-by can’t read the scores. Tap to reveal.</span>
  </span>
  <span class="switch">
    <input
      type="checkbox"
      checked={$settings.privacyGuard}
      onchange={(e) => setBool('privacyGuard', e.currentTarget.checked)}
    />
    <span class="track"><span class="thumb"></span></span>
  </span>
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

  .switch {
    position: relative;
    display: inline-flex;
    flex: none;
  }
  .switch input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .switch input:disabled {
    cursor: not-allowed;
  }
  .track {
    width: 46px;
    height: 26px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    display: inline-flex;
    align-items: center;
    padding: 2px;
    transition: background 0.15s ease;
  }
  .thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s ease;
  }
  .switch input:checked + .track {
    background: var(--primary);
    border-color: var(--primary);
  }
  .switch input:checked + .track .thumb {
    transform: translateX(20px);
  }
  .switch input:focus-visible + .track {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
</style>
