<script lang="ts">
  let { size = 20 }: { size?: number } = $props();
</script>

<svg
  class="xlsx"
  viewBox="0 0 24 24"
  width={size}
  height={size}
  role="img"
  aria-label="Excel workbook"
>
  <path
    d="M6.5 3 H14.5 L19 7.5 V19.5 A1.5 1.5 0 0 1 17.5 21 H6.5 A1.5 1.5 0 0 1 5 19.5 V4.5 A1.5 1.5 0 0 1 6.5 3 Z"
    fill="#ffffff"
    stroke="#d7dae3"
    stroke-width="0.7"
  />
  <path d="M14.5 3 L19 7.5 H14.5 Z" fill="#e4e7ef" />
  <rect x="2" y="12" width="12" height="8" rx="1.6" fill="#107c41" />
  <path
    d="M5.7 13.9 L10.3 18.1 M10.3 13.9 L5.7 18.1"
    stroke="#ffffff"
    stroke-width="1.7"
    stroke-linecap="round"
    fill="none"
  />
</svg>

<style>
  .xlsx {
    flex: none;
    display: block;
  }
</style>
