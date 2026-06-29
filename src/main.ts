import { mount } from 'svelte'
import { registerSW } from 'virtual:pwa-register'
import './app.css'
import App from './App.svelte'
import { applyTheme } from './lib/stores/settings'

// When this document is the OAuth sign-in popup returning from Microsoft, do NOT boot the SPA or
// touch MSAL: the opener window owns the result and will read the URL and close this popup. Booting
// the app (or calling handleRedirectPromise here) would consume/clear the response and the opener
// would hang. So we simply leave a blank page.
const authParams = new URLSearchParams(
  window.location.hash.replace(/^#/, '') + '&' + window.location.search.replace(/^\?/, ''),
)
const isAuthResponse = authParams.has('code') || authParams.has('error') || authParams.has('state')
const inPopup = !!window.opener && window.opener !== window

let app: unknown
if (!(isAuthResponse && inPopup)) {
  applyTheme()
  registerSW({ immediate: true })
  app = mount(App, { target: document.getElementById('app')! })
}

export default app
