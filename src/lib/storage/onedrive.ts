import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser';
import { get } from 'svelte/store';
import { settings } from '../stores/settings';
import { ONEDRIVE_CLIENT_ID } from '../config';
import type { BackupInfo, PushOptions, SyncProvider } from './sync';
import {
  ConflictError,
  DEFAULT_BACKUP_FILE,
  InteractionRequiredError,
  deserializeSnapshot,
  fileNameForTitle,
  isBackupFile,
  serializeSnapshot,
  titleFromFileName,
} from './sync';

const GRAPH = 'https://graph.microsoft.com/v1.0';

// Where to send the user back to after a full-page Microsoft sign-in redirect.
const RETURN_KEY = 'sk_od_return';
// Set once a redirect sign-in completes, so the UI can confirm success a single time.
const JUST_CONNECTED_KEY = 'sk_od_justConnected';

function folderMode(): 'app' | 'custom' {
  return get(settings).oneDriveFolderMode === 'custom' ? 'custom' : 'app';
}

/**
 * Permissions requested at sign-in (dynamic consent — no app-registration change needed).
 * - App-folder mode is sandboxed to /Apps/Score King via Files.ReadWrite.AppFolder: the app
 *   cannot see any of the user's other files.
 * - Custom mode can write anywhere, which Graph only allows via the broad Files.ReadWrite scope
 *   (delegated permissions can't be limited to a single arbitrary folder).
 */
function scopes(): string[] {
  return folderMode() === 'custom'
    ? ['Files.ReadWrite', 'User.Read']
    : ['Files.ReadWrite.AppFolder', 'User.Read'];
}

