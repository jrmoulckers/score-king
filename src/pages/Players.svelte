<script lang="ts">
  import {
    players,
    activePlayers,
    createPlayer,
    generatePlayer,
    updatePlayerProfile,
    archivePlayer,
    restorePlayer,
    removePlayer,
    nameExists,
  } from '../lib/stores/players';
  import { leadMember, setLeadMember } from '../lib/stores/identity';
  import { PLAYER_COLOR_CHOICES, resolvePlayerColor, MAX_NAME_LEN } from '../lib/util';
  import {
    firstGrapheme,
    prepareProfileImage,
    prepareRemoteProfileImage,
    profileImageUrlError,
  } from '../lib/profile';
  import { settings } from '../lib/stores/settings';
  import { showToast } from '../lib/stores/toast';
  import Avatar from '../lib/components/Avatar.svelte';
  import type { Player, PlayerAppearance, PlayerAvatarStyle } from '../lib/types';

  let newName = $state('');
  let editingId = $state<string | null>(null);
  let editName = $state('');
  let editColor = $state('#7c5cff');
  let editColor2 = $state('#22d3ee');
  let editStyle = $state<PlayerAvatarStyle>('solid');
  let editImage = $state<string | undefined>();
  let editEmoji = $state('');
  let imageUrl = $state('');
  let imageError = $state('');
  let imageBusy = $state(false);
  let imageFileInput = $state<HTMLInputElement>();
  let imageAbortController: AbortController | undefined;
  let imageRequestId = 0;
  let showArchived = $state(false);
  let confirmDeleteId = $state<string | null>(null);
  const emojiChoices = [
    { emoji: '👑', name: 'Crown' },
    { emoji: '🎲', name: 'Dice' },
    { emoji: '🃏', name: 'Playing card' },
    { emoji: '🏆', name: 'Trophy' },
    { emoji: '⭐', name: 'Star' },
    { emoji: '🔥', name: 'Fire' },
    { emoji: '🌈', name: 'Rainbow' },
    { emoji: '✨', name: 'Sparkles' },
    { emoji: '⚡', name: 'Lightning' },
    { emoji: '🎯', name: 'Bullseye' },
    { emoji: '💎', name: 'Gem' },
    { emoji: '🚀', name: 'Rocket' },
    { emoji: '🐉', name: 'Dragon' },
    { emoji: '🦊', name: 'Fox' },
    { emoji: '🐸', name: 'Frog' },
    { emoji: '🐙', name: 'Octopus' },
    { emoji: '🦄', name: 'Unicorn' },
    { emoji: '🐧', name: 'Penguin' },
    { emoji: '🦖', name: 'Dinosaur' },
    { emoji: '🐝', name: 'Bee' },
    { emoji: '👻', name: 'Ghost' },
    { emoji: '👽', name: 'Alien' },
    { emoji: '🍕', name: 'Pizza' },
    { emoji: '🍄', name: 'Mushroom' },
    { emoji: '🌵', name: 'Cactus' },
    { emoji: '🍒', name: 'Cherries' },
    { emoji: '⚽', name: 'Soccer ball' },
    { emoji: '🎮', name: 'Game controller' },
  ] as const;

  const archived = $derived($players.filter((p) => p.archived));
  // Live hint while typing so a duplicate is caught before it lands on the board.
  const dupWarning = $derived(
    nameExists(newName) ? `Already a player named “${newName.trim()}”.` : '',
  );

  async function add() {
    const n = newName.trim();
    if (!n) return;
    const dup = nameExists(n);
    await createPlayer(n);
    newName = '';
    // Non-blocking: twins are allowed, but say so — two identical rows are otherwise
    // indistinguishable except by avatar colour.
    if (dup) showToast(`Two players named “${n}” — rename one to tell them apart.`);
  }
  function startEdit(p: Player) {
    cancelImageRequest();
    editingId = p.id;
    editName = p.name;
    editColor = p.color;
    editColor2 =
      p.appearance?.color2 ??
      PLAYER_COLOR_CHOICES.find(({ value }) => value !== p.color)?.value ??
      '#0284c7';
    editStyle = p.appearance?.style ?? 'solid';
    editImage = p.appearance?.image;
    editEmoji = p.appearance?.emoji ?? '';
    imageUrl = '';
    imageError = '';
  }
  async function saveEdit(p: Player) {
    if (!editName.trim() || imageBusy) return;
    await updatePlayerProfile(p, {
      name: editName,
      color: editColor,
      appearance: draftAppearance(),
    });
    editingId = null;
  }
  function cancelEdit() {
    cancelImageRequest();
    editingId = null;
    imageError = '';
  }
  function cancelImageRequest() {
    imageRequestId += 1;
    imageAbortController?.abort();
    imageAbortController = undefined;
    imageBusy = false;
  }
  function draftAppearance(): PlayerAppearance {
    return {
      style: editStyle === 'image' && !editImage ? 'solid' : editStyle,
      ...(editStyle === 'gradient' ? { color2: editColor2 } : {}),
      ...(editStyle === 'image' && editImage ? { image: editImage } : {}),
      ...(firstGrapheme(editEmoji) ? { emoji: firstGrapheme(editEmoji) } : {}),
    };
  }
  async function useImage(blob: Blob) {
    const playerId = editingId;
    const requestId = ++imageRequestId;
    imageAbortController?.abort();
    imageAbortController = undefined;
    imageBusy = true;
    imageError = '';
    try {
      const image = await prepareProfileImage(blob);
      if (requestId === imageRequestId && editingId === playerId) {
        editImage = image;
        editStyle = 'image';
      }
    } catch (error) {
      if (requestId === imageRequestId && editingId === playerId) {
        imageError = error instanceof Error ? error.message : 'That image could not be prepared.';
      }
    } finally {
      if (requestId === imageRequestId) imageBusy = false;
    }
  }
  async function chooseImage(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await useImage(file);
    input.value = '';
  }
  async function useImageUrl() {
    const validationError = profileImageUrlError(imageUrl);
    if (validationError) {
      imageError = validationError;
      return;
    }
    const playerId = editingId;
    const requestId = ++imageRequestId;
    imageAbortController?.abort();
    imageBusy = true;
    imageError = '';
    const controller = new AbortController();
    imageAbortController = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const image = await prepareRemoteProfileImage(imageUrl, controller.signal);
      if (requestId === imageRequestId && editingId === playerId) {
        editImage = image;
        editStyle = 'image';
        imageUrl = '';
      }
    } catch (error) {
      if (requestId === imageRequestId && editingId === playerId) {
        imageError = error instanceof Error ? error.message : 'That image could not be downloaded.';
      }
    } finally {
      window.clearTimeout(timeout);
      if (requestId === imageRequestId) {
        imageAbortController = undefined;
        imageBusy = false;
      }
    }
  }
  function toggleLead(p: Player) {
    setLeadMember($leadMember?.id === p.id ? null : p.id);
  }
  async function archive(p: Player) {
    if ($leadMember?.id === p.id) setLeadMember(null);
    await archivePlayer(p);
  }
  async function remove(p: Player) {
    if ($leadMember?.id === p.id) setLeadMember(null);
    confirmDeleteId = null;
    await removePlayer(p.id);
    showToast(`${p.name} deleted. Past games keep their scores.`);
  }
