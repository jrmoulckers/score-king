import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pathStore } from '../router';
import BackLink from './BackLink.svelte';
import source from './BackLink.svelte?raw';

const mounted: ReturnType<typeof mount>[] = [];

afterEach(() => {
  for (const component of mounted.splice(0)) unmount(component);
  document.head.querySelector('#backlink-target-styles')?.remove();
  document.body.replaceChildren();
  window.history.replaceState({}, '', '/');
  pathStore.set('/');
  vi.restoreAllMocks();
});

describe('BackLink', () => {
  it('keeps the product target minimum without enlarging its breadcrumb styling', () => {
    const rule = source.match(/\.backlink\s*\{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    const style = document.createElement('style');
    style.id = 'backlink-target-styles';
    style.textContent = rule ?? '';
    document.head.appendChild(style);
    const link = document.createElement('a');
    link.className = 'backlink';
    document.body.appendChild(link);

    const computed = getComputedStyle(link);
    expect(computed.minHeight).toBe('46px');
    expect(computed.padding).toBe('4px 10px 4px 6px');
    expect(computed.fontSize).toBe('0.9rem');
    expect(rule).toMatch(/color:\s*var\(--muted\)/);
    expect(rule).not.toMatch(/(?:^|;)\s*(?:height|max-height)\s*:/);
  });

  it.each([
    ['/', 'Games'],
    ['/stats', 'Stats'],
    ['/settings', 'Settings'],
  ])('preserves the accessible breadcrumb and router action for %s', (href, label) => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const target = document.createElement('div');
    document.body.appendChild(target);
    mounted.push(mount(BackLink, { target, props: { href, label } }));
    flushSync();
    const link = target.querySelector<HTMLAnchorElement>('a');
    expect(link?.getAttribute('href')).toBe(href);
    expect(link?.getAttribute('aria-label')).toBe(`Back to ${label}`);
    expect(link?.querySelector('.arw')?.getAttribute('aria-hidden')).toBe('true');
    expect(link?.querySelector('span:last-child')?.textContent).toBe(label);

    link?.focus();
    expect(document.activeElement).toBe(link);
    link?.click();
    expect(get(pathStore)).toBe(href);
    expect(window.location.pathname).toBe(href);
  });

  it('preserves modified-click native navigation', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mounted.push(mount(BackLink, { target, props: { href: '/stats', label: 'Stats' } }));
    flushSync();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });

    target.querySelector('a')?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(get(pathStore)).toBe('/');
  });
});
