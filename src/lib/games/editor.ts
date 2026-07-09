import type { Component } from 'svelte';
import LazyEditor from '../components/LazyEditor.svelte';

/**
 * A code-splitting seam for game round editors.
 *
 * Each game's heavy `RoundEditor` Svelte component used to be a *static* import inside its
 * `index.ts`, so the eager auto-discovery registry (see `registry.ts`) pulled every editor into
 * the initial bundle. Instead every module now carries an {@link EditorLoader} — a dynamic
 * `import()` Vite splits into a per-game chunk — and points its `RoundEditor` field at the shared
 * {@link LazyEditor} wrapper below. The catalog, Home and the registry therefore load only game
 * *logic*; an editor's code is fetched the moment it's actually rendered on the play screen.
 *
 * The `RoundEditor` field is kept (pointing at the shared wrapper) so the GameModule contract and
 * its tests are unchanged; render sites resolve the real editor through `module.editorLoader`.
 */
export type EditorLoader = () => Promise<{ default: Component<any> }>;

/** The shared round-editor host every game reuses as its `RoundEditor`. */
export const RoundEditor = LazyEditor as unknown as Component<any>;
