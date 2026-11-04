<script lang="ts">
  import { tick } from 'svelte';
  import type { ConfigField, GamePreset, ID, PresetKind } from '../types';
  import { defaultConfig } from '../types';
  import { activePlayers, playerRosterReady } from '../stores/players';
  import { crewNames, crewSignature } from '../stores/crews';
  import {
    presetsForType,
    savePreset,
    updatePreset,
    renamePreset,
    deletePresetWithUndo,
    presetKind,
    previewPreset,
    presetMatches,
    pruneUnavailableGroupPlayers,
  } from '../stores/presets';

  let {
    type,
    selected = $bindable([]),
    config = $bindable({}),
    fields,
    min = 1,
    max = 12,
    maxForConfig,
  }: {
    type: string;
    selected: ID[];
    config: Record<string, unknown>;
    fields: ConfigField[] | undefined;
    min?: number;
    max?: number;
    maxForConfig?: (config: Record<string, unknown>) => number;
  } = $props();

  const presets = $derived.by(() => {
    void type; // re-subscribe when the game type changes
    return presetsForType(type);
  });

  const validIds = $derived($activePlayers.map((p) => p.id));
  let cleanupNotice = $state('');
  let applyNotice = $state('');

  $effect(() => {
    if (!$playerRosterReady) return;
    const removed = pruneUnavailableGroupPlayers(
      $presets.filter((p) => presetKind(p) === 'group').map((p) => p.id),
      validIds,
    );
    if (removed) {
      cleanupNotice = `Removed ${removed} unavailable player${removed === 1 ? '' : 's'} from Player Groups.`;
    }
  });

  const kinds: { kind: PresetKind; label: string; icon: string }[] = [
    { kind: 'group', label: 'Player Group', icon: '👥' },
    { kind: 'rules', label: 'Rules Preset', icon: '⚙️' },
    { kind: 'full', label: 'Game Preset', icon: '👥 ⚙️' },
  ];

  function preview(p: GamePreset) {
    return previewPreset(p, selected, config, validIds, fields);
  }

  function compatibility(p: GamePreset): string {
    const next = preview(p);
    const limit = maxForConfig?.(next.config) ?? max;
    const issues: string[] = [];
    if (next.unavailableIds.length) issues.push(`${next.unavailableIds.length} unavailable`);
    if (next.selected.length < min) issues.push(`needs at least ${min} players`);
    if (next.selected.length > limit) issues.push(`at most ${limit} players`);
    return issues.join(' · ');
  }

  // Which preset (if any) the form was last filled from — drives the Update/Rename/Delete tools.
  let activeId = $state<string | null>(null);
  const active = $derived($presets.find((p) => p.id === activeId) ?? null);

  type Mode = 'idle' | 'saving' | 'renaming';
  let mode = $state<Mode>('idle');
  let draftName = $state('');
  let saveKind = $state<PresetKind>('full');
  let container = $state<HTMLDivElement>();
  let saveButton = $state<HTMLButtonElement>();
  let renameButton = $state<HTMLButtonElement>();
  const canSave = $derived(saveKind === 'rules' || ($playerRosterReady && selected.length > 0));

  async function closeForm(destination: 'preset' | 'rename' | 'save', id = activeId) {
    mode = 'idle';
    await tick();
    const chip = [...(container?.querySelectorAll<HTMLButtonElement>('.pchip') ?? [])].find(
      (button) => button.dataset.presetId === id && !button.disabled,
    );
    const target =
      destination === 'preset' ? chip : destination === 'rename' ? renameButton : saveButton;
    (target?.isConnected ? target : chip ?? saveButton)?.focus();
  }

  // The applied preset is "dirty" once the current form no longer matches it — only then is
  // there anything to Update.
  const dirty = $derived(
    active ? !presetMatches(active, selected, config, validIds, fields) : false,
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
    if (!$playerRosterReady) return;
    applyNotice = '';
    // Clicking the already-active preset toggles it off. If the form still matches the preset
    // (untouched), fall back to the game's default empty state; if you've since edited it, keep
    // your changes and just detach the preset label ("barring any input changes I have made").
    if (activeId === p.id) {
      if (!dirty) {
        if (presetKind(p) !== 'rules') selected = [];
        if (presetKind(p) !== 'group') config = defaultConfig(fields);
      }
      activeId = null;
      mode = 'idle';
      return;
    }
    if (presetKind(p) === 'group') {
      pruneUnavailableGroupPlayers([p.id], validIds);
    }
    commitApply(p);
  }

  function commitApply(p: GamePreset) {
    const next = preview(p);
    selected = next.selected;
    config = next.config;
    activeId = p.id;
    applyNotice =
      presetKind(p) === 'full' && next.unavailableIds.length
        ? `${next.unavailableIds.length} unavailable players were not selected. The saved Game Preset is unchanged.`
        : '';
    mode = 'idle';
  }

  function startSave() {
    draftName = suggestName();
    saveKind = 'full';
    mode = 'saving';
  }

  async function confirmSave(e: Event) {
    e.preventDefault();
    if (!canSave || !draftName.trim()) return;
    const p = savePreset(type, draftName, selected, config, saveKind);
    activeId = p.id;
    await closeForm('preset', p.id);
  }

  function startRename() {
    if (!active) return;
    draftName = active.name;
    mode = 'renaming';
  }

  async function confirmRename(e: Event) {
    e.preventDefault();
    if (active) renamePreset(active.id, draftName);
    await closeForm('preset');
  }

  function saveOverActive() {
    if (active) updatePreset(active.id, selected, config);
  }

  async function remove() {
    if (!active) return;
    deletePresetWithUndo(active);
    activeId = null;
    await closeForm('save');
  }

  async function cancel() {
    await closeForm(mode === 'renaming' ? 'rename' : 'save');
  }
