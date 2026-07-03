<script lang="ts">
  /**
   * Shows one nearby-play handshake signal for the other device to read: a QR to scan, plus a
   * copy button as a fallback. Used for both the host's invite and the guest's reply. qrcode is
   * lazy-loaded so it stays out of the core bundle. Error-correction is set low to fit these
   * larger WebRTC payloads into a still-scannable code.
   */
  import { showToast } from '../stores/toast';

  let {
    text,
    caption = 'Show this to the other device',
  }: {
    text: string;
    caption?: string;
  } = $props();

  let qr = $state('');
  $effect(() => {
    const target = text;
    if (!target) {
      qr = '';
      return;
    }
    let alive = true;
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(target, { margin: 1, width: 260, errorCorrectionLevel: 'L' }),
      )
      .then((url) => {
        if (alive) qr = url;
      })
      .catch(() => {
        if (alive) qr = '';
      });
    return () => {
      alive = false;
    };
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Code copied');
    } catch {
      showToast('Couldn’t copy the code');
    }
  }
</script>

<div class="share">
  {#if qr}
    <div class="qr"><img src={qr} alt="Code to scan with the other device" width="200" height="200" /></div>
  {/if}
  <span class="cap">{caption}</span>
  <button class="btn block" onclick={copy}>Copy code instead</button>
</div>

<style>
  .share {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .qr img {
    /* A white quiet zone is required for reliable scanning, so the QR keeps a light card in
       both themes — the same deliberate, function-first exception used by the live share sheet. */
    width: 200px;
    height: 200px;
    padding: 10px;
    border-radius: var(--radius-sm);
    background: #fff;
    box-shadow: var(--shadow);
  }
  .cap {
    font-size: 0.85rem;
    color: var(--muted);
    text-align: center;
    line-height: 1.4;
  }
</style>
