import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentScrollLock } from './documentScrollLock';

const releases: (() => void)[] = [];

function lock(node = document.createElement('div')) {
  document.body.append(node);
  const action = documentScrollLock(node);
  releases.push(action.destroy);
  return { node, ...action };
}

afterEach(() => {
  for (const release of releases.splice(0)) release();
  document.documentElement.removeAttribute('style');
  document.body.removeAttribute('style');
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('documentScrollLock', () => {
  it.each([0, 126])('restores exact inline styles and scroll position %s', (top) => {
    vi.stubGlobal('scrollY', top);
    vi.stubGlobal('scrollX', 12);
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    document.documentElement.style.cssText =
      'scroll-behavior: smooth; overflow: auto !important; --other: retained;';
    document.body.style.cssText = 'overflow-y: scroll !important; color: red;';
    const root = document.documentElement.getAttribute('style');
    const body = document.body.getAttribute('style');
    const node = document.createElement('div');
    node.style.cssText = 'overflow-y: auto; overscroll-behavior: auto !important;';
    const sheet = node.getAttribute('style');
    const action = lock(node);

    expect(document.documentElement.style.overflowY).toBe('hidden');
    expect(document.body.style.overflowX).toBe('hidden');
    expect(document.body.style.getPropertyPriority('overflow-y')).toBe('important');
    expect(node.style.overflowY).toBe('auto');
    expect(node.style.overscrollBehaviorY).toBe('contain');
    action.destroy();
    action.destroy();

    expect(document.documentElement.getAttribute('style')).toBe(root);
    expect(document.body.getAttribute('style')).toBe(body);
    expect(node.getAttribute('style')).toBe(sheet);
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ left: 12, top, behavior: 'instant' });
  });

  it.each([false, true])('retains nested lock with out-of-order release: %s', (outerFirst) => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const outer = lock();
    const inner = lock();
    const first = outerFirst ? outer : inner;
    const last = outerFirst ? inner : outer;
    first.destroy();
    first.destroy();
    expect(document.documentElement.style.overflowY).toBe('hidden');
    expect(last.node.style.overscrollBehaviorY).toBe('contain');
    expect(scroll).not.toHaveBeenCalled();
    last.destroy();
    expect(document.documentElement.hasAttribute('style')).toBe(false);
    expect(document.body.hasAttribute('style')).toBe(false);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('retains a lock when the same sheet has multiple owners', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const first = lock();
    const second = lock(first.node);
    first.destroy();
    expect(first.node.style.overscrollBehaviorY).toBe('contain');
    second.destroy();
    expect(first.node.hasAttribute('style')).toBe(false);
  });

  it('preserves unrelated style updates made while open and permits a fresh lifecycle', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    document.body.style.setProperty('overflow-y', 'scroll', 'important');
    const action = lock();
    document.body.style.setProperty('--updated', 'yes');
    document.documentElement.style.setProperty('--font-scale', '1.5');
    action.node.style.setProperty('color', 'red');
    action.destroy();
    expect(document.body.style.overflowY).toBe('scroll');
    expect(document.body.style.getPropertyPriority('overflow-y')).toBe('important');
    expect(document.body.style.getPropertyValue('--updated')).toBe('yes');
    expect(document.documentElement.style.overflowY).toBe('');
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.5');
    expect(action.node.style.color).toBe('red');
    expect(action.node.style.overscrollBehaviorY).toBe('');
    lock().destroy();
    expect(scroll).toHaveBeenCalledTimes(2);
  });
});
