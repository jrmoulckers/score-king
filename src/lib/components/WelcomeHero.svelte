<script lang="ts">
  import { dismissWelcome } from '../stores/onboarding';
  import InstallPrompt from './InstallPrompt.svelte';
</script>

<section class="card hero" aria-labelledby="welcome-heading">
  <button class="dismiss iconbtn" onclick={dismissWelcome} aria-label="Dismiss welcome" title="Dismiss">✕</button>

  <div class="crown" aria-hidden="true">👑</div>
  <h1 id="welcome-heading" class="hero-title">Welcome to Score King</h1>
  <p class="lede">
    Keep score for cards &amp; party games — pick a game below, add your players, and start
    tapping in rounds.
  </p>

  <ul class="assurances" aria-label="What to expect">
    <li><span aria-hidden="true">🔒</span> Saved on this device</li>
    <li><span aria-hidden="true">📴</span> Works fully offline</li>
    <li><span aria-hidden="true">🙌</span> No account needed</li>
  </ul>

  <div class="hero-actions">
    <InstallPrompt />
  </div>
</section>

<style>
  .hero {
    position: relative;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 24px 18px 20px;
    margin-top: 4px;
  }
  .dismiss {
    position: absolute;
    top: 8px;
    right: 8px;
  }
  .crown {
    font-size: 2.6rem;
    line-height: 1;
  }
  .hero-title {
    margin: 0;
  }
  .lede {
    margin: 0;
    color: var(--muted);
    max-width: 42ch;
  }
  .assurances {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin: 6px 0 2px;
    padding: 0;
  }
  .assurances li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.82rem;
    font-weight: 600;
  }
  .hero-actions {
    width: 100%;
    max-width: 320px;
    margin-top: 6px;
  }
</style>
