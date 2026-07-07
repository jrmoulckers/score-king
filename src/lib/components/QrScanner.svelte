<script lang="ts">
  /**
   * Reads a nearby-play handshake code, two ways: point the camera at the other device's QR
   * (lazy-loaded jsQR — kept out of the core bundle), or paste the copied text. Paste is always
   * available, so the flow still works where the camera is denied, absent, or the QR is too dense
   * to focus. Emits the raw signal string; the caller decodes it.
   */
  import { onDestroy } from 'svelte';

  let {
    label = 'their code',
    onresult,
  }: {
    /** What we're reading, for the copy in the paste box (e.g. "the host's invite"). */
    label?: string;
    onresult: (text: string) => void;
  } = $props();

  let scanning = $state(false);
  let camError = $state('');
  let pasted = $state('');
  let video = $state<HTMLVideoElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let stream: MediaStream | null = null;
  let raf = 0;
  let done = false;

  const cameraCapable =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  async function startCamera() {
    camError = '';
    scanning = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (done) {
        stopCamera();
        return;
      }
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const jsQR = (await import('jsqr')).default;
      tick(jsQR);
    } catch (e) {
      // If getUserMedia succeeded but a later step (play / lazy jsQR load) threw, the camera is
      // live — release it so the indicator goes off before we fall back to paste.
      stopCamera();
      camError =
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Camera blocked — paste the code below instead.'
          : 'Couldn’t open the camera — paste the code below instead.';
    }
  }

  function tick(jsQR: typeof import('jsqr').default) {
    if (done || !scanning || !video || !canvas) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx && w && h) {
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const found = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
        if (found?.data) {
          emit(found.data);
          return;
        }
      }
    }
    raf = requestAnimationFrame(() => tick(jsQR));
  }

  function stopCamera() {
    scanning = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) video.srcObject = null;
  }

  function emit(text: string) {
    if (done) return;
    done = true;
    stopCamera();
    onresult(text.trim());
  }

  function submitPaste() {
    const text = pasted.trim();
    if (text) emit(text);
  }

  onDestroy(() => {
    done = true;
    stopCamera();
  });
</script>

<div class="scanner">
  {#if scanning}
    <div class="viewport">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} playsinline muted></video>
      <div class="frame" aria-hidden="true"></div>
    </div>
    <button class="btn block" onclick={stopCamera}>Stop camera</button>
  {:else}
    {#if cameraCapable}
      <button class="btn primary block" onclick={startCamera}>📷 Scan {label}</button>
    {/if}
    {#if camError}
      <p class="err" role="status">{camError}</p>
    {/if}
    <div class="orline"><span>or paste it</span></div>
    <textarea
      class="paste"
      bind:value={pasted}
      placeholder={`Paste ${label} here`}
      rows="2"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
    ></textarea>
    <button class="btn block" disabled={!pasted.trim()} onclick={submitPaste}>Use pasted code</button>
  {/if}
  <canvas bind:this={canvas} class="hidden"></canvas>
</div>

<style>
  .scanner {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .viewport {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    max-height: 260px;
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    border: 1px solid var(--border);
  }
  .viewport video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .frame {
    position: absolute;
    inset: 16%;
    border: 3px solid var(--good);
    border-radius: var(--radius-sm);
    box-shadow: 0 0 0 100vmax color-mix(in srgb, var(--bg) 55%, transparent);
  }
  .orline {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .orline::before,
  .orline::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  .paste {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    font-family: inherit;
    font-size: 0.9rem;
    resize: vertical;
  }
  .paste:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .err {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .hidden {
    display: none;
  }
</style>
