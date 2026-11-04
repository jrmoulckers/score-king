import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundContext } from '../types';
import Harness from './IdentityEditorHarness.svelte';
import ScrabbleEditor from './scrabble/ScrabbleEditor.svelte';
import UpwordsEditor from './upwords/UpwordsEditor.svelte';
import {
  emptyTurnInput,
  emptyFinalInput,
  scoreRound,
  type ScrabbleInput,
} from './scrabble/logic';
import { createTurnInput, createEndgameInput, scoreUpwords } from './upwords/logic';

vi.mock('../motion', () => ({ animateMotion: vi.fn(), bumpOnChange: vi.fn() }));
vi.mock('../haptics', () => ({ haptic: vi.fn() }));

const ids = ['a', 'b'];
const ctx: RoundContext = {
  game: {
    id: 'word-draft',
    type: 'scrabble',
    playerIds: ids,
    config: {},
    status: 'active',
    roundCount: 0,
    createdAt: 1,
  },
  players: ids.map((id) => ({ id, name: id, color: '#7c5cff', createdAt: 1 })),
  config: {},
  roundIndex: 0,
  totals: {},
  rounds: [],
};
const components: ReturnType<typeof mount>[] = [];

function render<T>(Editor: typeof ScrabbleEditor | typeof UpwordsEditor, initial: T) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  components.push(mount(Harness, { target, props: { Editor, initial, ctx } }));
  flushSync();
  return {
    click(selector: string) {
      target.querySelector<HTMLButtonElement>(selector)!.click();
      flushSync();
    },
    draft: () => JSON.parse(target.querySelector('[data-draft]')!.textContent!) as T,
  };
}

afterEach(async () => {
  for (const component of components.splice(0)) await unmount(component);
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('word-game round type changes', () => {
  it('preserves a populated Scrabble turn on repeated cancellation, then discards only deliberately', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const initial: ScrabbleInput = { kind: 'turn', playerId: 'b', points: 20, bingo: true };
    const editor = render(ScrabbleEditor, initial);
    editor.click('.mode-btn:first-child');
    expect(confirm).not.toHaveBeenCalled();
    for (let i = 0; i < 2; i++) {
      editor.click('.mode-btn:nth-child(2)');
      expect(editor.draft()).toEqual(initial);
      expect(scoreRound(editor.draft(), ids)).toEqual({ a: 0, b: 70 });
    }
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockReturnValue(true);
    editor.click('.mode-btn:nth-child(2)');
    expect(editor.draft()).toEqual(emptyFinalInput(ids));
    editor.click('.mode-btn:first-child');
    expect(editor.draft()).toEqual(emptyTurnInput(ids, 0));
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(initial).toEqual({ kind: 'turn', playerId: 'b', points: 20, bingo: true });
  });

  it('protects Scrabble final input and preserves native final scoring', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const initial = { ...emptyFinalInput(ids), finisherId: 'a', remaining: { a: 0, b: 9 } };
    const editor = render(ScrabbleEditor, initial);
    editor.click('.mode-btn:first-child');
    expect(editor.draft()).toEqual(initial);
    expect(scoreRound(editor.draft(), ids)).toEqual({ a: 9, b: -9 });
    confirm.mockReturnValue(true);
    editor.click('.mode-btn:first-child');
    expect(editor.draft()).toEqual(emptyTurnInput(ids, 0));
  });

  it('allows pristine Scrabble switching but protects a player-only correction', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const editor = render(ScrabbleEditor, emptyTurnInput(ids, 0));
    editor.click('.mode-btn:nth-child(2)');
    editor.click('.mode-btn:first-child');
    expect(confirm).not.toHaveBeenCalled();
    editor.click('.players .player:nth-child(2)');
    editor.click('.mode-btn:nth-child(2)');
    expect(editor.draft()).toEqual({ ...emptyTurnInput(ids, 0), playerId: 'b' });
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('protects all Upwords turn fields through repeated cancellation and intentional replacement', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const initial = {
      ...createTurnInput(ids, 'b'),
      words: [
        { letters: 4, flat: true, stackHeight: 4 },
        { letters: 3, flat: false, stackHeight: 7 },
      ],
      bingo: true,
      quBonus: true,
    };
    const editor = render(UpwordsEditor, initial);
    editor.click('.modebtn:first-child');
    expect(confirm).not.toHaveBeenCalled();
    for (let i = 0; i < 2; i++) {
      editor.click('.modebtn:nth-child(2)');
      expect(editor.draft()).toEqual(initial);
      expect(scoreUpwords(editor.draft(), ids)).toEqual({ a: 0, b: 35 });
    }
    confirm.mockReturnValue(true);
    editor.click('.modebtn:nth-child(2)');
    expect(editor.draft()).toEqual(createEndgameInput(ids));
    editor.click('.modebtn:first-child');
    expect(editor.draft()).toEqual(createTurnInput(ids, 'a'));
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(initial.words).toHaveLength(2);
  });

  it('protects Upwords endgame counts without mixing turn fields into penalties', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const initial = { ...createEndgameInput(ids), unplayedTiles: { a: 2, b: 5 } };
    const editor = render(UpwordsEditor, initial);
    editor.click('.modebtn:first-child');
    expect(editor.draft()).toEqual(initial);
    expect(scoreUpwords(editor.draft(), ids)).toEqual({ a: -10, b: -25 });
    confirm.mockReturnValue(true);
    editor.click('.modebtn:first-child');
    expect(editor.draft()).toEqual(createTurnInput(ids, 'a'));
  });

  it.each(['activePlayerId', 'quBonus', 'bingo', 'letters', 'flat', 'stackHeight'] as const)(
    'protects an Upwords %s-only correction, including non-scoring fields',
    (field) => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const initial = createTurnInput(ids, 'a');
      if (field === 'activePlayerId') initial.activePlayerId = 'b';
      else if (field === 'quBonus' || field === 'bingo') initial[field] = true;
      else if (field === 'flat') initial.words[0].flat = false;
      else initial.words[0][field] = 4;
      const editor = render(UpwordsEditor, initial);
      editor.click('.modebtn:nth-child(2)');
      expect(editor.draft()).toEqual(initial);
      expect(confirm).toHaveBeenCalledTimes(1);
    },
  );

  it('does not prompt for pristine Upwords switches or leak a prior editor draft', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const populated = render(UpwordsEditor, { ...createTurnInput(ids, 'a'), bingo: true });
    populated.click('.modebtn:nth-child(2)');
    const fresh = render(UpwordsEditor, createTurnInput(ids, 'a'));
    fresh.click('.modebtn:nth-child(2)');
    expect(fresh.draft()).toEqual(createEndgameInput(ids));
    fresh.click('.modebtn:first-child');
    expect(fresh.draft()).toEqual(createTurnInput(ids, 'a'));
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
