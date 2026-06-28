<script lang="ts">
  import { settings, toggleTheme, markSynced } from '../lib/stores/settings';
  import { buildSnapshot, restoreSnapshot, getOneDrive } from '../lib/storage/sync';
  import { refreshGames } from '../lib/stores/games';
  import { refreshPlayers } from '../lib/stores/players';
  import { showToast } from '../lib/stores/toast';
  import { formatDateTime } from '../lib/util';

  let clientId = $state($settings.oneDriveClientId);
  let busy = $state(false);
  let fileInput: HTMLInputElement;

  function errMsg(e: unknown): string {
    return e instanceof Error ? e.message : 'Something went wrong';
  }

  function saveClientId() {
    settings.update((s) => ({ ...s, oneDriveClientId: clientId.trim() }));
    showToast('Client ID saved');
  }

  async function push() {
    busy = true;
    try {
      const od = await getOneDrive();
      if (!od.isConfigured()) {
        showToast('Enter and save your client ID first');
        return;
      }
      await od.push(await buildSnapshot());
      markSynced(Date.now());
      showToast('Backed up to OneDrive');
    } catch (e) {
      showToast(errMsg(e));
    } finally {
      busy = false;
    }
  }

  async function pull() {
    if (!confirm('Replace local data with the OneDrive backup?')) return;
    busy = true;
    try {
      const od = await getOneDrive();
      const snap = await od.pull();
      if (!snap) {
        showToast('No backup found in OneDrive');
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

  async function signOut() {
    try {
      const od = await getOneDrive();
      await od.signOut();
      showToast('Signed out of OneDrive');
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
  <div>
    <label for="cid">Azure app client ID</label>
    <input id="cid" type="text" bind:value={clientId} placeholder="00000000-0000-0000-0000-000000000000" />
    <div class="muted" style="font-size: 0.8rem; margin-top: 4px">
      One-time setup: register a free Azure app (SPA, redirect URI = this site) and paste its
      client ID. See the README for steps.
    </div>
  </div>
  <div class="row wrap" style="gap: 10px">
    <button class="btn" onclick={saveClientId}>Save ID</button>
    <button class="btn primary grow" onclick={push} disabled={busy}>Back up now</button>
    <button class="btn grow" onclick={pull} disabled={busy}>Restore</button>
  </div>
  <div class="row spread">
    <span class="muted sm">
      {$settings.lastSync ? 'Last backup ' + formatDateTime($settings.lastSync) : 'Never backed up'}
    </span>
    <button class="btn small ghost" onclick={signOut}>Sign out</button>
  </div>
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
  Score King · a local-first scorekeeping PWA. Your data lives on this device and, when you set it
  up, your OneDrive Excel workbook.
</div>

<style>
  .sm {
    font-size: 0.82rem;
  }
</style>
