<script lang="ts">
  import Segmented from '../lib/components/Segmented.svelte';
  import Stepper from '../lib/components/Stepper.svelte';
  import { navigate, link } from '../lib/router';
  import { showToast } from '../lib/stores/toast';
  import {
    blankDef,
    newColumn,
    moveColumn,
    validateDef,
    defWarnings,
    firstEmoji,
    EMOJI_CHOICES,
    DEFAULT_EMOJI,
    MAX_NAME_LEN,
    MAX_TAGLINE_LEN,
    MAX_COLUMN_LABEL_LEN,
    MAX_HELP_LEN,
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
  // Snapshot of the def as loaded, so Cancel can warn before discarding real edits.
  let snapshot = $state<string>('');

  function serialize(d: CustomGameDef): string {
    // Everything the author can change; volatile timestamps are excluded so an untouched
    // form never reads as "dirty".
    const { createdAt: _c, updatedAt: _u, ...rest } = d;
    return JSON.stringify(rest);
  }

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
        snapshot = serialize(def);
      }
      return;
    }
    const found = list.find((d) => d.id === id);
    if (found && loadedKey !== id) {
      def = { ...found, columns: found.columns.map((c) => ({ ...c })) };
      dir = def.lowerIsBetter ? 'low' : 'high';
      shape = def.inputShape;
      loadedKey = id;
      snapshot = serialize(def);
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

  const dirty = $derived(serialize(def) !== snapshot);

  const notFound = $derived(!!id && $customGamesLoaded && !$customGameDefs.some((d) => d.id === id));

  // A plain-language recap of what the author has built — reinforces meaning without color.
  const summary = $derived.by(() => {
    const parts: string[] = [dir === 'low' ? 'Lowest score wins' : 'Highest score wins'];
    if (shape === 'columns') {
      const n = def.columns.length;
      parts.push(`${n} column${n === 1 ? '' : 's'}`);
    }
    if (def.target && def.target > 0) parts.push(`${targetPhrase} ${def.target}`);
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

  // For a "lowest wins" game a target isn't "first to N" — it's a bust ceiling that *ends*
  // the game (like Hearts to 100), so the label/summary copy flips with the win direction.
  const targetLabel = $derived(dir === 'low' ? 'End the game at' : 'Target score');
  const targetPhrase = $derived(dir === 'low' ? 'ends at' : 'first to');

  // Normalize the working def exactly as it will be saved — shared by the live validation
  // preview and save() so the two never disagree.
  function buildClean(): CustomGameDef {
    return {
      ...def,
      name: def.name.trim(),
      emoji: firstEmoji(def.emoji) || DEFAULT_EMOJI,
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
  }

  // Live guidance: the blocking error (if any) and any soft, non-blocking nudges. Surfaced
  // in-place so the author is guided *before* tapping the button — not only via a save toast.
  const error = $derived(validateDef(buildClean()));
  const warnings = $derived.by(() => {
    const list = defWarnings(buildClean());
    const name = def.name.trim().toLowerCase();
    if (name) {
      const clash = $customGameDefs.some(
        (d) => d.id !== def.id && !d.archived && !d.deleted && d.name.trim().toLowerCase() === name,
      );
      if (clash) list.push(`You already have a game called “${def.name.trim()}”.`);
    }
    return list;
  });

  function addColumn() {
    def.columns = [...def.columns, newColumn('')];
  }
  function removeColumn(i: number) {
    def.columns = def.columns.filter((_, j) => j !== i);
  }
  function moveCol(i: number, delta: number) {
    def.columns = moveColumn(def.columns, i, delta);
  }

  // Target is a coarse goal (e.g. "first to 100"), so it steps in larger jumps than a single
  // round entry — never the 1-or-2-per-tap of `points per tap`, which would make 100 a slog.
  const targetStep = $derived(Math.max(10, Math.round(def.step) || 1));

  async function save() {
    const clean = buildClean();
    const err = validateDef(clean);
    if (err) {
      showToast(err);
      return;
    }
    // Snapshot the saved state so the follow-up navigation isn't treated as discarding edits.
    snapshot = serialize(clean);
    await saveCustomGame(clean);
    showToast(editing ? 'Game updated' : 'Game created');
    navigate(`/${clean.id}`);
  }

  function cancel() {
    if (dirty && !confirm('Discard your changes?')) return;
    navigate(editing ? `/${def.id}` : '/');
  }

  /** One-tap emoji from the curated palette. */
  function pickEmoji(e: string) {
    def.emoji = e;
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
  <div class="preview gametile" aria-label={`Preview: ${def.name.trim() || 'Untitled game'}. ${def.tagline.trim() || summary}`}>
    <span class="emoji" aria-hidden="true">{firstEmoji(def.emoji) || DEFAULT_EMOJI}</span>
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
          maxlength={MAX_NAME_LEN}
          placeholder="Rummy to 500"
          aria-label="Game name"
        />
      </div>
    </div>
    <div class="emoji-pick" role="group" aria-label="Suggested emojis">
      {#each EMOJI_CHOICES as e (e)}
        <button
          type="button"
          class="emoji-opt"
          class:on={firstEmoji(def.emoji) === e}
          aria-pressed={firstEmoji(def.emoji) === e}
          aria-label={`Use ${e}`}
          onclick={() => pickEmoji(e)}
        >
          {e}
        </button>
      {/each}
    </div>
    <div>
      <div class="fieldlabel">Tagline <span class="muted">(optional)</span></div>
      <input
        type="text"
        bind:value={def.tagline}
        maxlength={MAX_TAGLINE_LEN}
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
                maxlength={MAX_COLUMN_LABEL_LEN}
                placeholder={`Column ${i + 1}`}
                aria-label={`Column ${i + 1} name`}
              />
              <label class="neg">
                <input type="checkbox" bind:checked={col.negative} />
                Subtracts
              </label>
              <div class="colbtns">
                <button
                  type="button"
                  class="btn ghost move"
                  onclick={() => moveCol(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move column ${i + 1} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="btn ghost move"
                  onclick={() => moveCol(i, 1)}
                  disabled={i === def.columns.length - 1}
                  aria-label={`Move column ${i + 1} down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  class="btn ghost move"
                  onclick={() => removeColumn(i)}
                  disabled={def.columns.length <= 1}
                  aria-label={`Remove column ${i + 1}`}
                >
                  ✕
                </button>
              </div>
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
        <div class="fieldlabel">{targetLabel}</div>
        <div class="muted sm">0 = no target</div>
      </div>
      <Stepper bind:value={def.target} min={0} step={targetStep} />
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
      maxlength={MAX_HELP_LEN}
      placeholder="A sentence or two of rules, shown in the in-game help."
      aria-label="How to play"
    ></textarea>
  </div>

  <div class="actions stack">
    {#if warnings.length}
      <div class="notes" role="note">
        {#each warnings as w (w)}
          <div class="note muted sm">💡 {w}</div>
        {/each}
      </div>
    {/if}
    {#if error}
      {#if def.name.trim()}
        <div class="formerror sm" role="alert">⚠ {error}</div>
      {:else}
        <div class="formhint sm" role="status">💡 {error}</div>
      {/if}
    {/if}
    <button class="btn primary block" onclick={save} disabled={!!error}>
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
  /* One-tap suggested emojis — a wrapping grid of neutral chips (no gold, no second violet). */
  .emoji-pick {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .emoji-opt {
    width: 46px;
    height: 46px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.35rem;
    line-height: 1;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    cursor: pointer;
    transition: transform 0.05s ease, background 0.15s ease, border-color 0.15s ease;
  }
  .emoji-opt:hover {
    background: var(--surface-3);
  }
  .emoji-opt:active {
    transform: translateY(1px);
  }
  .emoji-opt.on {
    border-color: var(--primary);
    background: var(--surface-3);
  }
  .emoji-opt:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .notes {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 4px;
  }
  /* Errors carry a ⚠ glyph + words so meaning never rides on color alone. */
  .formerror {
    color: var(--bad);
    margin-bottom: 4px;
  }
  /* The pre-first-edit nudge (e.g. "name your game") is guidance, not a mistake — muted with a
     💡, so a disabled Create button always says *why*, without shouting error-coral at a blank form. */
  .formhint {
    color: var(--muted);
    margin-bottom: 4px;
  }
  /* Column rows are a form group on the next surface step up — not nested cards (no shadow). */
  .colrow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .collabel {
    flex: 1 1 150px;
    min-width: 0;
  }
  .neg {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    /* ≥46px tap target: the whole label (checkbox + word) is one comfortable one-handed hit. */
    min-height: 46px;
    padding: 0 4px;
    color: var(--text);
    font-size: 0.9rem;
    white-space: nowrap;
    cursor: pointer;
  }
  .neg input {
    width: 22px;
    height: 22px;
  }
  /* Reorder + remove cluster: keeps the row controls together and pushes them to the trailing
     edge so labels line up as the group wraps below the field on a narrow phone. */
  .colbtns {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }
  .move {
    flex: none;
    width: 46px;
    padding: 0;
    font-size: 1.05rem;
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
