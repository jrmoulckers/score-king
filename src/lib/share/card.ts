/**
 * Renders a finished game's standings to a shareable **image card** (PNG) — the "bragging
 * rights" artifact you drop into a group chat. Standings-only on purpose: a dense
 * round-by-round matrix doesn't read as an image, so the card stays glanceable.
 *
 * Drawn on an offscreen canvas with a fixed, canonical **dark-violet** palette (DESIGN.md) so
 * the artifact looks the same regardless of the sharer's current theme, using only the system
 * font (no web-font load). Crown Gold marks the winner and their score — nothing else. This
 * module is imported lazily so its canvas work never touches the core bundle.
 */

import type { RecapView } from './recap';
import { initials, textOn } from '../util';

// Canonical dark palette (DESIGN.md frontmatter) — a consistent artifact, theme-independent.
const C = {
  bg: '#0f1020',
  glow: '#1c1d3a',
  surface2: '#24263f',
  border: '#313357',
  text: '#e9e9f4',
  muted: '#a3a6cb',
  accent: '#ffd166',
  accentInk: '#ffd166',
} as const;

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const W = 1080;
const PAD = 72;
const ROW_H = 104;

/** Render the recap view to a PNG blob. */
export async function renderRecapCard(view: RecapView): Promise<Blob> {
  const rows = view.standings;
  // Lay out vertically, accumulating a running Y so the card height fits the content exactly.
  let y = PAD;
  const headerTop = y;
  const H =
    PAD + // top pad
    120 + // brand + emoji block
    100 + // title
    50 + // date
    96 + // winner hero
    28 + // gap
    rows.length * ROW_H +
    40 + // gap
    64 + // footer
    PAD;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Couldn’t prepare the image on this device.');

  // Background: deep field with a soft violet glow toward the top (matches the app body).
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -H * 0.08, 80, W / 2, -H * 0.08, W * 1.1);
  glow.addColorStop(0, C.glow);
  glow.addColorStop(1, C.bg);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  y = headerTop;

  // Brand overline.
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.muted;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText('👑 SCORE KING', PAD, y + 30);
  y += 84;

  // Game emoji + title + date, centered.
  ctx.textAlign = 'center';
  ctx.font = `88px ${FONT}`;
  ctx.fillText(view.emoji, W / 2, y + 78);
  y += 116;

  ctx.fillStyle = C.text;
  ctx.font = `700 62px ${FONT}`;
  fillCentered(ctx, view.title, W / 2, y + 40, W - PAD * 2);
  y += 82;

  ctx.fillStyle = C.muted;
  ctx.font = `400 32px ${FONT}`;
  const date = new Date(view.finishedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  ctx.fillText(date, W / 2, y + 24);
  y += 74;

  // Winner hero.
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const winnerNames = view.winners.map((id) => byId.get(id)?.name ?? '?').join(' & ');
  const heroText = winnerNames
    ? `🏆 ${winnerNames} ${view.winners.length > 1 ? 'tie!' : 'wins!'}`
    : '🏁 Final standings';
  ctx.fillStyle = winnerNames ? C.accentInk : C.text;
  ctx.font = `700 56px ${FONT}`;
  fillCentered(ctx, heroText, W / 2, y + 44, W - PAD * 2);
  y += 96 + 28;

  // Standings rows.
  ctx.textAlign = 'left';
  for (const s of rows) {
    const p = byId.get(s.playerId);
    const isWinner = view.winners.includes(s.playerId);
    const rowY = y;

    if (isWinner) {
      // Restrained Crown Gold wash + underline — the same "gold is a hint" treatment as the app.
      ctx.fillStyle = 'rgba(255, 209, 102, 0.13)';
      roundRect(ctx, PAD - 20, rowY, W - (PAD - 20) * 2, ROW_H - 16, 18);
      ctx.fill();
    }

    const midY = rowY + (ROW_H - 16) / 2;

    // Rank.
    ctx.fillStyle = C.muted;
    ctx.font = `700 34px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(s.rank), PAD + 6, midY + 12);

    // Avatar chip.
    const avX = PAD + 62;
    const avR = 32;
    if (p) {
      ctx.beginPath();
      ctx.arc(avX + avR, midY, avR, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.fillStyle = textOn(p.color);
      ctx.font = `700 30px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials(p.name), avX + avR, midY + 1);
      ctx.textBaseline = 'alphabetic';
    }

    // Name (+ trophy for the winner).
    const nameX = avX + avR * 2 + 24;
    const scoreX = W - PAD;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.text;
    ctx.font = `600 40px ${FONT}`;
    const label = isWinner ? `${p?.name ?? '?'}  🏆` : (p?.name ?? '?');
    const scoreStr = String(s.total);
    ctx.font = `700 46px ${FONT}`;
    const scoreW = ctx.measureText(scoreStr).width;
    ctx.font = `600 40px ${FONT}`;
    const maxNameW = scoreX - nameX - scoreW - 32;
    fillTruncated(ctx, label, nameX, midY + 14, maxNameW);

    // Score (Crown Gold for the winner, per the Crown Gold rule).
    ctx.textAlign = 'right';
    ctx.fillStyle = isWinner ? C.accentInk : C.text;
    ctx.font = `700 46px ${FONT}`;
    ctx.fillText(scoreStr, scoreX, midY + 16);

    y += ROW_H;
  }

  y += 40;

  // Footer.
  ctx.textAlign = 'center';
  ctx.fillStyle = C.muted;
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText('score.jrmoulckers.com', W / 2, y + 24);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Couldn’t create the image on this device.'))),
      'image/png',
    );
  });
}

/** A short, safe file name for the shared card. */
export function recapCardFileName(view: RecapView): string {
  const slug = view.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return `score-king-${slug || 'results'}.png`;
}

// ── canvas helpers ───────────────────────────────────────────────────────────────────────

/** Draw text centered at x, shrinking the font until it fits `maxW`. */
function fillCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  baselineY: number,
  maxW: number,
): void {
  const base = parseFontSize(ctx.font);
  let size = base;
  while (size > 24 && measure(ctx, text, size) > maxW) size -= 2;
  const family = ctx.font.replace(/^[^ ]* \d+px /, '');
  const weight = ctx.font.split(' ')[0];
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillText(text, x, baselineY);
  ctx.font = `${weight} ${base}px ${family}`;
}

/** Draw left-aligned text, truncating with an ellipsis so it never exceeds `maxW`. */
function fillTruncated(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  baselineY: number,
  maxW: number,
): void {
  if (ctx.measureText(text).width <= maxW) {
    ctx.fillText(text, x, baselineY);
    return;
  }
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  ctx.fillText(t + '…', x, baselineY);
}

function measure(ctx: CanvasRenderingContext2D, text: string, size: number): number {
  const family = ctx.font.replace(/^[^ ]* \d+px /, '');
  const weight = ctx.font.split(' ')[0];
  const prev = ctx.font;
  ctx.font = `${weight} ${size}px ${family}`;
  const w = ctx.measureText(text).width;
  ctx.font = prev;
  return w;
}

function parseFontSize(font: string): number {
  const m = font.match(/(\d+)px/);
  return m ? Number(m[1]) : 40;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
