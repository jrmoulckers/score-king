<script lang="ts">
  import { announcement } from '../stores/announcer';

  // A visually hidden, polite live region mounted once at the app root. Keyed by
  // `seq` so identical consecutive messages still re-announce; `role="status"`
  // plus aria-live="polite" waits for a pause instead of interrupting.
  let text = $state('');
  let seen = -1;

  $effect(() => {
    const a = $announcement;
    if (a.seq !== seen) {
      seen = a.seq;
      // Clear first so screen readers reliably re-read a repeated message.
      text = '';
      queueMicrotask(() => (text = a.message));
    }
  });
</script>

<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{text}</div>
