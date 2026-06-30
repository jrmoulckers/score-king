import * as db from './db';
import type { Game, Player, Round } from '../types';
import type { Settings } from '../stores/settings';
import { getBackupSettings, applyBackupSettings } from '../stores/settings';

export interface Snapshot {
  players: Player[];
  games: Game[];
  rounds: Round[];
  /**
   * Backed-up user preferences (the portable subset of {@link Settings}).
   * Optional so older backups — and JSON files written before settings sync —
   * still restore cleanly; when absent, local preferences are left as-is.
   */
  settings?: Partial<Settings>;
  exportedAt: number;
}

/**
 * Backup file naming
 * ------------------
 * The configured OneDrive folder (App folder or a custom folder) is the source of
 * truth: every backup file in it is one the user can keep alongside others.
 *
 * - A backup's title is exactly what the user types and the file is stored as
 *   `<Title>.json`, so it reads naturally in OneDrive.
 * - New connections start on `Main.json` ("Main"), which also stays the fallback
 *   when every other backup has been removed.
 */
export const BACKUP_EXT = '.json';
/** The default backup, used for new connections and as the last-resort fallback. */
export const DEFAULT_BACKUP_FILE = `Main${BACKUP_EXT}`;

/** Marker identifying a file as a Score King backup (guards against restoring foreign files). */
export const BACKUP_SCHEMA = 'score-king/backup';
/** Current backup envelope version. */
export const BACKUP_VERSION = 1;

/** Metadata for one detected backup file in the configured folder. */
export interface BackupInfo {
  /** File name within the folder, e.g. "Friday Crew.json". */
  file: string;
  /** Human-readable title derived from the file name. */
  title: string;
  /** True for the default `Main.json`. */
  isDefault: boolean;
  /** Last modified time (ms epoch), or null when not backed up yet. */
  modifiedAt: number | null;
  /** Size in bytes, or null when unknown. */
  size: number | null;
  /** OneDrive item eTag for optimistic concurrency, or null when unknown. */
  etag: string | null;
}

