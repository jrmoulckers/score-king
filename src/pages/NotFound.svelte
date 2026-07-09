<script lang="ts">
  import { link } from '../lib/router';
</script>

<div class="empty notfound">
  <div class="nf-emoji" aria-hidden="true">🃏</div>
  <h2>This card isn't in the deck</h2>
  <p class="muted">That page doesn't exist — it may have been a mistyped link or an old bookmark.</p>
  <a class="btn primary" href="/" use:link>Back to games</a>
  <nav class="nf-links" aria-label="Other places">
    <a class="btn small ghost" href="/players" use:link>Players</a>
    <a class="btn small ghost" href="/history" use:link>History</a>
    <a class="btn small ghost" href="/stats" use:link>Stats</a>
  </nav>
</div>

<style>
  .notfound {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .nf-emoji {
    font-size: 2.6rem;
    line-height: 1;
  }
  .notfound p {
    margin: 0;
    max-width: 44ch;
  }
  .nf-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin-top: 6px;
  }
  .nf-links .btn {
    text-decoration: none;
  }
</style>

