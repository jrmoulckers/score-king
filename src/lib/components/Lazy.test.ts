import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import { fromStore, writable } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BackLink from './BackLink.svelte';
import Lazy from './Lazy.svelte';

type Loader = ComponentProps<typeof Lazy>['loader'];
type PageModule = Awaited<ReturnType<Loader>>;

const mounted: ReturnType<typeof mount>[] = [];

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function deferred() {
  let resolve!: (value: PageModule) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<PageModule>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function render(loader: Loader) {
  const inputs = writable({ loader, props: { href: '/nights', label: 'Game nights' } });
  const reactive = fromStore(inputs);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const component = mount(Lazy, {
    target,
    props: {
      get loader() {
        return reactive.current.loader;
      },
      get props() {
        return reactive.current.props;
      },
    },
  });
  mounted.push(component);
  flushSync();
  return { target, inputs, component };
}

async function settled() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
}

describe('lazy route recovery', () => {
  it('renders pending and loaded states, forwarding reactive props without reloading', async () => {
    const request = deferred();
    const loader = vi.fn(() => request.promise);
    const { target, inputs } = render(loader);
    expect(target.querySelector('[role="status"]')?.textContent).toContain('Loading this page');
    await settled();
    expect(loader).toHaveBeenCalledTimes(1);

    request.resolve({ default: BackLink });
    await settled();
    expect(target.querySelector('[role="status"]')).toBeNull();
    expect(target.querySelector('[role="alert"]')).toBeNull();
    expect(target.querySelector('a')?.getAttribute('href')).toBe('/nights');

    inputs.update((value) => ({
      ...value,
      props: { href: '/nights/2026-11-03', label: 'This game night' },
    }));
    flushSync();
    expect(target.querySelector('a')?.getAttribute('href')).toBe('/nights/2026-11-03');
    expect(target.querySelector('a')?.textContent).toContain('This game night');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('surfaces rejection and reloads only after explicit activation', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    const request = deferred();
    const { target } = render(() => request.promise);
    request.reject(new Error('Synthetic chunk failure'));
    await settled();

    expect(target.querySelector('[role="status"]')).toBeNull();
    expect(target.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't load this page",
    );
    const button = target.querySelector<HTMLButtonElement>('button')!;
    expect(button.textContent).toBe('Reload page');
    expect(button.type).toBe('button');
    expect(button.classList.contains('primary')).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    button.focus();
    expect(document.activeElement).toBe(button);
    button.click();
    expect(reload).toHaveBeenCalledExactlyOnceWith();
  });

  it('also surfaces a synchronous loader throw without an unhandled rejection', async () => {
    const { target } = render(() => {
      throw new Error('Synthetic loader failure');
    });
    await settled();
    expect(target.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('allows repeated failures and successful recovery with a new loader', async () => {
    const first = deferred();
    const second = deferred();
    const third = deferred();
    const { target, inputs } = render(() => first.promise);
    first.reject(new Error('First failure'));
    await settled();
    expect(target.querySelector('[role="alert"]')).not.toBeNull();

    inputs.update((value) => ({ ...value, loader: () => second.promise }));
    flushSync();
    expect(target.querySelector('[role="status"]')).not.toBeNull();
    expect(target.querySelector('[role="alert"]')).toBeNull();
    second.reject(new Error('Second failure'));
    await settled();
    expect(target.querySelector('[role="alert"]')).not.toBeNull();

    inputs.update((value) => ({ ...value, loader: () => third.promise }));
    flushSync();
    third.resolve({ default: BackLink });
    await settled();
    expect(target.querySelector('a')).not.toBeNull();
    expect(target.querySelector('[role="alert"]')).toBeNull();
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores stale %s after the loader changes while pending',
    async (completion) => {
      const old = deferred();
      const current = deferred();
      const { target, inputs } = render(() => old.promise);
      await settled();
      inputs.update((value) => ({ ...value, loader: () => current.promise }));
      flushSync();
      if (completion === 'resolve') old.resolve({ default: BackLink });
      else old.reject(new Error('Stale failure'));
      await settled();
      expect(target.querySelector('[role="status"]')).not.toBeNull();
      expect(target.querySelector('a, [role="alert"]')).toBeNull();

      current.resolve({ default: BackLink });
      await settled();
      expect(target.querySelector('a')).not.toBeNull();
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'ignores %s after unmount without affecting a new route',
    async (completion) => {
      const old = deferred();
      const first = render(() => old.promise);
      await settled();
      await unmount(first.component);
      mounted.splice(mounted.indexOf(first.component), 1);
      const current = render(async () => ({ default: BackLink }));
      await settled();
      if (completion === 'resolve') old.resolve({ default: BackLink });
      else old.reject(new Error('Unmounted failure'));
      await settled();
      expect(first.target.childElementCount).toBe(0);
      expect(current.target.querySelector('a')).not.toBeNull();
      expect(current.target.querySelector('[role="alert"]')).toBeNull();
    },
  );
});
