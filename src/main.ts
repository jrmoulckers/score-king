import { mount } from 'svelte'
import { registerSW } from 'virtual:pwa-register'
import './app.css'
import App from './App.svelte'
import { applyTheme } from './lib/stores/settings'
import { startAutoSync } from './lib/storage/autosync'

// A Microsoft sign-in uses a full-page redirect. When the browser returns from Microsoft the
// URL carries the auth response (in the hash or query). Detect that, let MSAL consume it, then
// restore the page the user started from and strip the auth fragment before booting the app.
const authParams = new URLSearchParams(
  window.location.hash.replace(/^#/, '') + '&' + window.location.search.replace(/^\?/, ''),
)
const isAuthResponse =
  authParams.has('code') || authParams.has('error') || authParams.has('state')

async function boot() {
  if (isAuthResponse) {
    try {
      const { completeRedirect } = await import('./lib/storage/onedrive')
      const back = await completeRedirect()
      window.history.replaceState({}, '', back || window.location.pathname)
    } catch {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }
  applyTheme()
  registerSW({ immediate: true })
  mount(App, { target: document.getElementById('app')! })
  // Background OneDrive auto-backup (push-only, silent; never redirects on its own).
  startAutoSync()
}

boot()
