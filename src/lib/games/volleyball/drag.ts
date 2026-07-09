/**
 * Pointer-based drag-and-drop for the volleyball roster — works with mouse *and*
 * touch (native HTML5 DnD is unreliable on touch, so we drive it from pointer
 * events). It stays deliberately gesture-friendly:
 *
 *  - A press that never moves past {@link THRESHOLD} is *not* a drag, so the chip's
 *    native click still fires (that's the accessible tap-to-select path).
 *  - A real drag moves a floating ghost, highlights the drop zone under the pointer,
 *    and on release reports `(playerId, target)`. The click that the browser fires
 *    after the pointer sequence is swallowed so a drop never also selects.
 *
 * Drop zones are any element carrying `data-drop="<teamId>"` (or `data-drop="bench"`).
 * Draggable chips carry `data-player-id="<id>"`. The action is placed once on a
 * container; zones are matched globally via `elementFromPoint`, so a chip can be
 * dragged onto a team card, the bench, or a live match side anywhere on screen.
 */

export interface RosterDndParams {
  /** Called on a successful drop. `target` is a team id or the string `"bench"`. */
  onMove: (playerId: string, target: string) => void;
}

const THRESHOLD = 6; // px of travel before a press becomes a drag

export function rosterDnd(node: HTMLElement, params: RosterDndParams) {
  let current = params;

  let pointerId: number | null = null;
  let sourceId: string | null = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let ghost: HTMLDivElement | null = null;
  let hotZone: Element | null = null;
  let suppressClick = false;

  const reduceMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const chip = (e.target as Element | null)?.closest('[data-player-id]') as HTMLElement | null;
    if (!chip || !node.contains(chip)) return;
    const id = chip.dataset.playerId;
    if (!id) return;

    sourceId = id;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function beginDrag(label: string, color: string) {
    dragging = true;
    ghost = document.createElement('div');
    ghost.className = 'vb-drag-ghost';
    ghost.textContent = label;
    ghost.style.setProperty('--ghost-color', color || '#7c5cff');
    if (reduceMotion()) ghost.style.transition = 'none';
    document.body.appendChild(ghost);
    document.body.classList.add('vb-dragging');
  }

  function moveGhost(x: number, y: number) {
    if (ghost) ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -150%)`;
  }

  function setHot(zone: Element | null) {
    if (zone === hotZone) return;
    hotZone?.classList.remove('drop-hot');
    hotZone = zone;
    hotZone?.classList.add('drop-hot');
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerId !== pointerId || !sourceId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!dragging) {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      const chip = node.querySelector<HTMLElement>(`[data-player-id="${cssEscape(sourceId)}"]`);
      const label = chip?.dataset.playerName || chip?.textContent?.trim() || 'Player';
      const color = chip?.dataset.playerColor || '';
      beginDrag(label, color);
    }

    e.preventDefault(); // stop touch scroll once we're really dragging
    moveGhost(e.clientX, e.clientY);
    const under = document.elementFromPoint(e.clientX, e.clientY);
    setHot(under?.closest('[data-drop]') ?? null);
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);

    const wasDragging = dragging;
    const src = sourceId;
    const target = hotZone?.getAttribute('data-drop') ?? null;
    cleanup();

    if (wasDragging) {
      // Whether or not it landed on a zone, this pointer sequence was a drag, so
      // don't let the trailing click select the chip.
      suppressClick = true;
      requestAnimationFrame(() => (suppressClick = false));
      if (src && target) current.onMove(src, target);
    }
  }

  function cleanup() {
    ghost?.remove();
    ghost = null;
    setHot(null);
    document.body.classList.remove('vb-dragging');
    dragging = false;
    sourceId = null;
    pointerId = null;
  }

  function onClickCapture(e: MouseEvent) {
    if (suppressClick) {
      e.stopPropagation();
      e.preventDefault();
      suppressClick = false;
    }
  }

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('click', onClickCapture, true);

  return {
    update(next: RosterDndParams) {
      current = next;
    },
    destroy() {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      cleanup();
    },
  };
}

/** Minimal CSS.escape fallback for attribute selectors (ids are uuids, but be safe). */
function cssEscape(value: string): string {
  const g = globalThis as unknown as { CSS?: { escape?: (v: string) => string } };
  if (g.CSS?.escape) return g.CSS.escape(value);
  return value.replace(/["\\\]]/g, '\\$&');
}
