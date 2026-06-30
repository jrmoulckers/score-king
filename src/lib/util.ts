export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const PALETTE = [
  '#7c5cff', '#34d399', '#f87171', '#fbbf24', '#38bdf8', '#fb7185',
  '#a78bfa', '#4ade80', '#f59e0b', '#22d3ee', '#e879f9', '#facc15',
];

/**
 * Color-blind-friendly counterparts to PALETTE, index-for-index, drawn from the
 * Paul Tol "muted" and Okabe-Ito palettes. Chosen to stay distinguishable under
 * deuteranopia, protanopia, and tritanopia.
 */
export const CVD_PALETTE = [
  '#332288', '#44aa99', '#cc6677', '#e69f00', '#56b4e9', '#882255',
  '#aa4499', '#117733', '#d55e00', '#88ccee', '#ddcc77', '#999933',
];

export function pickColor(used: string[]): string {
  const free = PALETTE.find((c) => !used.includes(c));
  return free ?? PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

/** Map a base palette color to its color-blind-safe equivalent. Custom colors pass through. */
export function resolvePlayerColor(hex: string, colorBlind: boolean): string {
  if (!colorBlind) return hex;
  const i = PALETTE.indexOf(hex.toLowerCase());
  return i >= 0 ? CVD_PALETTE[i] : hex;
}

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = lin((n >> 16) & 255);
  const g = lin((n >> 8) & 255);
  const b = lin(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Pick black or white text for best WCAG contrast against a background color. */
export function textOn(hex: string): string {
  const l = relativeLuminance(hex);
  const contrastWhite = 1.05 / (l + 0.05);
  const contrastBlack = (l + 0.05) / 0.05;
  return contrastBlack >= contrastWhite ? '#0b0b12' : '#ffffff';
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return formatDate(ts);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
