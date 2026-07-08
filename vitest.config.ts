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
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'jsdom',
  },
});
