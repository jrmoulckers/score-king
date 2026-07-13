import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The stats engine is pure TypeScript, but game modules re-export their scoring from
// an `index.ts` that also imports a `.svelte` round editor. Loading the Svelte plugin
// (plus a jsdom environment so shared stores that touch `localStorage`/`document` at
// import don't throw) lets those modules — and the auto-discovery registry — be
// imported directly in tests, so a new game can unit-test its real scoring functions.
// Kept isolated from vite.config.ts on purpose: no PWA/service-worker build here.
export default defineConfig({
  plugins: [svelte()],
  // Resolve the browser build of Svelte so component-mount tests (e.g. editor
  // smoke tests) run the client runtime instead of the server renderer.
  resolve: { conditions: ['browser'] },
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'jsdom',
  },
});