/** Characters OneDrive/SharePoint forbid in a file name. */
const ILLEGAL_NAME_CHARS = /[\\/:*?"<>|]/g;

/** Clean a user title into something safe to use as a file name. */
export function sanitizeBackupTitle(title: string): string {
  return title
    .replace(ILLEGAL_NAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** Build the file name for a user title (the title is the file name). */
export function fileNameForTitle(title: string): string {
  const clean = sanitizeBackupTitle(title);
  if (!clean) return DEFAULT_BACKUP_FILE;
  return `${clean}${BACKUP_EXT}`;
}

/** Derive a display title from a backup file name. */
export function titleFromFileName(file: string): string {
  return file.replace(/\.json$/i, '').trim();
}

/** Whether a folder child looks like one of our backup files. */
export function isBackupFile(file: string): boolean {
  if (!/\.json$/i.test(file)) return false;
  // Skip hidden/temp files (e.g. ".~lock", "~$…").
  return !/^[.~]/.test(file);
}

/** Serialize a snapshot into the JSON backup envelope written to the cloud/local file. */
export function serializeSnapshot(snapshot: Snapshot): string {
  const envelope = {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: snapshot.exportedAt,
    players: snapshot.players,
    games: snapshot.games,
    rounds: snapshot.rounds,
    settings: snapshot.settings ?? {},
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Parse a backup file back into a Snapshot. Returns null when the text isn't a
 * recognizable Score King backup (foreign/empty file), so a restore can never wipe
 * local data with unrelated content. Accepts both the current envelope and a legacy
 * bare-snapshot JSON (older local exports) for backward-compatible import.
 */
export function deserializeSnapshot(text: string): Snapshot | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const looksLikeSnapshot =
    Array.isArray(obj.players) && Array.isArray(obj.games) && Array.isArray(obj.rounds);
  // Accept our envelope and legacy bare-snapshot exports (both carry the three core
  // arrays); reject anything else so a foreign file can never wipe local data.
  if (!looksLikeSnapshot) return null;
  return {
    players: obj.players as Snapshot['players'],
    games: obj.games as Snapshot['games'],
    rounds: obj.rounds as Snapshot['rounds'],
    settings: (obj.settings as Snapshot['settings']) ?? {},
    exportedAt: typeof obj.exportedAt === 'number' ? obj.exportedAt : Date.now(),
  };
}

/** Options for a provider push. */
export interface PushOptions {
  /**
   * When false, the provider must NOT trigger any interactive sign-in (e.g. a
   * full-page redirect to Microsoft). If it can't get a token silently it throws
   * {@link InteractionRequiredError} instead. Used by background auto-sync so it
   * never yanks the user away mid-use. Defaults to true (manual backups).
   */
  interactive?: boolean;
  /**
   * Last-known item eTag for optimistic concurrency. When provided (with the default
   * 'update' mode) the provider sends `If-Match`, so a remote change since this eTag
   * fails with {@link ConflictError} instead of silently overwriting. When omitted, the
   * write is unconditional (last-write-wins) — used for the first write of a connection,
   * before any eTag baseline exists.
   */
  baseEtag?: string | null;
  /**
   * 'create' requires the file not to exist yet (`If-None-Match: *`) — used when adding a
   * brand-new titled backup so a same-named file isn't clobbered. 'update' (default)
   * overwrites the existing active backup.
   */
  mode?: 'create' | 'update';
}

/** Result of a successful push: the new item eTag (for the next conditional write). */
export interface PushResult {
  etag: string | null;
}

/** A pulled snapshot together with the item eTag it was read at. */
export interface PulledSnapshot {
  snapshot: Snapshot;
  etag: string | null;
}

/** Thrown by a silent (non-interactive) push when the user must sign in again. */
export class InteractionRequiredError extends Error {
  constructor(message = 'Interactive sign-in required') {
    super(message);
    this.name = 'InteractionRequiredError';
  }
}

/** Thrown by a conditional push when the remote backup changed since `baseEtag`. */
export class ConflictError extends Error {
  constructor(message = 'The backup was changed elsewhere') {
    super(message);
    this.name = 'ConflictError';
  }
}

export interface SyncProvider {
  id: string;
  label: string;
  isConfigured(): boolean;
  isSignedIn(): boolean;
  /** Initialize and restore any cached session; resolves to whether a user is signed in. */
  prepare(): Promise<boolean>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Upload a full snapshot to the active backup file, returning the new item eTag. With
   * `opts.baseEtag` (update mode) the write is conditional and throws {@link ConflictError}
   * when the remote changed since that eTag; otherwise it's last-write-wins. Implementations
   * MUST create the backing file — and any missing parent folders — if it doesn't exist yet,
   * so a backup succeeds even after the file/folder was deleted remotely.
   */
  push(snapshot: Snapshot, opts?: PushOptions): Promise<PushResult>;
  /**
   * Fetch the latest remote snapshot plus its item eTag, bypassing any HTTP/CDN caches so a
   * single call always reflects the most recent remote edit. Resolves to null (rather than
   * throwing) when no backup exists yet, or when the file isn't a recognizable Score King
   * backup (so a foreign file can't wipe local data).
   */
  pull(): Promise<PulledSnapshot | null>;
  /**
   * List every backup file detected in the configured folder, newest first. Resolves to an
   * empty array when the folder doesn't exist yet. Pass `{ interactive: false }` so a background /
   * on-mount refresh never triggers a sign-in redirect (throws {@link InteractionRequiredError}).
   */
  listBackups(opts?: PushOptions): Promise<BackupInfo[]>;
  /** Permanently delete a backup file from the configured folder. */
  removeBackup(file: string): Promise<void>;
  /**
   * Rename a backup file to carry a new title, returning its updated info. Throws if a backup
   * with the target name already exists.
   */
  renameBackup(file: string, newTitle: string): Promise<BackupInfo>;
}

export async function buildSnapshot(): Promise<Snapshot> {
  const [players, games, rounds] = await Promise.all([
    db.getAllPlayers(),
    db.getAllGames(),
    db.getAllRounds(),
  ]);
  return { players, games, rounds, settings: getBackupSettings(), exportedAt: Date.now() };
}

export async function restoreSnapshot(snapshot: Snapshot): Promise<void> {
  await db.replaceAll({
    players: snapshot.players,
    games: snapshot.games,
    rounds: snapshot.rounds,
  });
  applyBackupSettings(snapshot.settings);
}

/** Lazy-load the OneDrive provider (keeps MSAL out of the main bundle). */
export async function getOneDrive(): Promise<SyncProvider> {
  const mod = await import('./onedrive');
  return mod.oneDrive;
}
