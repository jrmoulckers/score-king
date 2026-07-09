/**
 * A focus trap for modal dialogs (`role="dialog" aria-modal="true"`). Keyboard
 * and screen-reader users must not be able to Tab out of an open modal into the
 * page behind it (WCAG 2.4.3 Focus Order / 2.1.2 No Keyboard Trap — the escape
 * here is the Escape key, wired up by the dialog itself). The action keeps Tab /
 * Shift+Tab cycling inside the node and restores focus to whatever opened the
 * dialog when it closes.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Visible, tabbable descendants of `container`, in DOM order. */
export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && (el.offsetParent !== null || el === document.activeElement),
  );
}

/**
 * Given the tabbable elements, the currently focused element, and whether Shift
 * is held, return the element that should receive focus when a Tab press would
 * otherwise leave the trap — or `null` to let the browser handle a normal move.
 * Pure (no DOM), so the wrap-around logic is unit-testable in isolation.
 */
export function nextTrapTarget(
  focusables: HTMLElement[],
  active: HTMLElement | null,
  shift: boolean,
): HTMLElement | null {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const idx = active ? focusables.indexOf(active) : -1;
  // Focus somewhere outside the trap (e.g. the dialog container itself): pull it
  // back to the near edge in the direction of travel.
  if (idx === -1) return shift ? last : first;
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
}

/** Svelte action: trap Tab focus within `node` and restore focus on teardown. */
export function focusTrap(node: HTMLElement) {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const focusables = getFocusable(node);
    const target = nextTrapTarget(
      focusables,
      document.activeElement as HTMLElement | null,
      e.shiftKey,
    );
    if (target) {
      e.preventDefault();
      target.focus();
    }
  }

  node.addEventListener('keydown', onKeydown);

  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown);
      // Return focus to whatever opened the dialog so keyboard users aren't
      // dumped at the top of the document.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    },
  };
}
