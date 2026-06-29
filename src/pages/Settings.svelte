<script lang="ts">
  import { onMount } from 'svelte';
  import { settings, toggleTheme, markSynced } from '../lib/stores/settings';
  import { buildSnapshot, restoreSnapshot, getOneDrive } from '../lib/storage/sync';
  import { ONEDRIVE_CLIENT_ID } from '../lib/config';
  import { refreshGames } from '../lib/stores/games';
  import { refreshPlayers } from '../lib/stores/players';
  import { showToast } from '../lib/stores/toast';
  import { formatDateTime } from '../lib/util';

  let override = $state($settings.oneDriveClientId);
  let busy = $state(false);
  let signedIn = $state(false);
  let fileInput: HTMLInputElement;

  const configured = $derived(!!(override.trim() || ONEDRIVE_CLIENT_ID));

  let folderMode = $state($settings.oneDriveFolderMode);
  let customPath = $state($settings.oneDriveCustomPath);

  const cleanPath = $derived(customPath.trim().replace(/^\/+|\/+$/g, ''));
  const locationLabel = $derived(
    folderMode === 'custom'
      ? 'OneDrive / ' + (cleanPath ? cleanPath.replace(/\//g, ' / ') + ' / ' : '') + 'Score King.xlsx'
      : 'OneDrive / Apps / Score King / Score King.xlsx',
  );

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
      // Confirm a sign-in that just completed via full-page redirect (shown once).
      if (signedIn && sessionStorage.getItem('sk_od_justConnected')) {
        sessionStorage.removeItem('sk_od_justConnected');
        showToast('Connected to OneDrive');
      }
    } catch {
      /* not signed in yet */
    }
  });

  function saveOverride() {
    settings.update((s) => ({ ...s, oneDriveClientId: override.trim() }));
    showToast('Client ID saved');
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

  async function performBackup() {
    const od = await getOneDrive();
    await od.push(await buildSnapshot());
    signedIn = od.isSignedIn();
    markSynced(Date.now());
  }

  async function backup() {
    busy = true;
    try {
      await performBackup();
      showToast('Backed up to OneDrive');
    } catch (e) {
      showToast(errMsg(e));
    } finally {
      busy = false;
    }
  }

  async function restore() {
    if (!confirm('Replace local data with the OneDrive backup?')) return;
    busy = true;
    try {
      const od = await getOneDrive();
      const snap = await od.pull();
      if (!snap) {
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
      await restoreSnapshot(snap);
      await refreshPlayers();
      await refreshGames();
      showToast('Restored from OneDrive');
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
      showToast('Disconnected from OneDrive');
    } catch (e) {
      showToast(errMsg(e));
    }
  }

  async function exportJson() {
    const snap = await buildSnapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
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
      const snap = JSON.parse(await file.text());
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

<div class="section-title">Appearance</div>
<div class="card row spread">
  <span>Theme</span>
  <button class="btn" onclick={toggleTheme}>
    {$settings.theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
  </button>
</div>

<div class="section-title">OneDrive backup (Excel)</div>
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
        <span class="row" style="gap: 8px">
          <span class="dot ok"></span> Connected to OneDrive
        </span>
        <button class="btn small ghost" onclick={disconnect}>Disconnect</button>
      </div>
      <div class="row wrap" style="gap: 10px">
        <button class="btn primary grow" onclick={backup} disabled={busy}>Back up now</button>
        <button class="btn grow" onclick={restore} disabled={busy}>Restore</button>
      </div>
      <div class="muted sm">
        {$settings.lastSync ? 'Last backup ' + formatDateTime($settings.lastSync) : 'Not backed up yet'}
      </div>
    {:else}
      <div class="muted sm">
        Sign in with your Microsoft account to back up your scores to a <code>Score King.xlsx</code>
        file in your own OneDrive. You can open it in Excel anytime.
      </div>
      <button class="btn primary" onclick={connect} disabled={busy}>Connect OneDrive</button>
    {/if}

    <hr class="sep" />

    <div class="stack" style="gap: 10px">
      <div class="fieldlabel">Where your data is stored</div>

      <label class="opt">
        <input type="radio" name="odmode" value="app" bind:group={folderMode} />
        <span class="optbody">
          <strong>App folder <span class="tag">recommended</span></strong>
          <span class="muted sm block">
            Score King can access <strong>only its own folder</strong>
            (<code>OneDrive › Apps › Score King</code>) — it cannot see or touch anything else in
            your OneDrive. Grants the sandboxed <code>Files.ReadWrite.AppFolder</code> permission.
          </span>
        </span>
      </label>

      <label class="opt">
        <input type="radio" name="odmode" value="custom" bind:group={folderMode} />
        <span class="optbody">
          <strong>Custom folder</strong>
          <span class="muted sm block">
            Store the workbook anywhere you like. Microsoft can't limit access to a single folder,
            so this grants the broader <code>Files.ReadWrite</code> permission — the app could
            <strong>technically</strong> reach all of your OneDrive files, even though it only ever
            reads and writes its own <code>Score King.xlsx</code>.
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

      <div class="muted sm">📄 <code>{locationLabel}</code></div>
      <div class="muted sm">
        Changing this may ask you to approve the new permission the next time you back up.
      </div>
    </div>
  {/if}

  <details>
    <summary class="muted sm">Advanced: use your own client ID</summary>
    <div class="stack" style="margin-top: 10px">
      <input
        type="text"
        bind:value={override}
        placeholder="00000000-0000-0000-0000-000000000000"
      />
      <div class="muted sm">
        Override the built-in app with your own Azure app registration. Leave blank to use the
        default. See the README for registration steps.
      </div>
      <button class="btn small" onclick={saveOverride}>Save ID</button>
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
  it, your own OneDrive Excel workbook.
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
</style>
