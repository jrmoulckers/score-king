<script lang="ts">
  import { link } from '../router';
  import { CREATE_ROUTE } from '../stores/catalog';

  /**
   * The single "＋ Create a game" catalog affordance — a dashed tile with a violet ＋ (never a
   * solid fill, so it stays the one quiet add-accent, not a second primary action). Shared by
   * Home and Browse so the entry point reads identically everywhere.
   */
</script>

<a class="gametile createtile" href={CREATE_ROUTE} use:link>
  <span class="emoji" aria-hidden="true">＋</span>
  <span class="name">Create a game</span>
  <span class="tag">Build your own scorer</span>
</a>

<style>
  .createtile {
    border-style: dashed;
  }
  .createtile .emoji {
    color: var(--primary);
    font-weight: 700;
  }
</style>
