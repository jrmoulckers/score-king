<script lang="ts">
  import { settings } from '../lib/stores/settings';
  import { PALETTE } from '../lib/util';
  import Segmented from '../lib/components/Segmented.svelte';
  import Avatar from '../lib/components/Avatar.svelte';

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

  const oledDisabled = $derived($settings.theme !== 'dark');

  const previewPlayers = [
    { name: 'Ada Lovelace', color: PALETTE[0], score: 42 },
    { name: 'Bo Diddley', color: PALETTE[2], score: 38 },
    { name: 'Cy Young', color: PALETTE[4], score: 31 },
  ];

  function setBool(key: 'oled' | 'highContrast' | 'colorBlind', v: boolean) {
    settings.update((s) => ({ ...s, [key]: v }));
  }
</script>

<h1>Accessibility &amp; display</h1>
<p class="lede muted">Tune Score King to your eyes, your hands, and your table. Changes apply instantly and stick on this device.</p>

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
    <span class="muted sm">Dark keeps things calm under low light; light suits bright rooms.</span>
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
  <span class="switch">
    <input
      type="checkbox"
      checked={$settings.highContrast}
      onchange={(e) => setBool('highContrast', e.currentTarget.checked)}
    />
    <span class="track"><span class="thumb"></span></span>
  </span>
</label>

<label class="card sw-row row spread" class:dim={oledDisabled}>
  <span class="meta">
    <span class="name">True-black (OLED)</span>
    <span class="muted sm">
      {oledDisabled ? 'Switch to the dark theme to use true black.' : 'Pure-black surfaces save power and deepen contrast.'}
    </span>
  </span>
  <span class="switch">
    <input
      type="checkbox"
      checked={$settings.oled}
      disabled={oledDisabled}
      onchange={(e) => setBool('oled', e.currentTarget.checked)}
    />
    <span class="track"><span class="thumb"></span></span>
  </span>
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
  <span class="switch">
    <input
      type="checkbox"
      checked={$settings.colorBlind}
      onchange={(e) => setBool('colorBlind', e.currentTarget.checked)}
    />
    <span class="track"><span class="thumb"></span></span>
  </span>
</label>

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
