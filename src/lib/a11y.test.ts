import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { parseRoute, titleForRoute } from './router';
import { announce, announcement } from './stores/announcer';

describe('titleForRoute', () => {
  it('uses the bare app name on Home', () => {
    expect(titleForRoute(parseRoute('/'))).toBe('Score King');
  });

  it('prefixes the page label for interior routes', () => {
    expect(titleForRoute(parseRoute('/players'))).toBe('Players · Score King');
    expect(titleForRoute(parseRoute('/accessibility'))).toBe('Accessibility & display · Score King');
  });

  it('labels dynamic game and play routes generically', () => {
    expect(titleForRoute(parseRoute('/skullking'))).toBe('Start a game · Score King');
    expect(titleForRoute(parseRoute('/play/abc'))).toBe('Now playing · Score King');
  });

  it('labels the not-found route', () => {
    expect(titleForRoute(parseRoute('/foo/bar'))).toBe('Not found · Score King');
  });
});

describe('announce', () => {
  it('publishes a trimmed message and bumps the sequence', () => {
    const before = get(announcement).seq;
    announce('  Round 1 saved.  ');
    const after = get(announcement);
    expect(after.message).toBe('Round 1 saved.');
    expect(after.seq).toBe(before + 1);
  });

  it('re-announces identical text with a fresh sequence', () => {
    announce('Ada leads with 42.');
    const first = get(announcement);
    announce('Ada leads with 42.');
    const second = get(announcement);
    expect(second.message).toBe(first.message);
    expect(second.seq).toBe(first.seq + 1);
  });

  it('ignores empty or whitespace-only messages', () => {
    const before = get(announcement).seq;
    announce('   ');
    announce('');
    expect(get(announcement).seq).toBe(before);
  });
});
