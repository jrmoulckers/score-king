import { describe, expect, it } from 'vitest';
import {
  firstGrapheme,
  isProfileColor,
  profileImageUrlError,
  readBoundedImageResponse,
  safeProfileImageSource,
  sanitizePlayerAppearance,
} from './profile';

describe('player profile appearance', () => {
  it('accepts full hex colors and rejects CSS injection', () => {
    expect(isProfileColor('#7c5cff')).toBe(true);
    expect(isProfileColor('linear-gradient(red, blue)')).toBe(false);
  });

  it('keeps one emoji grapheme, including joined emoji', () => {
    expect(firstGrapheme('  👩‍🚀 ⭐ ')).toBe('👩‍🚀');
  });

  it('falls an image style back to solid without safe local image data', () => {
    expect(
      sanitizePlayerAppearance({
        style: 'image',
        image: 'https://tracker.example/avatar.png',
        emoji: '🎲🎉',
      }),
    ).toEqual({ style: 'solid', emoji: '🎲' });
  });

  it('accepts resized raster data and rejects SVG data', () => {
    expect(safeProfileImageSource('data:image/webp;base64,AAAA')).toBeTruthy();
    expect(safeProfileImageSource('data:image/svg+xml;base64,AAAA')).toBeUndefined();
  });
});

describe('profile image URL validation', () => {
  it('accepts http and https URLs', () => {
    expect(profileImageUrlError('https://example.com/avatar.png')).toBeNull();
    expect(profileImageUrlError('http://localhost/avatar.jpg')).toBeNull();
  });

  it('rejects incomplete and active-scheme URLs', () => {
    expect(profileImageUrlError('example.com/avatar.png')).toBeTruthy();
    expect(profileImageUrlError('javascript:alert(1)')).toBeTruthy();
  });
});

describe('bounded remote profile images', () => {
  it('reads a valid raster response', async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'image/png' },
    });
    const blob = await readBoundedImageResponse(response, 4);
    expect(blob.size).toBe(3);
    expect(blob.type).toBe('image/png');
  });

  it('stops a chunked response once it exceeds the byte limit', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5, 6]));
          controller.close();
        },
      }),
      { headers: { 'content-type': 'image/webp' } },
    );
    await expect(readBoundedImageResponse(response, 4)).rejects.toThrow(
      'Choose an image smaller than 8 MB.',
    );
  });
});
