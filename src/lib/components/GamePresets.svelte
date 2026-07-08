<script lang="ts">
  import type { ConfigField, GamePreset, ID } from '../types';
  import { activePlayers } from '../stores/players';
  import { crewNames, crewSignature } from '../stores/crews';
  import {
    presetsForType,
    savePreset,
    updatePreset,
    renamePreset,
    deletePresetWithUndo,
    resolvePresetPlayers,
    resolvePresetConfig,
    presetMatches,
  } from '../stores/presets';

  let {
    type,
    selected = $bindable([]),
    config = $bindable({}),
    fields,
    max = 12,
  }: {
    type: string;
    selected: ID[];
    config: Record<string, any>;
    fields: ConfigField[] | undefined;
    max?: number;
  } = $props();

  const presets = $derived.by(() => {
    void type; // re-subscribe when the game type changes
    return presetsForType(type);
  });

  const validIds = $derived($activePlayers.map((p) => p.id));

  // Which preset (if any) the form was last filled from — drives the Update/Rename/Delete tools.
  let activeId = $state<string | null>(null);
  const active = $derived($presets.find((p) => p.id === activeId) ?? null);

  type Mode = 'idle' | 'saving' | 'renaming';
  let mode = $state<Mode>('idle');
  let draftName = $state('');

  // The applied preset is "dirty" once the current form no longer matches it — only then is
  // there anything to Update.
  const dirty = $derived(
    active ? !presetMatches(active, selected, config, validIds, max, fields) : false,
  );

  /** A friendly default name for a brand-new preset: the crew's nickname, else its player names. */
  function suggestName(): string {
    if (!selected.length) return '';
    const sig = crewSignature(selected);
    const crew = $crewNames[sig];
    if (crew) return crew;
    const names = selected
      .map((id) => $activePlayers.find((p) => p.id === id)?.name)
      .filter((n): n is string => !!n);
    return names.join(', ');
  }

  function apply(p: GamePreset) {
    selected = resolvePresetPlayers(p, validIds, max);
    config = resolvePresetConfig(p, fields);
    activeId = p.id;
    mode = 'idle';
  }

  function startSave() {
    draftName = suggestName();
    mode = 'saving';
  }

  function confirmSave(e: Event) {
    e.preventDefault();
    const p = savePreset(type, draftName, selected, config);
    activeId = p.id;
    mode = 'idle';
  }

  function startRename() {
    if (!active) return;
    draftName = active.name;
    mode = 'renaming';
  }

  function confirmRename(e: Event) {
    e.preventDefault();
    if (active) renamePreset(active.id, draftName);
    mode = 'idle';
  }

  function saveOverActive() {
    if (active) updatePreset(active.id, selected, config);
  }

  function remove() {
    if (!active) return;
    deletePresetWithUndo(active);
    activeId = null;
    mode = 'idle';
  }

  function cancel() {
    mode = 'idle';
  }
</script>

<div class="presets">
  <div class="fieldlabel">Presets</div>

  {#if $presets.length}
    <div class="pchips" role="list">
      {#each $presets as p (p.id)}
        <button
          type="button"
          class="pchip"
          class:on={activeId === p.id}
          aria-pressed={activeId === p.id}
          onclick={() => apply(p)}
          title={`Use “${p.name}”`}
        >
          <span class="pname">{p.name}</span>
          <span class="pcount">{p.playerIds.length}👤</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="muted hint">Save a lineup and rules you like — then start it again in one tap.</p>
  {/if}

  {#if mode === 'saving'}
    <form class="prow" onsubmit={confirmSave}>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="grow"
        type="text"
        placeholder="Preset name…"
        aria-label="Preset name"
        autocomplete="off"
        bind:value={draftName}
        autofocus
      />
      <button class="btn" type="submit">Save</button>
      <button class="btn ghost" type="button" onclick={cancel}>Cancel</button>
    </form>
  {:else if mode === 'renaming' && active}
    <form class="prow" onsubmit={confirmRename}>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="grow"
        type="text"
        placeholder="Preset name…"
        aria-label="Rename preset"
        autocomplete="off"
        bind:value={draftName}
        autofocus
      />
      <button class="btn" type="submit">Rename</button>
      <button class="btn ghost" type="button" onclick={cancel}>Cancel</button>
    </form>
  {:else if active}
    <div class="ptools">
      <span class="applied">
        {#if dirty}Modified “{active.name}”{:else}Using “{active.name}”{/if}
      </span>
      <span class="spacer"></span>
      {#if dirty}
        <button class="btn small" type="button" onclick={saveOverActive}>Update</button>
      {/if}
      <button class="btn small ghost" type="button" onclick={startRename}>Rename</button>
      <button class="btn small ghost" type="button" onclick={startSave}>Save new</button>
      <button class="btn small ghost" type="button" onclick={remove}>Delete</button>
    </div>
  {:else}
    <button class="linkbtn" type="button" onclick={startSave}>
      ＋ Save current setup
    </button>
  {/if}
</div>

<style>
  .presets {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .hint {
    font-size: 0.85rem;
    margin: 0;
  }
  .pchips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  /* A preset chip mirrors the player chips: neutral until selected, violet-tinted when the
     form was filled from it — never a solid violet fill (that's reserved for the one primary
     action) and never gold. */
  .pchip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font-weight: 600;
  }
  .pchip.on {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 18%, var(--surface-2));
  }
  .pchip:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .pcount {
    font-size: 0.75rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .prow {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .ptools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .applied {
    font-size: 0.85rem;
    color: var(--muted);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .spacer {
    flex: 1;
  }
  /* A quiet violet text button (allowed as a text link, not a second violet fill). */
  .linkbtn {
    align-self: flex-start;
    background: none;
    border: none;
    color: var(--primary);
    font-weight: 600;
    font-size: 0.9rem;
    padding: 8px 2px;
    cursor: pointer;
    min-height: 46px;
  }
  .linkbtn:disabled {
    color: var(--muted);
    cursor: default;
  }
  .linkbtn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
    border-radius: var(--radius-sm);
  }
</style>
