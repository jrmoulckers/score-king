import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Copy index.html to 404.html so GitHub Pages serves the SPA for deep links.
function spa404() {
  return {
    name: 'spa-404',
    closeBundle() {
      const index = resolve('dist', 'index.html')
      if (existsSync(index)) copyFileSync(index, resolve('dist', '404.html'))
    },
  }
}

// https://vite.dev/config/
// Deploy base: '/score-king/' for the github.io project URL; change to '/' when
// serving from the custom domain (and restore public/CNAME).
const base = '/score-king/'

export default defineConfig({
  base,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Score King',
        short_name: 'Score King',
        description: 'Keep score for cards and party games.',
        theme_color: '#7c5cff',
        background_color: '#0f1020',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: `${base}index.html`,
      },
    }),
    spa404(),
  ],
})
