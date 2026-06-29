import { mount } from 'svelte'
import { registerSW } from 'virtual:pwa-register'
import './app.css'
import App from './App.svelte'
import { applyTheme } from './lib/stores/settings'

// When the OAuth popup redirects back to the app origin, finish the MSAL handshake and let it
// close instead of booting the whole SPA inside the popup window.
const authParams = new URLSearchParams(
  window.location.hash.replace(/^#/, '') + '&' + window.location.search.replace(/^\?/, ''),
)
const isAuthResponse = authParams.has('code') || authParams.has('error') || authParams.has('state')
const inPopup = !!window.opener && window.opener !== window

let app: unknown
if (isAuthResponse && inPopup) {
  import('./lib/storage/onedrive').then((m) => m.finishPopup()).catch(() => {})
} else {
  applyTheme()
  registerSW({ immediate: true })
  app = mount(App, { target: document.getElementById('app')! })
}

export default app
