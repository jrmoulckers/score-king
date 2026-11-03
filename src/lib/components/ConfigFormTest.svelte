<script lang="ts">
  import { untrack } from 'svelte';
  import type { ConfigField } from '../types';
  import ConfigForm from './ConfigForm.svelte';

  const { fields, initial }: { fields: ConfigField[]; initial: Record<string, unknown> } = $props();
  let config = $state(untrack(() => ({ ...initial })));
</script>

<ConfigForm {fields} bind:config />
