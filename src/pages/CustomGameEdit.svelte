<script lang="ts">
  import Segmented from '../lib/components/Segmented.svelte';
  import Stepper from '../lib/components/Stepper.svelte';
  import { navigate, link } from '../lib/router';
  import { showToast } from '../lib/stores/toast';
  import {
    blankDef,
    newColumn,
    validateDef,
    DEFAULT_EMOJI,
    type CustomGameDef,
  } from '../lib/games/custom/types';
  import { customGameDefs, customGamesLoaded, saveCustomGame } from '../lib/stores/customGames';

  let { id }: { id?: string } = $props();

  const editing = $derived(!!id);

  // The working copy. Editing operates on a clone so the store list isn't mutated until save.
  let def = $state<CustomGameDef>(blankDef());
  // Local mirrors for the two Segmented controls (they need bindable string vars).
  let dir = $state<'high' | 'low'>('high');
  let shape = $state<'counter' | 'columns'>('counter');
  let loadedKey = $state<string | null>(null);

  // Load the def to edit (or a blank one) once it's resolvable. Depends on the store so a
  // cold deep-link to /create/<id> fills in as soon as IndexedDB answers.
  $effect(() => {
    const list = $customGameDefs;
    if (!id) {
      if (loadedKey !== '__new__') {
        def = blankDef();
        dir = 'high';
        shape = 'counter';
        loadedKey = '__new__';
      }
      return;
    }
    const found = list.find((d) => d.id === id);
    if (found && loadedKey !== id) {
      def = { ...found, columns: found.columns.map((c) => ({ ...c })) };
      dir = def.lowerIsBetter ? 'low' : 'high';
      shape = def.inputShape;
      loadedKey = id;
    }
  });

  // Push the Segmented choices back into the working def (one-way).
  $effect(() => {
    def.lowerIsBetter = dir === 'low';
  });
  $effect(() => {
    def.inputShape = shape;
    if (shape === 'columns' && def.columns.length === 0) def.columns = [newColumn('')];
  });

  const notFound = $derived(!!id && $customGamesLoaded && !$customGameDefs.some((d) => d.id === id));

  // A plain-language recap of what the author has built — reinforces meaning without color.
  const summary = $derived.by(() => {
    const parts: string[] = [dir === 'low' ? 'Lowest score wins' : 'Highest score wins'];
    if (shape === 'columns') {
      const n = def.columns.length;
      parts.push(`${n} column${n === 1 ? '' : 's'}`);
    }
    if (def.target && def.target > 0) parts.push(`first to ${def.target}`);
    if (def.roundLimit && def.roundLimit > 0) {
      parts.push(`${def.roundLimit} round${def.roundLimit === 1 ? '' : 's'}`);
    }
    return parts.join(' · ');
  });

  const dirOptions = [
    { value: 'high', label: 'Highest wins' },
    { value: 'low', label: 'Lowest wins' },
  ];
  const shapeOptions = [
    { value: 'counter', label: 'One number' },
    { value: 'columns', label: 'Columns' },
  ];

  function addColumn() {
    def.columns = [...def.columns, newColumn('')];
  }
  function removeColumn(i: number) {
    def.columns = def.columns.filter((_, j) => j !== i);
  }

  async function save() {
    const clean: CustomGameDef = {
      ...def,
      name: def.name.trim(),
      emoji: (def.emoji || '').trim() || DEFAULT_EMOJI,
      tagline: def.tagline.trim(),
      help: (def.help ?? '').trim(),
      minPlayers: Math.max(1, Math.round(def.minPlayers) || 1),
      maxPlayers: Math.max(1, Math.round(def.maxPlayers) || 1),
      target: Math.max(0, Math.round(def.target ?? 0) || 0),
      roundLimit: Math.max(0, Math.round(def.roundLimit ?? 0) || 0),
      step: Math.max(1, Math.round(def.step ?? 1) || 1),
      columns:
        shape === 'columns'
          ? def.columns.map((c) => ({ ...c, label: c.label.trim() }))
          : def.columns,
      updatedAt: Date.now(),
    };
    const err = validateDef(clean);
    if (err) {
      showToast(err);
      return;
    }
    await saveCustomGame(clean);
    showToast(editing ? 'Game updated.' : 'Game created.');
    navigate(`/${clean.id}`);
  }

  function cancel() {
    navigate(editing ? `/${def.id}` : '/');
  }
</script>

