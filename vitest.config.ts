import { defineConfig } from 'vitest/config';

// Isolated from vite.config.ts on purpose: the stats engine is pure TypeScript,
// so tests need neither the Svelte plugin nor the PWA service-worker build.
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node',
  },
});
