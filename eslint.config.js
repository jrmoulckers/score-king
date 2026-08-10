import { svelteConfig } from '@jrmoulckers/eslint-config/svelte';

export default svelteConfig({
  // The relay is a separate Cloudflare Worker package with its own toolchain.
  ignores: ['relay/**'],
  extend: [
    {
      // Product-specific exception, not a relaxation of the shared preset.
      //
      // Score King's game catalog is a plugin architecture: `GameModule` accepts a
      // round `input` whose shape is defined by each game module, and the lazy
      // editor/page loaders hold a `Component<any>` because the concrete component
      // type is only known after the dynamic import resolves. Typing these away
      // means threading generics through every game module, which is tracked
      // separately (see issue #124). Scoped to the seam files so the rule stays
      // enforced everywhere else.
      files: [
        'src/lib/types.ts',
        'src/lib/games/editor.ts',
        'src/lib/components/ConfigForm.svelte',
        'src/lib/components/GamePresets.svelte',
        'src/lib/components/Lazy.svelte',
        'src/lib/components/LazyEditor.svelte',
        'src/lib/components/ReplicaBoard.svelte',
        'src/pages/GamePlay.svelte',
        'src/pages/GameType.svelte',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
});
