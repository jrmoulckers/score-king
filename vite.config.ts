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
// Deploy base: '/' for the score.jrmoulckers.com custom domain (served at root).
// Use '/score-king/' instead to serve from the github.io project URL.
const base = '/'

export default defineConfig({
  base,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png',
      ],
      manifest: {
        id: base,
        name: 'Score King',
        short_name: 'Score King',
        description: 'Keep score for cards and party games.',
        lang: 'en',
        dir: 'ltr',
        categories: ['games', 'entertainment', 'utilities'],
        theme_color: '#7c5cff',
        background_color: '#0f1020',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
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
