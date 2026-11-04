import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Scoreboard from './Scoreboard.svelte';

vi.mock('../motion', () => ({ bumpOnChange: vi.fn(), popIn: vi.fn() }));

let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (component) await unmount(component);
  document.body.replaceChildren();
});

describe('shared standings identities', () => {
  it.each([
    'Sam',
    'A'.repeat(40),
    'Alexandria Catherine Montgomery-Williams',
    'Long spaced name '.repeat(2).padEnd(40, 'x'),
  ])('preserves the complete identity, rank, score and cues for %s', (name) => {
    component = mount(Scoreboard, {
      target: document.body,
      props: {
        players: [
          { id: 'a', name, color: '#7c5cff', createdAt: 0 },
          { id: 'b', name: 'Jo', color: '#7c5cff', createdAt: 0 },
        ],
        totals: { a: 100, b: 90 },
        winners: ['a'],
        youId: 'a',
      },
    });
    flushSync();
    const rows = document.querySelectorAll('tbody tr');
    expect(rows[0].querySelector('.name')?.textContent).toBe(name);
    expect(rows[0].querySelector('td')?.textContent).toBe('1');
    expect(rows[0].querySelector('.total')?.textContent).toBe('100');
    expect(rows[0].querySelector('.you')?.textContent).toBe('You');
    expect(rows[0].textContent).toContain('Winner');
    expect(rows[0].classList.contains('winner')).toBe(true);
    expect(rows[1].querySelector('.total')?.textContent).toBe('90');
    expect(rows[1].querySelector('.gap')?.textContent).toBe('10 back');
    expect(document.querySelector('caption')?.textContent).toBe('Standings by rank');
  });

  it('keeps tied ranks and winners without inventing a leader', () => {
    component = mount(Scoreboard, {
      target: document.body,
      props: {
        players: ['a', 'b'].map((id) => ({
          id,
          name: id.repeat(40),
          color: '#7c5cff',
          createdAt: 0,
        })),
        totals: { a: 90, b: 90 },
        lowerIsBetter: true,
        winners: ['a', 'b'],
      },
    });
    flushSync();
    const ranks = [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')].map(
      (row) => row.cells[0].textContent,
    );
    expect(ranks).toEqual(['1', '1']);
    expect(document.querySelectorAll('tr.winner')).toHaveLength(2);
    expect(document.querySelectorAll('.gap')).toHaveLength(0);
    expect(document.body.textContent).not.toContain('Leading');
  });
});
