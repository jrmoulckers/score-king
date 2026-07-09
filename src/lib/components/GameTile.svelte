<script lang="ts">
  import { link } from '../router';
  import { toggleFavorite, type CatalogType } from '../stores/catalog';

  /**
   * A single game-catalog tile — the shared, one-and-only tile used by every catalog
   * surface (Home + Browse) so the tile stays identical game-to-game (DESIGN.md: "consistency
   * is the feature"). Optionally shows a quiet quick-favorite star so a group can pin the games
   * they play without detouring to Manage games.
   *
   * The star is a sibling of the link (never a button nested in an anchor) and sits above it,
   * so tapping it pins/unpins without navigating. State is carried by ★/☆ + `aria-pressed` +
   * label — never colour alone — and the star is never Crown Gold (reserved for the leader/winner)
   * nor a second Royal Violet fill.
   */
  let {
    type,
    favorite = false,
    showFavorite = true,
  }: {
    type: CatalogType;
    favorite?: boolean;
    showFavorite?: boolean;
  } = $props();
</script>

<div class="tile-wrap">
  <a class="gametile" class:with-star={showFavorite} href={`/${type.id}`} use:link>
    <span class="emoji">{type.emoji}</span>
    <span class="name">{type.name}</span>
    <span class="tag">{type.tagline}</span>
  </a>
  {#if showFavorite}
    <button
      class="tile-star"
      class:on={favorite}
      type="button"
      aria-pressed={favorite}
      title={favorite ? `Unfavorite ${type.name}` : `Favorite ${type.name}`}
      onclick={() => toggleFavorite(type.id)}
    >
      <span aria-hidden="true">{favorite ? '★' : '☆'}</span>
      <span class="sr-only">{favorite ? `Unfavorite ${type.name}` : `Favorite ${type.name}`}</span>
    </button>
  {/if}
</div>

<style>
  .tile-wrap {
    position: relative;
    display: flex;
  }
  /* Fill the grid cell so tiles in a row keep equal height once wrapped. */
  .gametile {
    flex: 1 1 auto;
  }
  /* Keep the name/tagline clear of the corner star. */
  .gametile.with-star {
    padding-right: 46px;
  }
  /* A neutral star: outline ☆ vs filled ★ + aria-pressed carry the state — never gold
     (reserved for the leader/winner) and never a second violet fill. Idle stays quiet so a
     grid of tiles doesn't turn noisy; it lifts to full strength on hover/focus/favorite. */
  .tile-star {
    position: absolute;
    top: 4px;
    right: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border: none;
    background: transparent;
    color: var(--muted);
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0.4;
    border-radius: var(--radius-sm);
    transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease;
  }
  .tile-star:hover {
    opacity: 1;
    background: var(--surface-2);
    color: var(--text);
  }
  .tile-star.on {
    opacity: 1;
    color: var(--text);
  }
  .tile-star:focus-visible {
    opacity: 1;
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    .tile-star {
      transition: none;
    }
  }
</style>