</script>

<h1>Players</h1>

<form
  class="row"
  onsubmit={(e) => {
    e.preventDefault();
    add();
  }}
  style="margin-bottom: 6px"
>
  <input
    class="grow"
    type="text"
    placeholder="New player name…"
    aria-label="New player name"
    maxlength={MAX_NAME_LEN}
    bind:value={newName}
  />
  <button
    class="iconbtn"
    type="button"
    onclick={generatePlayer}
    aria-label="Generate a player"
    title="Surprise me with a name">🎲</button
  >
  <button class="btn primary" type="submit" disabled={!newName.trim()}>Add</button>
</form>
{#if dupWarning}
  <p class="dup-hint" role="status">
    ↳ {dupWarning} Adding again is fine — give them different names to tell them apart.
  </p>
{/if}

{#if $activePlayers.length === 0 && archived.length === 0}
  <div class="empty firstrun">
    <div class="firstrun-emoji" aria-hidden="true">👥</div>
    <p><strong>Add your regulars once.</strong></p>
    <p class="muted">
      Players are shared across every game and leaderboard — add them here and they’ll be ready to
      pick whenever you start a game. Tap 🎲 for a surprise name.
    </p>
  </div>
{:else if $activePlayers.length > 0}
  <div class="player-grid">
    {#each $activePlayers as p (p.id)}
      <div class="card" class:lead={$leadMember?.id === p.id} class:editing={editingId === p.id}>
        <div class="row spread">
          <span class="row grow" style="gap: 10px; min-width: 0">
            <Avatar
              name={editingId === p.id ? editName || p.name : p.name}
              color={editingId === p.id ? editColor : p.color}
              playerId={p.id}
              appearance={editingId === p.id ? draftAppearance() : p.appearance}
              size={editingId === p.id ? 52 : 34}
            />
            {#if editingId === p.id}
              <input
                class="grow"
                type="text"
                bind:value={editName}
                aria-label="Player name"
                maxlength={MAX_NAME_LEN}
              />
            {:else}
              <span class="who">
                <strong>{p.name}</strong>
                {#if $leadMember?.id === p.id || !p.claimed}
                  <span class="tags">
                    {#if $leadMember?.id === p.id}<span class="tag lead-tag">👑 On this device</span
                      >{/if}
                    {#if !p.claimed}<span class="tag muted-tag">Unclaimed</span>{/if}
                  </span>
                {/if}
              </span>
            {/if}
          </span>
          {#if editingId !== p.id}
            <span class="row" style="gap: 6px">
              <button
                class="iconbtn"
                class:on={$leadMember?.id === p.id}
                onclick={() => toggleLead(p)}
                aria-pressed={$leadMember?.id === p.id}
                aria-label={$leadMember?.id === p.id
                  ? 'Stop playing on this device'
                  : 'Play as this member on this device'}
                title="Play on this device">👑</button
              >
              <button
                class="iconbtn"
                onclick={() => startEdit(p)}
                aria-label="Edit player"
                title="Edit profile">✎</button
              >
            </span>
          {/if}
        </div>
        {#if editingId === p.id}
          <div class="editpanel">
            <fieldset class="profile-section">
              <legend>Avatar style</legend>
              <div class="style-grid">
                <button
                  type="button"
                  class="style-choice"
                  class:sel={editStyle === 'solid'}
                  aria-pressed={editStyle === 'solid'}
                  onclick={() => (editStyle = 'solid')}
                >
                  <span class="style-sample solid" style="--c:{editColor}"></span>
                  Solid
                </button>
                <button
                  type="button"
                  class="style-choice"
                  class:sel={editStyle === 'gradient'}
                  aria-pressed={editStyle === 'gradient'}
                  onclick={() => (editStyle = 'gradient')}
                >
                  <span class="style-sample gradient" style="--c:{editColor}; --c2:{editColor2}"
                  ></span>
                  Gradient
                </button>
                <button
                  type="button"
                  class="style-choice"
                  class:sel={editStyle === 'image'}
                  aria-pressed={editStyle === 'image'}
                  onclick={() => (editStyle = 'image')}
                >
                  <span class="style-sample photo" aria-hidden="true">📷</span>
                  Image
                </button>
              </div>
            </fieldset>

            <fieldset class="profile-section">
              <legend>{editStyle === 'image' ? 'Fallback color' : 'Primary color'}</legend>
              <div class="swatches" role="group" aria-label="Player color">
                {#each PLAYER_COLOR_CHOICES as choice (choice.value)}
                  <button
                    type="button"
                    class="dot"
                    class:sel={editColor.toLowerCase() === choice.value}
                    style="--swatch:{resolvePlayerColor(choice.value, $settings.colorBlind)}"
                    onclick={() => (editColor = choice.value)}
                    aria-label={choice.name}
                    aria-pressed={editColor.toLowerCase() === choice.value}
                    title={choice.name}
                  ></button>
                {/each}
                <label class="custom-color">
                  <input
                    type="color"
                    bind:value={editColor}
                    aria-label="Choose any primary color"
                  />
                  <span>Any color</span>
                </label>
              </div>
            </fieldset>

            {#if editStyle === 'gradient'}
              <fieldset class="profile-section">
                <legend>Second color</legend>
                <div class="swatches" role="group" aria-label="Second player color">
                  {#each PLAYER_COLOR_CHOICES as choice (choice.value)}
                    <button
                      type="button"
                      class="dot"
                      class:sel={editColor2.toLowerCase() === choice.value}
                      style="--swatch:{resolvePlayerColor(choice.value, $settings.colorBlind)}"
                      onclick={() => (editColor2 = choice.value)}
                      aria-label={choice.name}
                      aria-pressed={editColor2.toLowerCase() === choice.value}
                      title={choice.name}
                    ></button>
                  {/each}
                  <label class="custom-color">
                    <input
                      type="color"
                      bind:value={editColor2}
                      aria-label="Choose any second color"
                    />
                    <span>Any color</span>
                  </label>
                </div>
              </fieldset>
            {/if}

            {#if editStyle === 'image'}
              <fieldset class="profile-section image-section" aria-busy={imageBusy}>
                <legend>Profile image</legend>
                <p class="section-help">
                  Images are cropped, resized, and saved with your profile for offline play.
                </p>
                <div class="row wrap">
                  <button
                    type="button"
                    class="btn small"
                    disabled={imageBusy}
                    onclick={() => imageFileInput?.click()}
                  >
                    {editImage ? 'Replace upload' : 'Upload image'}
                  </button>
                  {#if editImage}
                    <button
                      type="button"
                      class="btn small ghost"
                      onclick={() => {
                        editImage = undefined;
                        editStyle = 'solid';
                      }}>Remove image</button
                    >
                  {/if}
                </div>
                <input
                  bind:this={imageFileInput}
                  class="file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onchange={chooseImage}
                />
                <div class="url-row">
                  <input
                    type="url"
                    inputmode="url"
                    placeholder="https://example.com/photo.jpg"
                    aria-label="Image URL"
                    bind:value={imageUrl}
                  />
                  <button
                    type="button"
                    class="btn small"
                    disabled={imageBusy || !imageUrl.trim()}
                    onclick={useImageUrl}>{imageBusy ? 'Loading…' : 'Use URL'}</button
                  >
                </div>
                {#if imageError}
                  <p class="image-error" role="alert">{imageError}</p>
                {/if}
              </fieldset>
            {/if}

            <fieldset class="profile-section">
              <legend>Emoji badge <span class="optional">(optional)</span></legend>
              <div class="emoji-row" role="group" aria-label="Emoji badge">
                <button
                  type="button"
                  class="emoji-choice clear"
                  class:sel={!editEmoji}
                  aria-label="No emoji badge"
                  aria-pressed={!editEmoji}
                  onclick={() => (editEmoji = '')}>None</button
                >
                {#each emojiChoices as choice (choice.emoji)}
                  <button
                    type="button"
                    class="emoji-choice"
                    class:sel={firstGrapheme(editEmoji) === choice.emoji}
                    aria-label={`Use ${choice.name} badge`}
                    aria-pressed={firstGrapheme(editEmoji) === choice.emoji}
                    title={choice.name}
                    onclick={() => (editEmoji = choice.emoji)}>{choice.emoji}</button
                  >
                {/each}
                <input
                  class="emoji-input"
                  type="text"
                  maxlength="16"
                  placeholder="Your emoji"
                  aria-label="Custom emoji badge"
                  bind:value={editEmoji}
                  onblur={() => (editEmoji = firstGrapheme(editEmoji))}
                />
              </div>
            </fieldset>

            <div class="row spread editactions">
              <button class="btn small ghost danger" onclick={() => archive(p)}>Archive</button>
              <span class="row" style="gap: 6px">
                <button class="btn small ghost" onclick={cancelEdit}>Cancel</button>
                <button
                  class="btn small"
                  onclick={() => saveEdit(p)}
                  disabled={!editName.trim() || imageBusy}>Save profile</button
                >
              </span>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

{#if archived.length > 0}
  <button
    class="archtoggle"
    onclick={() => (showArchived = !showArchived)}
    aria-expanded={showArchived}>{showArchived ? '▾' : '▸'} Archived ({archived.length})</button
  >
  {#if showArchived}
    <div class="stack">
      {#each archived as p (p.id)}
        <div class="card arch">
          <div class="row spread">
            <span class="row" style="gap: 10px">
              <Avatar
                name={p.name}
                color={p.color}
                playerId={p.id}
                appearance={p.appearance}
                size={28}
              />
              <span class="muted">{p.name}</span>
            </span>
            {#if confirmDeleteId === p.id}
              <span class="row" style="gap: 6px">
                <span class="confirm-q">Delete for good?</span>
                <button class="btn small ghost" onclick={() => (confirmDeleteId = null)}
                  >Cancel</button
                >
                <button class="btn small danger" onclick={() => remove(p)}>Delete</button>
              </span>
            {:else}
              <span class="row" style="gap: 6px">
                <button class="btn small ghost" onclick={() => restorePlayer(p)}>Restore</button>
                <button
                  class="iconbtn"
                  onclick={() => (confirmDeleteId = p.id)}
                  aria-label={`Delete ${p.name} for good`}>🗑</button
                >
              </span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .player-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    align-items: start;
  }
  @media (min-width: 640px) {
    .player-grid {
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    }
  }
  .card {
    transition: border-color 0.15s ease;
  }
  .editpanel {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .profile-section {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .profile-section legend {
    margin-bottom: 8px;
    padding: 0;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--muted);
  }
  .style-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  @media (min-width: 440px) {
    .style-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  .style-choice {
    min-height: 58px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font-weight: 650;
  }
  .style-choice.sel,
  .emoji-choice.sel {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 13%, var(--surface-2));
  }
  .style-sample {
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: 50%;
    background: var(--c);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bg) 55%, transparent);
  }
  .style-sample.gradient {
    background: linear-gradient(135deg, var(--c), var(--c2));
  }
  .style-sample.photo {
    display: grid;
    place-items: center;
    background: var(--surface-3);
    font-size: 1rem;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
    gap: 8px;
  }
  .dot {
    min-width: 46px;
    height: 46px;
    border-radius: 50%;
    border: 3px solid transparent;
    background: var(--swatch);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bg) 55%, transparent);
    cursor: pointer;
    transition: transform var(--dur-fast) var(--ease-out);
  }
  .dot:hover {
    transform: scale(1.12);
  }
  .dot.sel {
    border-color: var(--text);
    box-shadow:
      inset 0 0 0 2px var(--surface),
      0 0 0 1px var(--text);
  }
  .custom-color {
    min-width: 96px;
    min-height: 58px;
    display: grid;
    grid-template-columns: 46px 1fr;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 650;
  }
  .custom-color input {
    width: 46px;
    height: 46px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    cursor: pointer;
  }
  .custom-color input::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  .custom-color input::-webkit-color-swatch {
    border: 1px solid var(--border);
    border-radius: 50%;
  }
  .section-help {
    margin: -2px 0 10px;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .url-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    margin-top: 10px;
  }
  .url-row input[type='url'] {
    width: 100%;
    min-width: 0;
    min-height: 46px;
    padding: 11px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
  }
  .url-row input[type='url']:focus {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .image-error {
    margin: 8px 0 0;
    color: var(--bad);
    font-size: 0.9rem;
  }
  .emoji-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .emoji-choice {
    min-width: 46px;
    min-height: 46px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font-size: 1.25rem;
  }
  .emoji-choice.clear {
    padding-inline: 10px;
    font-size: 0.8rem;
    font-weight: 650;
  }
  .emoji-input {
    width: 116px !important;
    flex: 1 1 116px;
  }
  .optional {
    font-weight: 500;
  }
  .editpanel .btn.small {
    min-height: 46px;
  }
  .card.lead {
    border-color: var(--accent);
  }
  .iconbtn.on {
    border-color: var(--text);
    background: var(--surface-3);
  }
  .who {
    display: inline-flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .who strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .card,
    .dot,
    .style-choice {
      transition: none;
    }
    .dot:hover {
      transform: none;
    }
  }
  .tags {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tag {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 1px 8px;
    border-radius: 999px;
  }
  .lead-tag {
    color: var(--accent-ink);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
  }
  .muted-tag {
    color: var(--muted);
    border: 1px solid var(--border);
  }
  .archtoggle {
    display: block;
    margin-top: 14px;
    padding: 10px 2px;
    background: none;
    border: none;
    color: var(--muted);
    font-weight: 600;
    font-size: 0.92rem;
    cursor: pointer;
  }
  .card.arch {
    opacity: 0.82;
  }
  .firstrun {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .firstrun p {
    margin: 0;
    max-width: 46ch;
  }
  .firstrun-emoji {
    font-size: 2.2rem;
    line-height: 1;
    margin-bottom: 4px;
  }
  .dup-hint {
    margin: 0 2px 14px;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .confirm-q {
    color: var(--muted);
    font-size: 0.85rem;
    align-self: center;
  }
</style>
