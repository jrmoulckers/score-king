import { describe, it, expect } from 'vitest';
import { encodeSignal, decodeSignal, SIGNAL_VERSION } from './signal';

const sampleSdp =
  'v=0\r\no=- 46117 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\n' +
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:0\r\na=sctp-port:5000\r\n';

describe('signal codec', () => {
  it('round-trips an offer through the compact wire form', async () => {
    const wire = await encodeSignal({ k: 'offer', c: 'ABCDE', i: 'inv123', s: sampleSdp });
    expect(wire.startsWith(`sk${SIGNAL_VERSION}.`)).toBe(true);
    const sig = await decodeSignal(wire);
    expect(sig).toEqual({ v: SIGNAL_VERSION, k: 'offer', c: 'ABCDE', i: 'inv123', s: sampleSdp });
  });

  it('round-trips an answer and preserves the invite id that pairs it to an offer', async () => {
    const wire = await encodeSignal({ k: 'answer', c: 'ABCDE', i: 'inv123', s: sampleSdp });
    const sig = await decodeSignal(wire);
    expect(sig.k).toBe('answer');
    expect(sig.i).toBe('inv123');
    expect(sig.c).toBe('ABCDE');
  });

  it('tolerates surrounding whitespace from a sloppy copy-paste', async () => {
    const wire = await encodeSignal({ k: 'offer', c: 'ABCDE', i: 'x', s: sampleSdp });
    const sig = await decodeSignal(`  \n${wire}\n `);
    expect(sig.s).toBe(sampleSdp);
  });

  it('rejects a string that is not a nearby-play code with friendly copy', async () => {
    await expect(decodeSignal('https://example.com/join/ABCDE')).rejects.toThrow(
      /doesn’t look like a nearby-play code/i,
    );
  });

  it('rejects a corrupted payload rather than throwing a raw decode error', async () => {
    const wire = await encodeSignal({ k: 'offer', c: 'ABCDE', i: 'x', s: sampleSdp });
    // Corrupt the base64url body while keeping the header framing intact.
    const parts = wire.split('.');
    const corrupted = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -4)}$$$$`;
    await expect(decodeSignal(corrupted)).rejects.toThrow(/corrupted|different app version/i);
  });
});