function encodePath(p: string): string {
  return p
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

/** Folder segments for custom mode, trimmed and emptied of blanks (root => []). */
function customFolderSegments(): string[] {
  return (get(settings).oneDriveCustomPath || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The backup file the user is currently syncing to (default = Main.json). */
function activeFile(): string {
  return (get(settings).oneDriveBackupFile || '').trim() || DEFAULT_BACKUP_FILE;
}

/** Graph path addressing the configured folder's children collection. */
function childrenPath(): string {
  if (folderMode() === 'custom') {
    const folder = encodePath(get(settings).oneDriveCustomPath || '');
    return folder ? `/me/drive/root:/${folder}:/children` : '/me/drive/root/children';
  }
  return '/me/drive/special/approot/children';
}

/** Graph path addressing a backup *item* (metadata: GET/DELETE/PATCH) in the chosen folder. */
function itemPath(file: string): string {
  const name = encodeURIComponent(file);
  if (folderMode() === 'custom') {
    const folder = encodePath(get(settings).oneDriveCustomPath || '');
    return `/me/drive/root:${folder ? '/' + folder : ''}/${name}`;
  }
  return `/me/drive/special/approot:/${name}`;
}

/** Graph addressing for a backup file's content, per the chosen storage location. */
function contentPath(file: string = activeFile()): string {
  return `${itemPath(file)}:/content`;
}

let pca: PublicClientApplication | null = null;
let account: AccountInfo | null = null;
let initializedFor = '';

function clientId(): string {
  // Per-user override (Settings) wins; otherwise the shared app's public client ID.
  return (get(settings).oneDriveClientId.trim() || ONEDRIVE_CLIENT_ID).trim();
}

async function ensureApp(): Promise<PublicClientApplication> {
  const id = clientId();
  if (!id) throw new Error('No OneDrive client ID configured (add it in Settings).');
  if (!pca || initializedFor !== id) {
    pca = new PublicClientApplication({
      auth: {
        clientId: id,
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'localStorage' },
    });
    await pca.initialize();
    // Process a returning sign-in redirect (if any) and reconcile cached state. This must run
    // before any other MSAL call and also clears a stuck "interaction_in_progress".
    try {
      const result = await pca.handleRedirectPromise();
      if (result?.account) account = result.account;
    } catch {
      /* nothing to handle */
    }
    initializedFor = id;
    if (!account) {
      const accounts = pca.getAllAccounts();
      if (accounts.length) account = accounts[0];
    }
    if (account) pca.setActiveAccount(account);
  }
  return pca;
}

/**
 * Finish a Microsoft sign-in that used the full-page redirect flow. Called once at app
 * startup when the URL carries the redirect response; returns the path the user started
 * from (so the app can navigate back there), or null.
 */
export async function completeRedirect(): Promise<string | null> {
  if (!clientId()) return null;
  try {
    await ensureApp();
  } catch {
    return null;
  }
  const ret = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  if (account) sessionStorage.setItem(JUST_CONNECTED_KEY, '1');
  return ret;
}

async function token(interactive = true): Promise<string> {
  const app = await ensureApp();
  if (!account) {
    // Background auto-sync must never yank the user to Microsoft — fail quietly.
    if (!interactive) throw new InteractionRequiredError('Not signed in to OneDrive');
    // Not signed in yet — hand off to a full-page redirect; this call does not return.
    sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search);
    await app.loginRedirect({ scopes: scopes() });
    throw new Error('Redirecting to Microsoft to sign in…');
  }
  try {
    const res = await app.acquireTokenSilent({ scopes: scopes(), account });
    return res.accessToken;
  } catch {
    if (!interactive)
      throw new InteractionRequiredError('Silent OneDrive token refresh failed');
    sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search);
    await app.acquireTokenRedirect({ scopes: scopes(), account });
    throw new Error('Redirecting to Microsoft to refresh sign-in…');
  }
}

async function graph(path: string, init: RequestInit, accessToken: string): Promise<Response> {
  return fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${accessToken}` },
  });
}

/** PUT the JSON backup to the configured content path, with optional concurrency headers. */
function putContent(
  body: string,
  accessToken: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  return graph(
    contentPath(),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body,
    },
    accessToken,
  );
}

/**
 * Create the custom-folder path if it's missing — e.g. the user deleted the folder in OneDrive —
 * so a subsequent upload to a file inside it succeeds. Each segment is created with
 * conflictBehavior 'fail', so existing folders (and their contents) are left untouched (a 409 just
 * means "already there"). App-folder mode needs nothing here: Graph provisions the sandboxed
 * approot automatically on write.
 */
async function ensureCustomFolder(accessToken: string): Promise<void> {
  let parentPath = '';
  for (const name of customFolderSegments()) {
    const childrenPath = parentPath
      ? `/me/drive/root:/${encodePath(parentPath)}:/children`
      : '/me/drive/root/children';
    const res = await graph(
      childrenPath,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        }),
      },
      accessToken,
    );
    if (!res.ok && res.status !== 409) {
      throw new Error(`Could not create OneDrive folder "${name}" (HTTP ${res.status}).`);
    }
    parentPath = parentPath ? `${parentPath}/${name}` : name;
  }
}

export const oneDrive: SyncProvider = {
  id: 'onedrive',
  label: 'OneDrive',
  isConfigured() {
    return !!clientId();
  },
  isSignedIn() {
    return !!account;
  },
  async prepare() {
    if (!clientId()) return false;
    await ensureApp();
    return !!account;
  },
  async signIn() {
    const app = await ensureApp();
    // Full-page redirect to Microsoft. Remember where we are so we can return here after.
    sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search);
    await app.loginRedirect({ scopes: scopes() });
  },
  async signOut() {
    if (pca && account) {
      // Local sign-out: forget this app's cached tokens without a full-page logout redirect.
      try {
        await pca.clearCache({ account });
      } catch {
        /* ignore */
      }
      pca.setActiveAccount(null);
    }
    account = null;
  },
  async push(snapshot, opts) {
    const accessToken = await token(opts?.interactive ?? true);
    const body = serializeSnapshot(snapshot);
    const mode = opts?.mode ?? 'update';
    // create → require absence; update with a baseline → require the eTag still matches;
    // update without a baseline → unconditional (the first write of a connection).
    const conditional: Record<string, string> =
      mode === 'create'
        ? { 'If-None-Match': '*' }
        : opts?.baseEtag
          ? { 'If-Match': opts.baseEtag }
          : {};
    let res = await putContent(body, accessToken, conditional);
    // A custom-folder target 404s when its parent folder was deleted (or never created).
    // Recreate the hierarchy and retry unconditionally so backup self-heals. App-folder mode
    // doesn't need this — writing to approot re-provisions the sandboxed folder automatically.
    if (res.status === 404 && folderMode() === 'custom') {
      await ensureCustomFolder(accessToken);
      res = await putContent(body, accessToken);
    }
    if (res.status === 412) {
      if (mode === 'create') {
        throw new Error(`A backup named "${titleFromFileName(activeFile())}" already exists.`);
      }
      // If-Match failed: the file was either deleted (stale baseline) or genuinely changed
      // elsewhere. A quick existence check tells them apart, so a remote *deletion* still
      // self-heals (recreate) instead of nagging about a phantom conflict.
      const meta = await graph(
        itemPath(activeFile()),
        { method: 'GET', cache: 'no-store' },
        accessToken,
      );
      if (meta.status === 404) {
        if (folderMode() === 'custom') await ensureCustomFolder(accessToken);
        res = await putContent(body, accessToken);
      } else {
        throw new ConflictError();
      }
    }
    if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status}).`);
    const item = (await res.json().catch(() => ({}))) as { eTag?: string };
    return { etag: item.eTag ?? null };
  },
  async pull() {
    const accessToken = await token();
    // Read item metadata (eTag + a short-lived pre-authenticated download URL). cache:'no-store'
    // keeps both fresh, so a single Restore always reflects the latest remote edit.
    const meta = await graph(
      itemPath(activeFile()),
      { method: 'GET', cache: 'no-store' },
      accessToken,
    );
    if (meta.status === 404) return null;
    if (!meta.ok) throw new Error(`Download failed (HTTP ${meta.status}).`);
    const item = (await meta.json()) as {
      eTag?: string;
      '@microsoft.graph.downloadUrl'?: string;
    };
    const url = item['@microsoft.graph.downloadUrl'];
    let text: string;
    if (url) {
      // The download URL is pre-authenticated — fetch it directly (no Authorization header).
      const dl = await fetch(url, { cache: 'no-store' });
      if (!dl.ok) throw new Error(`Download failed (HTTP ${dl.status}).`);
      text = await dl.text();
    } else {
      const res = await graph(contentPath(), { method: 'GET', cache: 'no-store' }, accessToken);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
      text = await res.text();
    }
    const snapshot = deserializeSnapshot(text);
    // Not one of our backups (foreign/corrupt file) — treat as "nothing to restore" rather than
    // wiping local data with unrelated content.
    if (!snapshot) return null;
    return { snapshot, etag: item.eTag ?? null };
  },
  async listBackups(opts?: PushOptions): Promise<BackupInfo[]> {
    const accessToken = await token(opts?.interactive ?? true);
    // Trim the payload and bypass caches so the list reflects just-made changes.
    const query = '?$top=999&$select=name,size,lastModifiedDateTime,file,eTag';
    const res = await graph(
      `${childrenPath()}${query}`,
      { method: 'GET', cache: 'no-store' },
      accessToken,
    );
    // The folder simply doesn't exist yet (nothing backed up) — no backups, not an error.
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Could not list backups (HTTP ${res.status}).`);
    const data = (await res.json()) as {
      value?: Array<{
        name?: string;
        size?: number;
        lastModifiedDateTime?: string;
        file?: unknown;
        eTag?: string;
      }>;
    };
    return (data.value ?? [])
      .filter((it) => !!it.file && !!it.name && isBackupFile(it.name))
      .map((it) => ({
        file: it.name as string,
        title: titleFromFileName(it.name as string),
        isDefault: it.name === DEFAULT_BACKUP_FILE,
        modifiedAt: it.lastModifiedDateTime ? Date.parse(it.lastModifiedDateTime) || null : null,
        size: typeof it.size === 'number' ? it.size : null,
        etag: it.eTag ?? null,
      }))
      .sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0));
  },
  async removeBackup(file: string): Promise<void> {
    const accessToken = await token();
    const res = await graph(itemPath(file), { method: 'DELETE' }, accessToken);
    // 404 = already gone; treat as success so the UI converges.
    if (!res.ok && res.status !== 404) {
      throw new Error(`Could not delete backup (HTTP ${res.status}).`);
    }
  },
  async renameBackup(file: string, newTitle: string): Promise<BackupInfo> {
    const accessToken = await token();
    const newFile = fileNameForTitle(newTitle);
    if (newFile === file) {
      return {
        file,
        title: titleFromFileName(file),
        isDefault: file === DEFAULT_BACKUP_FILE,
        modifiedAt: null,
        size: null,
        etag: null,
      };
    }
    const res = await graph(
      itemPath(file),
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // 'fail' so we never silently clobber an existing backup of the same name.
        body: JSON.stringify({ name: newFile, '@microsoft.graph.conflictBehavior': 'fail' }),
      },
      accessToken,
    );
    if (res.status === 409) {
      throw new Error(`A backup named "${titleFromFileName(newFile)}" already exists.`);
    }
    if (!res.ok) throw new Error(`Could not rename backup (HTTP ${res.status}).`);
    const item = (await res.json()) as {
      name?: string;
      size?: number;
      lastModifiedDateTime?: string;
      eTag?: string;
    };
    const name = item.name || newFile;
    return {
      file: name,
      title: titleFromFileName(name),
      isDefault: name === DEFAULT_BACKUP_FILE,
      modifiedAt: item.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) || null : null,
      size: typeof item.size === 'number' ? item.size : null,
      etag: item.eTag ?? null,
    };
  },
};
