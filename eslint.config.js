import { svelteConfig } from '@jrmoulckers/eslint-config/svelte';

export default svelteConfig({
  // The relay is a separate Cloudflare Worker package with its own toolchain.
  ignores: ['relay/**'],
  extend: [
    {
      // Score King's game catalog is a plugin architecture: each game owns its
      // round input shape, and lazy component loaders resolve concrete types at
      // runtime. Keep the legacy seam explicit while enforcing the rule elsewhere.
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
    {
      // These Svelte prop declarations mix bindable state with immutable props
      // in one destructure, so prefer-const cannot split them safely.
      files: [
        'src/lib/components/ConfigForm.svelte',
        'src/lib/components/GamePresets.svelte',
        'src/lib/components/LazyEditor.svelte',
        'src/lib/components/PlayerSelect.svelte',
        'src/lib/components/Segmented.svelte',
        'src/lib/components/Stepper.svelte',
        'src/lib/games/*/*Editor.svelte',
        'src/lib/games/cornhole/BagTossRow.svelte',
        'src/lib/games/golf/GolfGrid.svelte',
        'src/lib/games/rummikub/TileKeypad.svelte',
      ],
      rules: {
        'prefer-const': 'off',
      },
    },
  ],
});
