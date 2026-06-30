/** Presentation helpers for stat values. Pure; safe to unit-test. */

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

export function fmtPct(ratio: number, digits = 0): string {
  if (!isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function fmtSigned(n: number): string {
  return n > 0 ? `+${fmtInt(n)}` : fmtInt(n);
}

/** Ordinal finishing position: 1 -> "1st". */
export function ordinal(n: number): string {
  const r = Math.round(n);
  const mod100 = r % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${r}th`;
  switch (r % 10) {
    case 1:
      return `${r}st`;
    case 2:
      return `${r}nd`;
    case 3:
      return `${r}rd`;
    default:
      return `${r}th`;
  }
}

/** One-decimal average when not whole (avg finishing position etc.). */
export function fmtAvg(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Compact human duration from ms (used for game/session length). */
export function fmtDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Approximate hours, one decimal (lifetime "hours played"). */
export function fmtHours(ms: number): string {
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdayName(dow: number): string {
  return WEEKDAYS[((dow % 7) + 7) % 7];
}

/** Local YYYY-MM-DD key for a timestamp — the unit of a "game night". */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