{#if notFound}
  <div class="empty">
    <h2>Game not found</h2>
    <p class="muted">This custom game may have been deleted on this device.</p>
    <a class="btn primary" href="/" use:link>Back to games</a>
  </div>
{:else}
  <div class="row" style="gap: 12px; margin: 10px 4px 4px">
    <span style="font-size: 2rem" aria-hidden="true">{def.emoji || DEFAULT_EMOJI}</span>
    <div>
      <h1 style="margin: 0">{editing ? 'Edit game' : 'Create a game'}</h1>
      <div class="muted">Design your own scorer — it joins the catalog like any other.</div>
    </div>
  </div>

  <div class="section-title">Preview</div>
  <div class="preview gametile" aria-hidden="true">
    <span class="emoji">{def.emoji || DEFAULT_EMOJI}</span>
    <span class="name">{def.name.trim() || 'Untitled game'}</span>
    <span class="tag">{def.tagline.trim() || summary}</span>
  </div>
  <div class="muted sm recap">{summary}</div>

  <div class="section-title">Basics</div>
  <div class="card stack">
    <div class="row" style="align-items: flex-start; gap: 10px">
      <div style="flex: none">
        <div class="fieldlabel">Emoji</div>
        <input
          class="emoji-in"
          type="text"
          maxlength="8"
          bind:value={def.emoji}
          aria-label="Game emoji"
        />
      </div>
      <div class="grow">
        <div class="fieldlabel">Name</div>
        <input
          type="text"
          bind:value={def.name}
          placeholder="Rummy to 500"
          aria-label="Game name"
        />
      </div>
    </div>
    <div>
      <div class="fieldlabel">Tagline <span class="muted">(optional)</span></div>
      <input
        type="text"
        bind:value={def.tagline}
        placeholder="Low score takes it"
        aria-label="Tagline"
      />
    </div>
  </div>

  <div class="section-title">Scoring</div>
  <div class="card stack">
    <div>
      <div class="fieldlabel">Who wins</div>
      <Segmented label="Who wins" bind:value={dir} options={dirOptions} />
    </div>
    <div>
      <div class="fieldlabel">Round entry</div>
      <Segmented label="Round entry" bind:value={shape} options={shapeOptions} />
      <div class="muted sm hint">
        {#if shape === 'counter'}
          One number per player each round.
        {:else}
          A named number per player each round — add columns like Bid and Tricks.
        {/if}
      </div>
    </div>

    {#if shape === 'columns'}
      <div>
        <div class="fieldlabel">Columns</div>
        <div class="stack cols">
          {#each def.columns as col, i (col.key)}
            <div class="colrow">
              <input
                class="collabel"
                type="text"
                bind:value={col.label}
                placeholder={`Column ${i + 1}`}
                aria-label={`Column ${i + 1} name`}
              />
              <label class="neg">
                <input type="checkbox" bind:checked={col.negative} />
                Subtracts
              </label>
              <button
                type="button"
                class="btn ghost remove"
                onclick={() => removeColumn(i)}
                disabled={def.columns.length <= 1}
                aria-label={`Remove column ${i + 1}`}
              >
                ✕
              </button>
            </div>
          {/each}
        </div>
        <button type="button" class="btn ghost addcol" onclick={addColumn}>＋ Add column</button>
      </div>
    {/if}
  </div>

  <div class="section-title">Limits &amp; players</div>
  <div class="card stack">
    <div class="row spread optrow">
      <div>
        <div class="fieldlabel">Target score</div>
        <div class="muted sm">0 = no target</div>
      </div>
      <Stepper bind:value={def.target} min={0} step={def.step && def.step > 1 ? def.step : 10} />
    </div>
    <div class="row spread optrow">
      <div>
        <div class="fieldlabel">Round limit</div>
        <div class="muted sm">0 = open-ended</div>
      </div>
      <Stepper bind:value={def.roundLimit} min={0} step={1} />
    </div>
    <div class="row spread optrow">
      <div class="fieldlabel" style="margin: 0">Players</div>
      <div class="row" style="gap: 10px">
        <span class="muted sm">min</span>
        <Stepper bind:value={def.minPlayers} min={1} max={99} step={1} />
        <span class="muted sm">max</span>
        <Stepper bind:value={def.maxPlayers} min={1} max={99} step={1} />
      </div>
    </div>
    <div class="row spread optrow">
      <div>
        <div class="fieldlabel">Points per tap</div>
        <div class="muted sm">Stepper increment during play</div>
      </div>
      <Stepper bind:value={def.step} min={1} max={100} step={1} />
    </div>
  </div>

  <div class="section-title">How to play <span class="muted">(optional)</span></div>
  <div class="card stack">
    <textarea
      class="help-area"
      rows="3"
      bind:value={def.help}
      placeholder="A sentence or two of rules, shown in the in-game help."
      aria-label="How to play"
    ></textarea>
  </div>

  <div class="actions stack">
    <button class="btn primary block" onclick={save} disabled={!def.name.trim()}>
      {editing ? 'Save changes' : 'Create game'}
    </button>
    <button class="btn ghost block" onclick={cancel}>Cancel</button>
  </div>
{/if}

<style>
  .preview {
    max-width: 220px;
    cursor: default;
  }
  .preview:hover {
    border-color: var(--border);
    transform: none;
  }
  .recap {
    margin: 8px 4px 0;
  }
  .sm {
    font-size: 0.85rem;
  }
  .hint,
  .recap {
    margin-top: 6px;
  }
  .emoji-in {
    width: 64px;
    text-align: center;
    font-size: 1.4rem;
  }
  /* Column rows are a form group on the next surface step up — not nested cards (no shadow). */
  .colrow {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .collabel {
    flex: 1;
    min-width: 0;
  }
  .neg {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--text);
    font-size: 0.9rem;
    white-space: nowrap;
    cursor: pointer;
  }
  .neg input {
    width: 20px;
    height: 20px;
  }
  .remove {
    flex: none;
    width: 46px;
    padding: 0;
  }
  .addcol {
    margin-top: 4px;
  }
  .optrow {
    gap: 12px;
    flex-wrap: wrap;
  }
  .help-area {
    width: 100%;
    padding: 11px 12px;
    min-height: 84px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    resize: vertical;
  }
  .help-area:focus {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .actions {
    margin-top: 18px;
  }
  .empty {
    text-align: center;
    padding: 48px 16px;
  }
</style>
