import { describe, expect, it } from 'vitest';
import {
  sanitizeBackupTitle,
  isValidBackupTitle,
  fileNameForTitle,
  titleFromFileName,
  sameBackupFile,
  isBackupFile,
  serializeSnapshot,
  deserializeSnapshot,
  mergeSnapshots,
  DEFAULT_BACKUP_FILE,
  type Snapshot,
} from './sync';

// A backup's title IS its OneDrive file name, so the title↔file mapping has to be
// forgiving of what users type without producing surprising or unsafe file names.
describe('sanitizeBackupTitle', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeBackupTitle('  Friday   Crew  ')).toBe('Friday Crew');
  });

  it('replaces characters OneDrive forbids in a file name', () => {
    expect(sanitizeBackupTitle('a/b:c*?"<>|d')).toBe('a b c d');
  });

  it('drops a trailing .json the user typed (no double extension)', () => {
    expect(sanitizeBackupTitle('Backup.json')).toBe('Backup');
    expect(fileNameForTitle('Backup.json')).toBe('Backup.json');
  });

  it('caps the length at 60 characters', () => {
    expect(sanitizeBackupTitle('x'.repeat(200))).toHaveLength(60);
  });
});

describe('isValidBackupTitle', () => {
  it('accepts a title with letters or numbers', () => {
    expect(isValidBackupTitle('Crew 2')).toBe(true);
  });

  it('rejects an empty or illegal-only title (would silently hijack Main)', () => {
    expect(isValidBackupTitle('   ')).toBe(false);
    expect(isValidBackupTitle('***')).toBe(false);
    expect(isValidBackupTitle('/\\:*?"<>|')).toBe(false);
  });
});

describe('fileNameForTitle / titleFromFileName', () => {
  it('round-trips a normal title', () => {
    const file = fileNameForTitle('Friday Crew');
    expect(file).toBe('Friday Crew.json');
    expect(titleFromFileName(file)).toBe('Friday Crew');
  });

  it('falls back to the Default file for an unusable title', () => {
    expect(fileNameForTitle('***')).toBe(DEFAULT_BACKUP_FILE);
  });
});

describe('sameBackupFile', () => {
  it('treats file names case-insensitively (OneDrive is case-insensitive)', () => {
    expect(sameBackupFile('Crew.json', 'crew.json')).toBe(true);
    expect(sameBackupFile('Crew.json', 'Krew.json')).toBe(false);
  });
});

describe('isBackupFile', () => {
  it('accepts .json files and skips hidden/temp files', () => {
    expect(isBackupFile('Main.json')).toBe(true);
    expect(isBackupFile('notes.txt')).toBe(false);
    expect(isBackupFile('.~lock.json')).toBe(false);
    expect(isBackupFile('~$Main.json')).toBe(false);
  });
});

describe('serialize/deserialize snapshot', () => {
  const snap: Snapshot = {
    players: [{ id: 'p1' }] as unknown as Snapshot['players'],
    games: [{ id: 'g1' }] as unknown as Snapshot['games'],
    rounds: [{ id: 'r1' }] as unknown as Snapshot['rounds'],
    gameDefs: [],
    settings: { theme: 'light' },
    exportedAt: 123,
  };

  it('round-trips through the JSON envelope', () => {
    const back = deserializeSnapshot(serializeSnapshot(snap));
    expect(back).not.toBeNull();
    expect(back!.players).toEqual(snap.players);
    expect(back!.exportedAt).toBe(123);
    expect(back!.settings).toEqual({ theme: 'light' });
  });

  it('rejects a foreign JSON file so a restore cannot wipe local data', () => {
    expect(deserializeSnapshot('{"hello":"world"}')).toBeNull();
    expect(deserializeSnapshot('not json at all')).toBeNull();
  });

  it('accepts a legacy bare-snapshot export (no envelope)', () => {
    const legacy = JSON.stringify({ players: [], games: [], rounds: [] });
    const back = deserializeSnapshot(legacy);
    expect(back).not.toBeNull();
    expect(back!.gameDefs).toEqual([]);
    expect(back!.settings).toEqual({});
  });
});

describe('mergeSnapshots', () => {
  const mk = (arr: Array<{ id: string; updatedAt?: number }>) =>
    arr as unknown as Snapshot['players'] & Snapshot['games'] & Snapshot['rounds'];

  it('unions records by id, newest write winning', () => {
    const local: Snapshot = {
      players: mk([
        { id: 'a', updatedAt: 10 },
        { id: 'b', updatedAt: 5 },
      ]),
      games: mk([]),
      rounds: mk([]),
      gameDefs: [],
      settings: { theme: 'dark' },
      exportedAt: 1,
    };
    const remote: Snapshot = {
      players: mk([
        { id: 'b', updatedAt: 20 }, // newer than local b
        { id: 'c', updatedAt: 1 }, // only on remote
      ]),
      games: mk([]),
      rounds: mk([]),
      gameDefs: [],
      settings: { theme: 'light' },
      exportedAt: 2,
    };
    const merged = mergeSnapshots(local, remote);
    const byId = Object.fromEntries(
      (merged.players as unknown as Array<{ id: string; updatedAt: number }>).map((p) => [
        p.id,
        p.updatedAt,
      ]),
    );
    expect(byId).toEqual({ a: 10, b: 20, c: 1 });
    // Device-local prefs are taken from `local` — a merge must never restyle this device.
    expect(merged.settings).toEqual({ theme: 'dark' });
  });
});
