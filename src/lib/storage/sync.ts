import * as db from './db';
import type { Game, Player, Round } from '../types';

export interface Snapshot {
  players: Player[];
  games: Game[];
  rounds: Round[];
  exportedAt: number;
}

/**
 * Backup file naming
 * ------------------
 * The configured OneDrive folder (App folder or a custom folder) is the source of
 * truth: every workbook in it is a backup the user can keep alongside others.
 *
 * - A backup's title is exactly what the user types and the file is stored as
 *   `<Title>.xlsx`, so it reads naturally in OneDrive and Excel.
 * - New connections start on `Main.xlsx` ("Main"), which also stays the fallback
 *   when every other backup has been removed.
 */
export const BACKUP_EXT = '.xlsx';
/** The default backup, used for new connections and as the last-resort fallback. */
export const DEFAULT_BACKUP_FILE = `Main${BACKUP_EXT}`;

/** Metadata for one detected backup workbook in the configured folder. */
export interface BackupInfo {
  /** File name within the folder, e.g. "Friday Crew.xlsx". */
  file: string;
  /** Human-readable title derived from the file name. */
  title: string;
  /** True for the default `Main.xlsx`. */
  isDefault: boolean;
  /** Last modified time (ms epoch), or null when not backed up yet. */
  modifiedAt: number | null;
  /** Size in bytes, or null when unknown. */
  size: number | null;
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
  return file.replace(/\.xlsx$/i, '').trim();
}

/** Whether a folder child looks like one of our backup workbooks. */
export function isBackupFile(file: string): boolean {
  if (!/\.xlsx$/i.test(file)) return false;
  // Skip Excel's lock/owner temp files (e.g. "~$Main.xlsx").
  return !/^~\$/.test(file);
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
}

/** Thrown by a silent (non-interactive) push when the user must sign in again. */
export class InteractionRequiredError extends Error {
  constructor(message = 'Interactive sign-in required') {
    super(message);
    this.name = 'InteractionRequiredError';
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
   * Upload a full snapshot, overwriting any existing remote copy (last-write-wins; no conflict
   * errors). Implementations MUST create the backing file — and any missing parent folders — if
   * it doesn't exist yet, so a backup succeeds even after the file/folder was deleted remotely.
   */
  push(snapshot: Snapshot, opts?: PushOptions): Promise<void>;
  /**
   * Fetch the latest remote snapshot, bypassing any HTTP/CDN caches so a single call always
   * reflects the most recent remote edit. Resolves to null (rather than throwing) when no backup
   * exists yet — e.g. the file was never created or was deleted.
   */
  pull(): Promise<Snapshot | null>;
  /**
   * List every backup workbook detected in the configured folder, newest first. Resolves to an
   * empty array when the folder doesn't exist yet. Pass `{ interactive: false }` so a background /
   * on-mount refresh never triggers a sign-in redirect (throws {@link InteractionRequiredError}).
   */
  listBackups(opts?: PushOptions): Promise<BackupInfo[]>;
  /** Permanently delete a backup workbook from the configured folder. */
  removeBackup(file: string): Promise<void>;
  /**
   * Rename a backup workbook to carry a new title, returning its updated info. Throws if a backup
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
  return { players, games, rounds, exportedAt: Date.now() };
}

export async function restoreSnapshot(snapshot: Snapshot): Promise<void> {
  await db.replaceAll({
    players: snapshot.players,
    games: snapshot.games,
    rounds: snapshot.rounds,
  });
}

/** Lazy-load the OneDrive provider (keeps MSAL + SheetJS out of the main bundle). */
export async function getOneDrive(): Promise<SyncProvider> {
  const mod = await import('./onedrive');
  return mod.oneDrive;
}
