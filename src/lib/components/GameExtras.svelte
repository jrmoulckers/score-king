<script lang="ts">
  import type { Snippet } from 'svelte';

  const {
    children,
    metadata = 'optional',
    initialOpen = false,
  }: { children: Snippet; metadata?: string; initialOpen?: boolean } = $props();

  // Recorded extras open on mount; later edits must not override a user's collapse.
  // svelte-ignore state_referenced_locally
  let open = $state(initialOpen);
</script>

<details class="game-extras" bind:open>
  <summary>
    <svg
      class="chev"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m6 4 4 4-4 4" />
    </svg>
    <span>Extras</span>
    <span class="metadata">{metadata}</span>
  </summary>
  <div class="extras-body">
    {@render children()}
  </div>
</details>

<style>
  .game-extras {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
  }
  summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 0 12px;
    cursor: pointer;
    list-style: none;
    font-weight: 700;
    color: var(--text);
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .chev {
    display: block;
    flex: none;
    color: var(--muted);
    transition: transform var(--dur-base, 0.2s) var(--ease-standard, ease);
  }
  .game-extras[open] > summary {
    border-bottom: 1px solid var(--border);
  }
  .game-extras[open] > summary .chev {
    transform: rotate(90deg);
  }
  .metadata {
    margin-left: auto;
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .extras-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px 12px;
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
</style>
