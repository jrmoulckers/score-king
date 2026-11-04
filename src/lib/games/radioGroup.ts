import { flushSync } from 'svelte';

/** Match Segmented's keyboard navigation while keeping editor click guards authoritative. */
export function radioGroupKeydown(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const group = event.currentTarget;
  if (!(group instanceof HTMLElement)) return;
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('button[role="radio"]')];
  const index = buttons.findIndex((button) => button === event.target);
  if (index < 0) return;
  let next: number;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = (index + 1) % buttons.length;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      next = (index + buttons.length - 1) % buttons.length;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = buttons.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  flushSync(() => buttons[next].click());
  // A canceled discard confirmation must leave focus on the retained selection.
  const selected = buttons.find((button) => button.getAttribute('aria-checked') === 'true');
  (selected ?? buttons[index]).focus();
}
