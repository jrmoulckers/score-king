<script lang="ts">
  import {
    settings,
    resolveTheme,
    resetPreferences,
    differsFromDefaults,
    APPEARANCE_SETTING_KEYS,
  } from '../lib/stores/settings';
  import { PALETTE } from '../lib/util';
  import Segmented from '../lib/components/Segmented.svelte';
  import Switch from '../lib/components/Switch.svelte';
  import Avatar from '../lib/components/Avatar.svelte';
  import BackLink from '../lib/components/BackLink.svelte';

  let theme = $state($settings.theme);
  let fontScale = $state($settings.fontScale);
  let motion = $state($settings.motion);

  $effect(() => {
    settings.update((s) =>
      s.theme === theme && s.fontScale === fontScale && s.motion === motion
        ? s
        : { ...s, theme, fontScale, motion },
    );
  });

  const themeOptions = [
    { value: 'system', label: '🖥️ Auto' },
    { value: 'dark', label: '🌙 Dark' },
    { value: 'light', label: '☀️ Light' },
  ];
  const sizeOptions = [
    { value: 'sm', label: 'S' },
    { value: 'md', label: 'M' },
    { value: 'lg', label: 'L' },
    { value: 'xl', label: 'XL' },
  ];
  const motionOptions = [
    { value: 'system', label: 'System' },
    { value: 'reduce', label: 'Reduced' },
    { value: 'full', label: 'Full' },
  ];

  // Gate OLED on the *resolved* theme so "Auto" that currently reads light can't go true-black.
  const oledDisabled = $derived(resolveTheme($settings.theme) !== 'dark');
  const canReset = $derived(differsFromDefaults($settings, APPEARANCE_SETTING_KEYS));

  const previewPlayers = [
    { name: 'Ada Lovelace', color: PALETTE[0], score: 42 },
    { name: 'Bo Diddley', color: PALETTE[2], score: 38 },
    { name: 'Cy Young', color: PALETTE[4], score: 31 },
  ];

  function setBool(key: 'oled' | 'highContrast' | 'colorBlind', v: boolean) {
    settings.update((s) => ({ ...s, [key]: v }));
  }

  function resetAppearance() {
    resetPreferences(APPEARANCE_SETTING_KEYS);
    // Pull the reset values back into the local segmented bindings so the controls repaint.
    theme = $settings.theme;
    fontScale = $settings.fontScale;
    motion = $settings.motion;
  }
</script>

<BackLink href="/settings" label="Settings" />

<h1>Accessibility &amp; display</h1>
<p class="lede muted">
  Tune Score King to your eyes, your hands, and your table. Changes apply instantly.
</p>

<div class="card preview">
  <div class="row spread">
    <span class="row" style="gap: 8px">
      <span class="livedot" aria-hidden="true"></span>
      <strong>Live preview</strong>
    </span>
    <span class="muted sm">Updates as you tweak</span>
  </div>
  <table class="mini">
    <tbody>
      {#each previewPlayers as p, i (p.name)}
        <tr class:winner={i === 0}>
          <td class="rk">{i + 1}</td>
          <td>
            <span class="row" style="gap: 8px">
              <Avatar name={p.name} color={p.color} size={26} />
              {p.name}
              {#if i === 0}<span title="Leader">👑</span>{/if}
            </span>
          </td>
          <td class="num" class:lead={i === 0}>{p.score}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<div class="section-title">Display</div>

<div class="card set-stack">
  <span class="meta">
    <span class="name">Theme</span>
    <span class="muted sm">Auto follows your device’s day/night. Dark keeps things calm under low light; light suits bright rooms.</span>
  </span>
  <Segmented label="Theme" options={themeOptions} bind:value={theme} />
</div>

<div class="card set-stack">
  <span class="meta">
    <span class="name">Text size</span>
    <span class="muted sm">Scales every label and score. Buttons stay just as easy to tap.</span>
  </span>
  <Segmented label="Text size" options={sizeOptions} bind:value={fontScale} />
</div>

<label class="card sw-row row spread">
  <span class="meta">
    <span class="name">High contrast</span>
    <span class="muted sm">Bolder text, stronger borders, chunkier focus rings.</span>
  </span>
  <Switch checked={$settings.highContrast} onchange={(v) => setBool('highContrast', v)} />
</label>

<label class="card sw-row row spread" class:dim={oledDisabled}>
  <span class="meta">
    <span class="name">True-black (OLED)</span>
    <span class="muted sm">
      {oledDisabled ? 'Switch to the dark theme to use true black.' : 'Pure-black surfaces save power and deepen contrast.'}
    </span>
  </span>
  <Switch checked={$settings.oled} disabled={oledDisabled} onchange={(v) => setBool('oled', v)} />
</label>

<div class="section-title">Motion &amp; colour</div>

<div class="card set-stack">
  <span class="meta">
    <span class="name">Motion</span>
    <span class="muted sm">System follows your device. Reduced removes animation; Full always plays it.</span>
  </span>
  <Segmented label="Motion" options={motionOptions} bind:value={motion} />
</div>

<label class="card sw-row row spread">
  <span class="meta">
    <span class="name">Colour-blind palette</span>
    <span class="muted sm">Swaps player colours for a set that stays distinct across colour vision types.</span>
  </span>
  <Switch checked={$settings.colorBlind} onchange={(v) => setBool('colorBlind', v)} />
</label>

<div class="card reset row spread">
  <span class="meta">
    <span class="name">Reset appearance</span>
    <span class="muted sm">
      Put theme, text size, contrast, motion, and colour back to Score King’s defaults. Only
      these display choices change — your games, players, and backup are untouched.
    </span>
  </span>
  <button class="btn ghost danger" onclick={resetAppearance} disabled={!canReset}>
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

  .preview {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .livedot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--good, #34d399);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--good, #34d399) 60%, transparent);
    animation: pulse 1.8s ease-out infinite;
  }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--good, #34d399) 55%, transparent); }
    70% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--good, #34d399) 0%, transparent); }
    100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--good, #34d399) 0%, transparent); }
  }
  .mini {
    width: 100%;
    border-collapse: collapse;
  }
  .mini td {
    padding: 7px 6px;
    border-top: 1px solid var(--border);
  }
  .mini tr:first-child td {
    border-top: 0;
  }
  .rk {
    width: 1.5rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    white-space: nowrap;
  }
  .winner td {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .set-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
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
  .sw-row.dim {
    opacity: 0.55;
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
