<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';
  import { focusTrap } from '../a11y/focusTrap';
  import { documentScrollLock } from '../a11y/documentScrollLock';

  const {
    title,
    emoji,
    topics,
    topic,
    ontopicchange,
    children,
    onclose,
  }: {
    title: string;
    emoji: string;
    topics: readonly { id: string; label: string }[];
    topic: string;
    ontopicchange: (id: string) => void;
    children: Snippet<[(id: string) => Promise<void>]>;
    onclose: () => void;
  } = $props();

  const id = $props.id();
  let dialog: HTMLDialogElement;
  let heading: HTMLHeadingElement;
  let content: HTMLElement;

  onMount(() => {
    dialog.showModal();
    heading.focus();
  });

  async function selectTopic(id: string) {
    ontopicchange(id);
    await tick();
    if (content.isConnected) {
      content.scrollTop = 0;
      content.focus({ preventScroll: true });
      content.scrollIntoView({ block: 'nearest' });
    }
  }

  function closeFromBackdrop(event: MouseEvent) {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      dialog.close();
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby={`${id}-title`}
  {onclose}
  onclick={closeFromBackdrop}
  use:focusTrap
  use:documentScrollLock
>
  <header>
    <div class="identity">
      <span class="game-mark" aria-hidden="true">{emoji}</span>
      <div>
        <h2 id={`${id}-title`} tabindex="-1" bind:this={heading}>{title}</h2>
        <p>Rules &amp; scoring</p>
      </div>
    </div>
    <button
      type="button"
      class="btn ghost close"
      aria-label="Close game help"
      onclick={() => dialog.close()}>✕</button
    >
  </header>
  <div class="scroll">
    <nav aria-label="Help topics">
      {#each topics as item (item.id)}
        <button
          type="button"
          aria-current={topic === item.id ? 'page' : undefined}
          onclick={() => selectTopic(item.id)}>{item.label}</button
        >
      {/each}
    </nav>
    <section class="content" aria-label="Help content" tabindex="-1" bind:this={content}>
      {@render children(selectTopic)}
    </section>
  </div>
  <footer>
    <span>Examples do not change your game.</span>
    <button type="button" class="btn primary" onclick={() => dialog.close()}>Done</button>
  </footer>
</dialog>

<style>
  dialog {
    padding: 0;
    width: min(920px, calc(100vw - 48px));
    max-width: none;
    max-height: 92dvh;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  dialog[open] {
    display: flex;
    flex-direction: column;
  }
  dialog::backdrop {
    background: color-mix(in srgb, var(--bg) 82%, transparent);
  }
  header,
  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
  }
  header {
    padding: 22px 28px 16px;
  }
  .identity {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .game-mark {
    font-size: 1.6rem;
  }
  h2 {
    font-size: 1.25rem;
    margin: 0;
  }
  p {
    color: var(--muted);
    font-size: 0.9rem;
    margin: 0;
  }
  .close {
    min-width: 46px;
    min-height: 46px;
    border-color: transparent;
    padding: 10px 12px;
  }
  h2:focus,
  .content:focus {
    outline: none;
  }
  .scroll {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  nav {
    display: flex;
    gap: 24px;
    padding: 0 28px;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
  }
  nav button {
    position: relative;
    flex-shrink: 0;
    min-height: 50px;
    padding: 8px 0 12px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 0.9rem;
    cursor: pointer;
    white-space: nowrap;
  }
  nav button:last-child {
    margin-left: auto;
  }
  nav button:hover {
    color: var(--text);
  }
  nav button[aria-current] {
    color: var(--text);
    font-weight: 700;
  }
  nav button[aria-current]::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--primary);
    border-radius: var(--radius-sm);
  }
  nav button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }
  .content {
    padding: 28px;
  }
  footer {
    padding: 14px 28px;
    border-top: 1px solid var(--border);
  }
  footer span {
    color: var(--muted);
    font-size: 0.8rem;
  }
  footer .btn {
    min-width: 84px;
    min-height: 46px;
    font-size: 0.9rem;
  }
  @media (max-width: 760px) {
    dialog {
      width: min(600px, calc(100vw - 24px));
      max-height: 96dvh;
    }
    header {
      padding: 16px 20px 10px;
    }
    nav {
      padding: 0 20px;
      gap: 20px;
    }
    .content {
      padding: 22px 20px;
    }
    footer {
      padding: 12px 20px;
    }
  }
  @media (max-width: 440px) {
    dialog {
      width: 100%;
      margin: auto 0 0;
      border-radius: var(--radius) var(--radius) 0 0;
      border-bottom: 0;
    }
    header {
      padding: 14px 16px 8px;
    }
    .identity {
      gap: 8px;
    }
    h2 {
      font-size: 1rem;
    }
    p {
      font-size: 0.8rem;
    }
    nav {
      padding: 0 16px;
      gap: 18px;
    }
    nav button {
      font-size: 0.8rem;
    }
    nav button:last-child {
      margin-left: 0;
    }
    .content {
      padding: 18px 16px;
    }
    footer {
      padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
    }
  }
  @media (max-width: 360px) {
    .content {
      padding: 16px 12px;
    }
  }
  @media (forced-colors: active) {
    nav button[aria-current] {
      text-decoration: underline;
    }
  }
</style>
