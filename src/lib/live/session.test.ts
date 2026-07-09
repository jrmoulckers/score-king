import { describe, it, expect } from 'vitest';
import { connectionNote, endedTitle, endedBody } from './connection';

describe('connectionNote', () => {
  it('is silent while online, regardless of transport', () => {
    expect(connectionNote('online', true)).toBeNull();
    expect(connectionNote('online', false)).toBeNull();
  });

  it('shows the same reconnecting copy for either transport', () => {
    expect(connectionNote('reconnecting', true)).toBe('Reconnecting…');
    expect(connectionNote('reconnecting', false)).toBe('Reconnecting…');
  });

  it('promises an auto-heal only when the transport can reconnect (relay)', () => {
    const note = connectionNote('offline', true);
    expect(note).toMatch(/reconnect/i);
    expect(note).toMatch(/host still has the game/i);
  });

  it('never claims to reconnect a nearby session it cannot re-signal', () => {
    const note = connectionNote('offline', false);
    // The core bug this guards: a nearby (WebRTC) guest must not be told we're reconnecting.
    expect(note).not.toMatch(/trying to reconnect/i);
    expect(note).toMatch(/fresh invite/i);
  });

  it('always reassures the guest their scores are safe when offline', () => {
    expect(connectionNote('offline', true)).toMatch(/game|safe/i);
    expect(connectionNote('offline', false)).toMatch(/safe/i);
  });
});

describe('session end copy', () => {
  it('names a deliberate host-end honestly', () => {
    expect(endedTitle('ended')).toBe('The game ended');
    expect(endedBody('ended')).toMatch(/host closed/i);
  });

  it('treats a missing reason as a deliberate host-end (back-compat with old peers)', () => {
    expect(endedTitle(null)).toBe('The game ended');
    expect(endedBody(null)).toMatch(/host closed/i);
  });

  it('never claims the host "closed" a session the link merely dropped', () => {
    expect(endedTitle('lost')).toBe('Lost the connection');
    const body = endedBody('lost');
    expect(body).not.toMatch(/host closed/i);
    // Points the guest at how to get back in, and reassures them nothing was lost.
    expect(body).toMatch(/fresh invite/i);
    expect(body).toMatch(/safe/i);
  });
});
