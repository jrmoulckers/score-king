import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Players from '../../pages/Players.svelte';
import { players } from '../stores/players';
import type { Player } from '../types';
import Avatar from './Avatar.svelte';
import avatarSource from './Avatar.svelte?raw';
import PlayerSelect from './PlayerSelect.svelte';

const mounted: ReturnType<typeof mount>[] = [];

function renderAvatar(props: ComponentProps<typeof Avatar>) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(Avatar, { target, props }));
  return target;
}

afterEach(() => {
  for (const component of mounted.splice(0)) unmount(component);
  players.set([]);
  document.body.replaceChildren();
});

describe('Avatar', () => {
  it.each([16, 52])('keeps the gradient visible behind initials at %dpx', (size) => {
    const target = renderAvatar({
      name: 'Ada Lovelace',
      color: '#7c5cff',
      appearance: { style: 'gradient', color2: '#34d399' },
      size,
    });
    const avatar = target.querySelector<HTMLElement>('.avatar');
    const initials = target.querySelector<HTMLElement>('.initials');

    expect(avatar?.classList.contains('gradient')).toBe(true);
    expect(avatar?.getAttribute('style')).toContain(`width: ${size}px`);
    expect(initials?.textContent).toBe('AL');
  });

  it('preserves solid, image, emoji, and accessible-name behavior', () => {
    const solid = renderAvatar({ name: 'Grace Hopper', color: '#7c5cff' });
    const image = renderAvatar({
      name: 'Katherine Johnson',
      color: '#34d399',
      appearance: {
        style: 'image',
        image: 'data:image/png;base64,iVBORw0KGgo=',
        emoji: '🚀',
      },
    });

    expect(solid.querySelector('.avatar')?.classList.contains('gradient')).toBe(false);
    expect(solid.querySelector('.initials')?.textContent).toBe('GH');
    expect(image.querySelector('.avatar')?.getAttribute('role')).toBe('img');
    expect(image.querySelector('.avatar')?.getAttribute('aria-label')).toBe('Katherine Johnson');
    expect(image.querySelector('img')).not.toBeNull();
    expect(image.querySelector('.emoji-badge')?.textContent).toBe('🚀');
  });

  it('uses an adaptive text treatment instead of an opaque initials disc', () => {
    const initialsRule = avatarSource.match(/\.initials\s*\{([^}]*)\}/)?.[1];
    const gradientInitialsRule = avatarSource.match(
      /\.avatar\.gradient \.initials\s*\{([^}]*)\}/,
    )?.[1];
    const initialsProperties = initialsRule
      ?.split(';')
      .map((declaration) => declaration.trim().split(':')[0]);

    expect(initialsProperties).not.toEqual(
      expect.arrayContaining(['background', 'width', 'height', 'border-radius', 'box-shadow']),
    );
    expect(gradientInitialsRule).toMatch(/-webkit-text-stroke/);
    expect(gradientInitialsRule).toMatch(/text-shadow/);
  });

  it('renders the full gradient at game-setup and Players profile sizes', () => {
    const player: Player = {
      id: 'ada',
      name: 'Ada Lovelace',
      color: '#7c5cff',
      appearance: { style: 'gradient', color2: '#34d399' },
      createdAt: 1,
    };
    players.set([player]);

    const setupTarget = document.createElement('div');
    document.body.appendChild(setupTarget);
    mounted.push(mount(PlayerSelect, { target: setupTarget, props: { selected: [] } }));

    const playersTarget = document.createElement('div');
    document.body.appendChild(playersTarget);
    mounted.push(mount(Players, { target: playersTarget }));

    const setupAvatar = setupTarget.querySelector<HTMLElement>('.avatar.gradient');
    const playerAvatar = playersTarget.querySelector<HTMLElement>('.avatar.gradient');
    expect(setupAvatar?.getAttribute('style')).toContain('width: 22px');
    expect(playerAvatar?.getAttribute('style')).toContain('width: 34px');

    playersTarget.querySelector<HTMLButtonElement>('[aria-label="Edit player"]')?.click();
    flushSync();

    expect(
      playersTarget.querySelector<HTMLElement>('.avatar.gradient')?.getAttribute('style'),
    ).toContain('width: 52px');
  });
});