</script>

<div class="presets" bind:this={container}>
  <div class="fieldlabel">Presets</div>

  {#if $presets.length}
    {#each kinds as section (section.kind)}
      {@const entries = $presets.filter((p) => presetKind(p) === section.kind)}
      {#if entries.length}
        <div class="preset-section" role="group" aria-label={section.label}>
          <div class="kind-label">
            <span aria-hidden="true">{section.icon}</span>
            {section.label}
          </div>
          <div class="pchips">
            {#each entries as p (p.id)}
              <button
                type="button"
                class="pchip"
                data-preset-id={p.id}
                class:on={activeId === p.id}
                aria-pressed={activeId === p.id}
                disabled={!$playerRosterReady}
                onclick={() => apply(p)}
                title={activeId === p.id ? `Turn off “${p.name}”` : `Use “${p.name}”`}
              >
                <span class="pname">{p.name}</span>
                <span class="pcount">
                  {#if section.kind !== 'rules'}{p.playerIds.length} players{/if}
                  {#if compatibility(p)}
                    <span>{section.kind === 'rules' ? '' : ' · '}{compatibility(p)}</span>
                  {/if}
                </span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  {/if}

  {#if !$playerRosterReady}
    <p class="hint muted" role="status">
      Saved players are unavailable while the roster loads or restores. If loading fails, reload to
      retry; Player Groups stay unchanged.
    </p>
  {/if}
  {#if cleanupNotice}
    <p class="hint muted" role="status">{cleanupNotice}</p>
  {/if}
  {#if applyNotice}
    <p class="hint muted" role="status">{applyNotice}</p>
  {/if}

  {#if mode === 'saving'}
    <form class="stack" onsubmit={confirmSave}>
      <label class="stack">
        <span class="hint">Save as</span>
        <select bind:value={saveKind}>
          {#each kinds as choice (choice.kind)}
            <option value={choice.kind} aria-label={choice.label}
              >{choice.icon} {choice.label}</option
            >
          {/each}
        </select>
      </label>
      {#if !canSave}
        <p class="hint muted" role="status">
          Select players below to save a Player Group or Game Preset.
        </p>
      {/if}
      <div class="prow">
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="grow"
          type="text"
          placeholder="Preset name…"
          aria-label="Preset name"
          required
          autocomplete="off"
          bind:value={draftName}
          autofocus
        />
        <button class="btn" type="submit" disabled={!canSave || !draftName.trim()}>Save</button>
        <button class="btn ghost" type="button" onclick={cancel}>Cancel</button>
      </div>
    </form>
  {:else if mode === 'renaming' && active}
    <form class="prow" onsubmit={confirmRename}>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="grow"
        type="text"
        placeholder="Preset name…"
        aria-label="Rename preset"
        required
        autocomplete="off"
        bind:value={draftName}
        autofocus
      />
      <button class="btn" type="submit" disabled={!draftName.trim()}>Rename</button>
      <button class="btn ghost" type="button" onclick={cancel}>Cancel</button>
    </form>
  {:else if active}
    <div class="ptools">
      <span class="applied">
        {dirty ? 'Modified' : 'Using'}: {active.name}
      </span>
      <span class="spacer"></span>
      {#if dirty}
        <button
          class="btn small"
          type="button"
          onclick={saveOverActive}
          disabled={presetKind(active) !== 'rules' && (!$playerRosterReady || !selected.length)}
          >Update</button
        >
      {/if}
      <button class="btn small ghost" type="button" bind:this={renameButton} onclick={startRename}
        >Rename</button
      >
      <button class="btn small ghost" type="button" bind:this={saveButton} onclick={startSave}
        >Save new</button
      >
      <button class="btn small ghost" type="button" onclick={remove}>Delete</button>
    </div>
    {#if dirty && preview(active).unavailableIds.length}
      <p class="muted hint">Updating replaces the saved lineup, including unavailable players.</p>
    {/if}
  {:else}
    <button class="linkbtn" type="button" bind:this={saveButton} onclick={startSave}>
      ＋ Save preset
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
  .preset-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .kind-label {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .pname {
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .pchip {
    max-width: 100%;
    flex-wrap: wrap;
    text-align: left;
  }
  select {
    width: 100%;
    min-width: 0;
    min-height: 46px;
  }
  .prow {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .prow input {
    min-width: 120px;
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
