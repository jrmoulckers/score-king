import type { PlayerAppearance, PlayerAvatarStyle } from './types';

export const PROFILE_IMAGE_MAX_INPUT_BYTES = 8 * 1024 * 1024;
const PROFILE_IMAGE_MAX_STORED_BYTES = 512 * 1024;
const PROFILE_IMAGE_SIZE = 320;
const RASTER_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const STYLES = new Set<PlayerAvatarStyle>(['solid', 'gradient', 'image']);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SAFE_IMAGE_DATA = /^data:image\/(?:jpeg|png|webp);base64,/i;

export function isProfileColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function firstGrapheme(value: string): string {
  const clean = value.trim();
  if (!clean) return '';
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return segmenter.segment(clean)[Symbol.iterator]().next().value?.segment ?? '';
  }
  return Array.from(clean)[0] ?? '';
}

export function safeProfileImageSource(value: unknown): string | undefined {
  if (typeof value !== 'string' || !SAFE_IMAGE_DATA.test(value)) return undefined;
  return value.length <= Math.ceil((PROFILE_IMAGE_MAX_STORED_BYTES * 4) / 3) + 128
    ? value
    : undefined;
}

export function sanitizePlayerAppearance(value: unknown): PlayerAppearance | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const style =
    raw.style === 'tie-dye'
      ? 'gradient'
      : typeof raw.style === 'string' && STYLES.has(raw.style as PlayerAvatarStyle)
        ? (raw.style as PlayerAvatarStyle)
        : 'solid';
  const color2 = isProfileColor(raw.color2) ? raw.color2.toLowerCase() : undefined;
  const image = safeProfileImageSource(raw.image);
  const emoji = typeof raw.emoji === 'string' ? firstGrapheme(raw.emoji) || undefined : undefined;

  return {
    style: style === 'image' && !image ? 'solid' : style,
    ...(color2 ? { color2 } : {}),
    ...(image ? { image } : {}),
    ...(emoji ? { emoji } : {}),
  };
}

export function profileImageUrlError(value: string): string | null {
  const clean = value.trim();
  if (!clean) return 'Paste an image URL first.';
  if (clean.length > 2048) return 'That image URL is too long.';
  try {
    const url = new URL(clean);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return 'Use an http or https image URL.';
    }
  } catch {
    return 'Enter a complete image URL, including https://.';
  }
  return null;
}

function validateImageBlob(blob: Blob): void {
  if (!RASTER_IMAGE_TYPES.has(blob.type)) {
    throw new Error('Choose a PNG, JPEG, or WebP image.');
  }
  if (blob.size > PROFILE_IMAGE_MAX_INPUT_BYTES) {
    throw new Error('Choose an image smaller than 8 MB.');
  }
}

export async function readBoundedImageResponse(
  response: Response,
  maxBytes = PROFILE_IMAGE_MAX_INPUT_BYTES,
): Promise<Blob> {
  const mediaType = (response.headers.get('content-type') ?? '').split(';')[0].toLowerCase();
  if (!RASTER_IMAGE_TYPES.has(mediaType)) {
    throw new Error('That URL did not return a PNG, JPEG, or WebP image.');
  }

  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > maxBytes) throw new Error('Choose an image smaller than 8 MB.');
  if (!response.body) {
    const blob = await response.blob();
    if (blob.size > maxBytes) throw new Error('Choose an image smaller than 8 MB.');
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error('Choose an image smaller than 8 MB.');
    }
    chunks.push(value.slice().buffer);
  }
  return new Blob(chunks, { type: mediaType });
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('That image could not be opened.'));
    };
    image.src = objectUrl;
  });
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: 'image/webp' | 'image/jpeg',
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('That image could not be saved.'));
    reader.onerror = () => reject(new Error('That image could not be saved.'));
    reader.readAsDataURL(blob);
  });
}

/** Crop and compress a user-provided raster image into a small, offline-safe profile image. */
export async function prepareProfileImage(blob: Blob): Promise<string> {
  validateImageBlob(blob);
  const image = await loadImage(blob);
  const canvas = document.createElement('canvas');
  canvas.width = PROFILE_IMAGE_SIZE;
  canvas.height = PROFILE_IMAGE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare profile images.');

  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const sx = (image.naturalWidth - side) / 2;
  const sy = (image.naturalHeight - side) / 2;
  context.drawImage(image, sx, sy, side, side, 0, 0, PROFILE_IMAGE_SIZE, PROFILE_IMAGE_SIZE);

  let output = await canvasBlob(canvas, 'image/webp', 0.82);
  if (!output || output.size > PROFILE_IMAGE_MAX_STORED_BYTES) {
    output = await canvasBlob(canvas, 'image/jpeg', 0.78);
  }
  if (!output || output.size > PROFILE_IMAGE_MAX_STORED_BYTES) {
    throw new Error('That image is still too large after resizing. Try a simpler image.');
  }
  return asDataUrl(output);
}

/** Download once, then store the same compact local representation used for uploads. */
export async function prepareRemoteProfileImage(
  value: string,
  signal?: AbortSignal,
): Promise<string> {
  const validationError = profileImageUrlError(value);
  if (validationError) throw new Error(validationError);

  let response: Response;
  try {
    response = await fetch(value.trim(), {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The image took too long to download. Try uploading it instead.', {
        cause: error,
      });
    }
    throw new Error("That site wouldn't let Score King download the image. Try uploading it.", {
      cause: error,
    });
  }
  if (!response.ok) throw new Error(`The image server returned ${response.status}.`);

  return prepareProfileImage(await readBoundedImageResponse(response));
}
