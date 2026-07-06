<script lang="ts">
  import { onMount } from 'svelte';
  import { settings, markSynced, markRestored, setActiveBackupEtag } from '../lib/stores/settings';
  import { link } from '../lib/router';
  import {
    buildSnapshot,
    restoreSnapshot,
    serializeSnapshot,
    deserializeSnapshot,
    getOneDrive,
    reconcile,
    DEFAULT_BACKUP_FILE,
    fileNameForTitle,
    titleFromFileName,
    ConflictError,
  } from '../lib/storage/sync';
  import type { BackupInfo } from '../lib/storage/sync';
  import { autoSyncStatus, markSyncSettled } from '../lib/storage/autosync';
  import { ONEDRIVE_CLIENT_ID } from '../lib/config';
  import { refreshGames } from '../lib/stores/games';
  import { refreshPlayers } from '../lib/stores/players';
  import { showToast } from '../lib/stores/toast';
  import { relativeTime } from '../lib/util';
  import JsonIcon from '../lib/components/JsonIcon.svelte';

  let override = $state($settings.oneDriveClientId);
  let relayInput = $state($settings.relayUrl);
  let busy = $state(false);
  let signedIn = $state(false);
  let fileInput: HTMLInputElement;

  // --- multiple backups ---
  let backups = $state<BackupInfo[]>([]);
  let loadingBackups = $state(false);
  let backupBusy = $state(false);
  let newTitle = $state('');
  let renamingFile = $state<string | null>(null);
  let renameTitle = $state('');

  const activeFileName = $derived($settings.oneDriveBackupFile || DEFAULT_BACKUP_FILE);

  const configured = $derived(!!(override.trim() || ONEDRIVE_CLIENT_ID));

  const dotClass = $derived(
    $autoSyncStatus === 'syncing'
      ? 'busy'
      : $autoSyncStatus === 'pending' ||
          $autoSyncStatus === 'error' ||
          $autoSyncStatus === 'conflict'
        ? 'warn'
        : $autoSyncStatus === 'offline'
          ? 'off'
          : $settings.lastSync
            ? 'ok'
            : '',
  );

  const backupText = $derived(
    $autoSyncStatus === 'syncing'
      ? 'Syncing…'
      : $autoSyncStatus === 'conflict'
        ? 'Backup changed on another device — tap Merge'
        : $autoSyncStatus === 'pending'
          ? 'Sync pending — reconnect to OneDrive'
          : $autoSyncStatus === 'offline'
            ? 'Offline — changes will back up when you reconnect'
            : $autoSyncStatus === 'error'
              ? 'Sync failed — will retry shortly'
              : $settings.lastSync
                ? 'Synced · Backed up ' + relativeTime($settings.lastSync)
                : 'Not backed up yet',
  );

  let folderMode = $state($settings.oneDriveFolderMode);
  let customPath = $state($settings.oneDriveCustomPath);

  const cleanPath = $derived(customPath.trim().replace(/^\/+|\/+$/g, ''));
  const locationLabel = $derived(
    folderMode === 'custom'
      ? 'OneDrive / ' + (cleanPath ? cleanPath.replace(/\//g, ' / ') + ' / ' : '') + activeFileName
      : 'OneDrive / Apps / Score King / ' + activeFileName,
  );
  const prettyPath = $derived(locationLabel.replace(/ \/ /g, ' › '));

  $effect(() => {
    const mode = folderMode;
    const path = customPath.trim();
    settings.update((s) =>
      s.oneDriveFolderMode === mode && s.oneDriveCustomPath === path
        ? s
        : { ...s, oneDriveFolderMode: mode, oneDriveCustomPath: path },
    );
  });

  function errMsg(e: unknown): string {
    if (e && typeof e === 'object' && 'errorCode' in e) {
      const code = (e as { errorCode?: string }).errorCode;
      if (code === 'user_cancelled') return 'Sign-in cancelled';
      if (code === 'interaction_in_progress')
        return 'A sign-in is already in progress — give it a moment and retry';
      if (code === 'popup_window_error' || code === 'empty_window_error')
        return 'Popup blocked — allow popups for this site and retry';
    }
    return e instanceof Error ? e.message : 'Something went wrong';
  }

  onMount(async () => {
    if (!configured) return;
    try {
      const od = await getOneDrive();
      signedIn = await od.prepare();
      // Arm background auto-sync once OneDrive is connected (persisted, so it keeps
      // working across reloads; only an explicit Disconnect turns it back off).
      if (signedIn) {
        settings.update((s) => (s.oneDriveConnected ? s : { ...s, oneDriveConnected: true }));
      }
      // Confirm a sign-in that just completed via full-page redirect (shown once).
      if (signedIn && sessionStorage.getItem('sk_od_justConnected')) {
        sessionStorage.removeItem('sk_od_justConnected');
        showToast('Connected to OneDrive');
      }
      // Detect the backups already sitting in the folder. Non-interactive so a stale
      // token can't bounce the user to Microsoft just for opening Settings.
      if (signedIn) void loadBackups(false);
    } catch {
      /* not signed in yet */
    }
  });

  /** Build the on-screen list, always surfacing the active backup even if it isn't on OneDrive yet. */
  function withActive(list: BackupInfo[]): BackupInfo[] {
    if (list.some((b) => b.file === activeFileName)) return list;
    return [
      {
        file: activeFileName,
        title: titleFromFileName(activeFileName),
        isDefault: activeFileName === DEFAULT_BACKUP_FILE,
        modifiedAt: null,
        size: null,
        etag: null,
      },
      ...list,
    ];
  }

  const displayBackups = $derived(withActive(backups));

  async function loadBackups(interactive = false) {
    if (!signedIn) return;
    loadingBackups = true;
    try {
      const od = await getOneDrive();
      backups = await od.listBackups({ interactive });
    } catch (e) {
      // A background refresh that needs re-auth fails quietly; only surface on a user action.
      if (interactive) showToast(errMsg(e));
    } finally {
      loadingBackups = false;
    }
  }

  function backupMeta(b: BackupInfo): string {
    const when = b.modifiedAt ? 'Backed up ' + relativeTime(b.modifiedAt) : 'Not backed up yet';
    return b.size != null ? `${when} · ${formatSize(b.size)}` : when;
  }

  function formatSize(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  /** Create a new titled backup from the current device data and make it active. */
  async function addBackup() {
    const title = newTitle.trim();
    if (!title || backupBusy) return;
    const file = fileNameForTitle(title);
    if (displayBackups.some((b) => b.file === file)) {
      showToast('A backup with that name already exists');
      return;
    }
    backupBusy = true;
    const prev = activeFileName;
    const prevEtag = $settings.oneDriveBackupEtag;
    try {
      // New file: no eTag baseline yet, and 'create' refuses to clobber a same-named file.
      settings.update((s) => ({ ...s, oneDriveBackupFile: file, oneDriveBackupEtag: '' }));
      await performBackup({ mode: 'create' });
      newTitle = '';
      await loadBackups(true);
      showToast('Created backup “' + titleFromFileName(file) + '”');
    } catch (e) {
      settings.update((s) => ({ ...s, oneDriveBackupFile: prev, oneDriveBackupEtag: prevEtag }));
      showToast(errMsg(e));
    } finally {
      backupBusy = false;
    }
  }

  /** Switch the active backup, loading its contents onto this device. */
  async function useBackup(b: BackupInfo) {
    if (backupBusy || b.file === activeFileName) return;
    if (
      !confirm(
        'Switch to “' +
          b.title +
          '”?\n\nThis loads that backup and replaces the data on this device. Your other backups are left untouched.',
      )
    )
      return;
    backupBusy = true;
    const prev = activeFileName;
    const prevEtag = $settings.oneDriveBackupEtag;
    try {
      settings.update((s) => ({ ...s, oneDriveBackupFile: b.file, oneDriveBackupEtag: '' }));
      const od = await getOneDrive();
      const pulled = await od.pull();
      if (pulled) {
        await restoreSnapshot(pulled.snapshot);
        await refreshPlayers();
        await refreshGames();
        markRestored(Date.now());
        setActiveBackupEtag(pulled.etag);
      } else {
        setActiveBackupEtag(null);
      }
      markSyncSettled();
      await loadBackups(true);
      showToast('Now using “' + b.title + '”');
    } catch (e) {
      settings.update((s) => ({ ...s, oneDriveBackupFile: prev, oneDriveBackupEtag: prevEtag }));
      showToast(errMsg(e));
    } finally {
      backupBusy = false;
    }
  }

  function startRename(b: BackupInfo) {
    renamingFile = b.file;
    renameTitle = b.title;
  }

  function cancelRename() {
    renamingFile = null;
    renameTitle = '';
  }

  async function commitRename(b: BackupInfo) {
    const title = renameTitle.trim();
    if (!title || backupBusy) return;
    const newFile = fileNameForTitle(title);
    if (newFile === b.file) {
      cancelRename();
      return;
    }
    if (displayBackups.some((x) => x.file === newFile)) {
      showToast('A backup with that name already exists');
      return;
    }
    backupBusy = true;
    try {
      const od = await getOneDrive();
      const info = await od.renameBackup(b.file, title);
      // The file name changed — keep pointing at it if it was the active backup.
      if (b.file === activeFileName) {
        settings.update((s) => ({ ...s, oneDriveBackupFile: info.file }));
        setActiveBackupEtag(info.etag);
      }
      cancelRename();
      await loadBackups(true);
      showToast('Renamed to “' + info.title + '”');
    } catch (e) {
      showToast(errMsg(e));
    } finally {
      backupBusy = false;
    }
  }

  async function deleteBackup(b: BackupInfo) {
    if (backupBusy) return;
    if (
      !confirm(
        'Delete backup “' +
          b.title +
          '”?\nThe backup file will be removed from OneDrive.\nWARNING: This cannot be undone.',
      )
    )
      return;
    backupBusy = true;
    try {
      const od = await getOneDrive();
      await od.removeBackup(b.file);
      if (b.file === activeFileName) {
        // Fall back to another remaining backup, or the default file.
        const next = backups.find((x) => x.file !== b.file);
        settings.update((s) => ({
          ...s,
          oneDriveBackupFile: next ? next.file : DEFAULT_BACKUP_FILE,
          oneDriveBackupEtag: next?.etag ?? '',
        }));
      }
      await loadBackups(true);
      showToast('Deleted backup “' + b.title + '”');
    } catch (e) {
      showToast(errMsg(e));
    } finally {
      backupBusy = false;
    }
  }

  function saveOverride() {
    settings.update((s) => ({ ...s, oneDriveClientId: override.trim() }));
    showToast('Client ID saved');
  }

  function saveRelay() {
    settings.update((s) => ({ ...s, relayUrl: relayInput.trim() }));
    showToast(relayInput.trim() ? 'Relay URL saved' : 'Relay URL cleared');
  }

  async function connect() {
    busy = true;
    try {
      const od = await getOneDrive();
      showToast('Redirecting to Microsoft to sign in…');
      // Full-page redirect: this navigates away. Success is confirmed on return (onMount).
      await od.signIn();
    } catch (e) {
      showToast(errMsg(e));
      busy = false;
    }
  }

  async function performBackup(opts: { mode?: 'create' | 'update' } = {}) {
    const od = await getOneDrive();
    const mode = opts.mode ?? 'update';
    const { etag } = await od.push(await buildSnapshot(), {
      mode,
      // Update writes are conditional on our last-known eTag; a brand-new 'create' has none.
      baseEtag: mode === 'update' ? $settings.oneDriveBackupEtag || null : null,
    });
    signedIn = od.isSignedIn();
    markSynced(Date.now());
    setActiveBackupEtag(etag);
    markSyncSettled();
  }

  async function backup() {
    busy = true;
    try {
      await performBackup();
      void loadBackups(false);
      showToast('Backed up to OneDrive');
    } catch (e) {
      if (e instanceof ConflictError) {
        await resolveConflict();
      } else {
        showToast(errMsg(e));
      }
    } finally {
      busy = false;
    }
  }

  /**
   * The active backup changed on another device since our last sync. Merge the two
   * copies per entity (union by id, newest write wins) and write the result to both
   * sides — so edits from this device and the other one both survive. Only a same-record
   * collision falls back to last-writer-wins.
   */
  async function resolveConflict() {
    try {
      const od = await getOneDrive();
      const { etag } = await reconcile(od, { interactive: true });
      await refreshPlayers();
      await refreshGames();
      signedIn = od.isSignedIn();
      markSynced(Date.now());
      setActiveBackupEtag(etag);
      markSyncSettled();
      void loadBackups(false);
      showToast('Merged changes from your other device');
    } catch (e) {
      showToast(errMsg(e));
    }
  }

  async function resolveNow() {
    busy = true;
    try {
      await resolveConflict();
    } finally {
      busy = false;
    }
  }

  async function restore() {
    if (
      !confirm(
        "Replace this device with the backup?\n\nThis discards anything on this device that isn't in the backup — it does not merge. Your edits and other devices' changes normally sync automatically, so you rarely need this. Continue?",
      )
    )
      return;
    busy = true;
    try {
      const od = await getOneDrive();
      const pulled = await od.pull();
      if (!pulled) {
        // The file is missing on OneDrive (never created, or deleted). We're still connected —
        // offer to create the backup from local data instead of leaving the user stuck.
        if (confirm('No backup found in OneDrive. Back up your current data there now?')) {
          await performBackup();
          showToast('Backed up to OneDrive');
        } else {
          showToast('No backup found in OneDrive');
        }
        return;
      }
      await restoreSnapshot(pulled.snapshot);
      await refreshPlayers();
      await refreshGames();
      markRestored(Date.now());
      setActiveBackupEtag(pulled.etag);
      markSyncSettled();
      showToast('Replaced this device from the backup');
    } catch (e) {
      showToast(errMsg(e));
    } finally {
      busy = false;
    }
  }

  async function disconnect() {
    try {
      const od = await getOneDrive();
      await od.signOut();
      signedIn = false;
      // Disarm background auto-sync; manual Connect re-arms it.
      settings.update((s) => ({ ...s, oneDriveConnected: false }));
      showToast('Disconnected from OneDrive');
    } catch (e) {
      showToast(errMsg(e));
    }
  }

  async function exportJson() {
    const blob = new Blob([serializeSnapshot(await buildSnapshot())], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'score-king-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const snap = deserializeSnapshot(await file.text());
      if (!snap) {
        showToast('Invalid backup file');
        return;
      }
      if (!confirm('Replace local data with this file?')) return;
      await restoreSnapshot(snap);
      await refreshPlayers();
      await refreshGames();
      showToast('Imported backup');
    } catch {
      showToast('Invalid backup file');
    }
  }
</script>

<h1>Settings</h1>

<div class="section-title">Gameplay</div>
<a class="card navrow row spread" href="/gameplay" use:link>
  <span class="row" style="gap: 12px">
    <span class="navico" aria-hidden="true">🎲</span>
    <span class="navmeta">
      <span class="navname">Gameplay</span>
      <span class="muted sm">Keep screen awake, privacy peek-guard</span>
    </span>
  </span>
  <span class="chev" aria-hidden="true">›</span>
</a>

<div class="section-title">Display & accessibility</div>
<a class="card navrow row spread" href="/accessibility" use:link>
  <span class="row" style="gap: 12px">
    <span class="navico" aria-hidden="true">👁️</span>
    <span class="navmeta">
      <span class="navname">Accessibility &amp; display</span>
      <span class="muted sm">Theme, text size, contrast, motion, colour-blind palette</span>
    </span>
  </span>
  <span class="chev" aria-hidden="true">›</span>
</a>

<div class="section-title">OneDrive backup</div>
<div class="card stack">
  {#if !configured}
    <div class="muted sm">
      OneDrive sync isn't enabled in this build yet. Your scores are still saved on this device,
      and you can use the local JSON backup below. (To turn on OneDrive, add the app's client ID
      under Advanced or in <code>src/lib/config.ts</code>.)
    </div>
  {:else}
    {#if signedIn}
      <div class="row spread">
        <span class="row provider" style="gap: 9px">
          <svg class="od-logo" viewBox="0 0 24 24" width="22" height="22" role="img" aria-label="OneDrive">
            <path
              fill="#0078D4"
              d="M19.35 10.04A7.49 7.49 0 0 0 12 4 7.49 7.49 0 0 0 5.1 8.36 5.994 5.994 0 0 0 6 20h13a4.99 4.99 0 0 0 .35-9.96z"
            />
          </svg>
          <strong>Connected to OneDrive</strong>
        </span>
        <button class="btn small ghost" onclick={disconnect}>Disconnect</button>
      </div>

      <label class="sw-row row spread">
        <span>Automatically sync changes</span>
        <span class="switch">
          <input
            type="checkbox"
            checked={$settings.autoSync}
            onchange={(e) =>
              settings.update((s) => ({ ...s, autoSync: e.currentTarget.checked }))}
          />
          <span class="track"><span class="thumb"></span></span>
        </span>
      </label>
      <span class="muted sm">
        Backs up your edits and pulls in changes from your other devices — on open, on
        focus, and when you reconnect. Same-record edits keep the newest; nothing is lost.
      </span>

      <div class="pathchip" title={locationLabel}>
        <JsonIcon size={18} />
        <code>{prettyPath}</code>
      </div>

      <hr class="sep" />

      <div class="syncrow row spread">
        <span class="row" style="gap: 8px; min-width: 0">
          <span class="dot {dotClass}"></span>
          <span class="sm">{backupText}</span>
        </span>
        {#if $autoSyncStatus === 'conflict'}
          <button class="btn small primary" onclick={resolveNow} disabled={busy}>Merge</button>
        {:else}
          <button class="btn small primary" onclick={backup} disabled={busy}>Sync now</button>
        {/if}
      </div>

      <div class="syncrow stack" style="gap: 6px">
        <div class="row spread">
          <span class="sm muted">Replace this device with a backup</span>
          <button class="btn small ghost danger" onclick={restore} disabled={busy}>
            Replace…
          </button>
        </div>
        <span class="muted sm">
          Escape hatch — a one-way overwrite that discards anything on this device that isn't
          in the chosen backup. You rarely need this; syncing above is automatic and merges
          both sides.
        </span>
      </div>

      <hr class="sep" />

      <div class="stack" style="gap: 10px">
        <div class="row spread">
          <div class="fieldlabel" style="margin: 0">Backups</div>
          <button class="btn small ghost" onclick={() => loadBackups(true)} disabled={loadingBackups}>
            {loadingBackups ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <span class="muted sm">
          Each backup is its own JSON file in this folder — keep one per group or occasion. The active
          one is what auto-sync, Sync now, and Restore now use.
        </span>

        <div class="bklist" role="list">
          {#each displayBackups as b (b.file)}
            {@const isActive = b.file === activeFileName}
            <div class="bkrow" class:active={isActive} role="listitem">
              {#if renamingFile === b.file}
                <input
                  class="bkrename"
                  type="text"
                  maxlength="60"
                  bind:value={renameTitle}
                  aria-label="Backup title"
                  onkeydown={(e) => {
                    if (e.key === 'Enter') commitRename(b);
                    if (e.key === 'Escape') cancelRename();
                  }}
                />
                <div class="bkactions">
                  <button class="btn small" onclick={() => commitRename(b)} disabled={backupBusy}>
                    Save
                  </button>
                  <button class="btn small ghost" onclick={cancelRename} disabled={backupBusy}>
                    Cancel
                  </button>
                </div>
              {:else}
                <button
                  class="bkmain"
                  onclick={() => useBackup(b)}
                  disabled={backupBusy || isActive}
                  aria-pressed={isActive}
                  title={isActive ? 'Active backup' : 'Switch to this backup'}
                >
                  <span class="bkmark" class:on={isActive} aria-hidden="true"></span>
                  <span class="bkmeta">
                    <span class="bktitle">
                      <span class="bkname">{b.title}</span>
                      {#if isActive}<span class="pill bkpill">Active</span>{/if}
                      {#if b.isDefault}<span class="pill">Default</span>{/if}
                    </span>
                    <span class="muted sm">{backupMeta(b)}</span>
                  </span>
                </button>
                <div class="bkactions">
                  <button
                    class="iconbtn bkicon"
                    onclick={() => startRename(b)}
                    disabled={backupBusy}
                    title="Rename backup"
                    aria-label={'Rename ' + b.title}
                  >
                    ✏️
                  </button>
                  <button
                    class="iconbtn bkicon"
                    onclick={() => deleteBackup(b)}
                    disabled={backupBusy}
                    title="Delete backup"
                    aria-label={'Delete ' + b.title}
                  >
                    🗑️
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>

        <form
          class="bkadd row"
          onsubmit={(e) => {
            e.preventDefault();
            addBackup();
          }}
        >
          <input
            class="bkadd-input"
            type="text"
            maxlength="60"
            bind:value={newTitle}
            placeholder="New backup title, e.g. Friday Night Crew"
            aria-label="New backup title"
          />
          <button class="btn small" type="submit" disabled={backupBusy || !newTitle.trim()}>
            Add backup
          </button>
        </form>
      </div>
    {:else}
      <div class="muted sm">
        Sign in with your Microsoft account to back up your scores to OneDrive.
      </div>
      <button class="btn primary" onclick={connect} disabled={busy}>Connect OneDrive</button>
    {/if}
  {/if}

  <hr class="sep" />

  <details>
    <summary class="muted sm">Advanced</summary>
    <div class="stack" style="margin-top: 12px; gap: 16px">
      <div class="stack" style="gap: 10px">
        <div class="fieldlabel">Where your data is stored</div>

        <label class="opt">
          <input type="radio" name="odmode" value="app" bind:group={folderMode} />
          <span class="optbody">
            <strong>App folder <span class="tag">recommended</span></strong>
            <span class="muted sm block">
              Score King can access only its own folder
              (<code>OneDrive › Apps › Score King</code>). It cannot see or touch anything else in
              your OneDrive. Grants only the sandboxed <code>Files.ReadWrite.AppFolder</code>
              permission to the Apps folder.
            </span>
          </span>
        </label>

        <label class="opt">
          <input type="radio" name="odmode" value="custom" bind:group={folderMode} />
          <span class="optbody">
            <strong>Custom folder</strong>
            <span class="muted sm block">
              Store your backups anywhere you like — Score King treats every
              <code>.json</code> file in this folder as a backup it can read and write.
              Microsoft can't limit access to a single folder, so this grants the broader
              <code>Files.ReadWrite</code> permission to your entire OneDrive.
            </span>
          </span>
        </label>

        {#if folderMode === 'custom'}
          <input
            type="text"
            bind:value={customPath}
            placeholder="Folder path, e.g. Documents/Games (blank = OneDrive root)"
          />
        {/if}

        <div class="muted sm row" style="gap: 8px">
          <JsonIcon size={16} />
          <code>{locationLabel}</code>
        </div>
        <div class="muted sm">
          Changing this may ask you to approve the new permission the next time you back up.
        </div>
      </div>

      <hr class="sep" />

      <div class="stack" style="gap: 10px">
        <div class="fieldlabel">Use your own Azure app Client ID</div>
        <div class="muted sm">
          Don't trust us at all? No hard feelings! Override the built-in Azure app registration with
          your own. See our <a
            href="https://github.com/jrmoulckers/score-king/blob/main/README.md#onetime-developer-setup-register-the-shared-app"
            target="_blank"
            rel="noopener noreferrer">README</a
          > for registration steps. Leave blank to use the default.
        </div>
        <input
          type="text"
          bind:value={override}
          placeholder="00000000-0000-0000-0000-000000000000"
        />
        <button class="btn small" onclick={saveOverride}>Save ID</button>
      </div>

      <hr class="sep" />

      <div class="stack" style="gap: 10px">
        <div class="fieldlabel">Live play relay URL</div>
        <div class="muted sm">
          Play a live game together across different devices. Deploy the tiny relay in
          <code>relay/</code> (see its <a
            href="https://github.com/jrmoulckers/score-king/blob/main/relay/README.md"
            target="_blank"
            rel="noopener noreferrer">README</a
          >) and paste its <code>wss://</code> address here — the same one on every device that
          plays together. Leave blank to keep live play to this browser only.
        </div>
        <input type="text" bind:value={relayInput} placeholder="wss://your-relay.workers.dev" />
        <button class="btn small" onclick={saveRelay}>Save relay</button>
      </div>
    </div>
  </details>
</div>

<div class="section-title">Local backup</div>
<div class="card row wrap" style="gap: 10px">
  <button class="btn grow" onclick={exportJson}>Export JSON</button>
  <button class="btn grow" onclick={() => fileInput.click()}>Import JSON</button>
  <input
    bind:this={fileInput}
    type="file"
    accept="application/json"
    style="display: none"
    onchange={importJson}
  />
</div>

<div class="section-title">About</div>
<div class="card muted sm">
  Score King · a local-first scorekeeping PWA. Your data lives on this device and, when you connect
  it, a JSON backup in your own OneDrive.
</div>

<style>
  .sm {
    font-size: 0.82rem;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: inline-block;
    background: var(--muted);
  }
  .dot.ok {
    background: #29c785;
  }
  .dot.busy {
    background: #f7b955;
  }
  .dot.warn {
    background: var(--bad, #f87171);
  }
  .dot.off {
    background: var(--muted);
  }
  .rdot {
    width: 9px;
    height: 9px;
    flex: none;
    display: block;
  }
  .od-logo {
    flex: none;
    display: block;
  }
  .provider strong {
    font-weight: 600;
  }
  .pathchip {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 7px 10px;
    border: 1px solid var(--border, rgba(127, 127, 127, 0.2));
    border-radius: 8px;
    background: var(--surface-2, rgba(127, 127, 127, 0.08));
  }
  .pathchip code {
    background: none;
    padding: 0;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: inherit;
  }
  .sw-row {
    cursor: pointer;
  }
  .switch {
    position: relative;
    display: inline-flex;
    flex: none;
  }
  .switch input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .track {
    width: 40px;
    height: 22px;
    border-radius: 999px;
    background: var(--surface-3, rgba(127, 127, 127, 0.3));
    border: 1px solid var(--border, rgba(127, 127, 127, 0.2));
    display: inline-flex;
    align-items: center;
    padding: 2px;
    transition: background 0.15s ease;
  }
  .thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s ease;
  }
  .switch input:checked + .track {
    background: var(--primary);
    border-color: var(--primary);
  }
  .switch input:checked + .track .thumb {
    transform: translateX(18px);
  }
  .switch input:focus-visible + .track {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  details summary {
    cursor: pointer;
  }
  .block {
    display: block;
    margin-top: 4px;
  }
  .sep {
    border: none;
    border-top: 1px solid var(--border, rgba(127, 127, 127, 0.2));
    margin: 4px 0;
    width: 100%;
  }
  .opt {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    cursor: pointer;
  }
  .opt input {
    margin-top: 3px;
    flex: none;
  }
  .optbody {
    display: block;
  }
  .tag {
    font-size: 0.64rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: #29c785;
    color: #04150d;
    padding: 1px 6px;
    border-radius: 999px;
    vertical-align: middle;
    margin-left: 4px;
  }
  code {
    font-size: 0.78rem;
    background: var(--surface-2, rgba(127, 127, 127, 0.15));
    padding: 1px 5px;
    border-radius: 5px;
  }
  .navrow {
    text-decoration: none;
    color: var(--text);
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .navrow:hover {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 6%, var(--surface));
  }
  .navico {
    font-size: 1.4rem;
    line-height: 1;
    flex: none;
  }
  .navmeta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .navname {
    font-weight: 700;
  }
  .chev {
    font-size: 1.5rem;
    color: var(--muted);
    flex: none;
  }

  /* --- multiple backups --- */
  .bklist {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .bkrow {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .bkrow.active {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, var(--surface-2));
  }
  .bkmain {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .bkmain:not(:disabled):hover {
    background: var(--surface-3);
  }
  .bkmain:disabled {
    cursor: default;
  }
  .bkmark {
    flex: none;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    border: 2px solid var(--muted);
    box-sizing: border-box;
  }
  .bkmark.on {
    border-color: var(--primary);
    background: var(--primary);
    box-shadow: inset 0 0 0 3px var(--surface);
  }
  .bkmeta {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .bktitle {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  .bkname {
    font-weight: 600;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .bkpill {
    color: var(--primary);
    border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
    background: color-mix(in srgb, var(--primary) 12%, var(--surface-2));
  }
  .bkactions {
    display: flex;
    gap: 4px;
    flex: none;
  }
  .bkicon {
    width: 38px;
    height: 38px;
    font-size: 1rem;
  }
  .bkicon:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .bkrename {
    flex: 1 1 auto;
    min-width: 0;
  }
  .bkadd {
    gap: 8px;
  }
  .bkadd-input {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
