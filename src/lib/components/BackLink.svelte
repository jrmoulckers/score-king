<script lang="ts">
  import { link } from '../router';

  // A quiet breadcrumb-style "back" affordance for drill-in pages. Sits above the
  // page title and points at the section hub (e.g. Games or Settings). Muted, never
  // violet — Royal Violet stays reserved for the single primary action per screen.
  let { href, label }: { href: string; label: string } = $props();
</script>

<a class="backlink" {href} use:link aria-label={`Back to ${label}`}>
  <span class="arw" aria-hidden="true">←</span>
  <span>{label}</span>
</a>

<style>
  .backlink {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 4px 10px 4px 6px;
    margin: 0 0 4px -6px;
    border-radius: var(--radius-sm);
    color: var(--muted);
    font-weight: 600;
    font-size: 0.9rem;
    text-decoration: none;
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }
  .backlink:hover {
    color: var(--text);
    background: var(--surface-2);
  }
  .arw {
    font-size: 1rem;
    line-height: 1;
    transition: transform 0.15s ease;
  }
  .backlink:hover .arw {
    transform: translateX(-2px);
  }
  @media (prefers-reduced-motion: reduce) {
    .backlink,
    .arw {
      transition: none;
    }
    .backlink:hover .arw {
      transform: none;
    }
  }
</style>
