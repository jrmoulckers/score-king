import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

describe('onboarding welcome dismissal', () => {
  beforeEach(() => {
    localStorage.clear();
    // Re-import fresh each test so the store re-reads localStorage on module load.
    vi.resetModules();
  });

  it('defaults to not-dismissed on a clean device', async () => {
    const { welcomeDismissed } = await import('./onboarding');
    expect(get(welcomeDismissed)).toBe(false);
  });

  it('persists dismissal to localStorage and the store', async () => {
    const { welcomeDismissed, dismissWelcome } = await import('./onboarding');
    dismissWelcome();
    expect(get(welcomeDismissed)).toBe(true);
    expect(localStorage.getItem('sk_welcome_dismissed')).toBe('1');
  });

  it('reads a previously-dismissed flag on load', async () => {
    localStorage.setItem('sk_welcome_dismissed', '1');
    vi.resetModules();
    const { welcomeDismissed } = await import('./onboarding');
    expect(get(welcomeDismissed)).toBe(true);
  });
});
