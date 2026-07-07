<script lang="ts">
  let { size = 20 }: { size?: number } = $props();
</script>

<svg
  class="jsondoc"
  viewBox="0 0 24 24"
  width={size}
  height={size}
  role="img"
  aria-label="JSON backup file"
>
  <path
    d="M6.5 3 H14.5 L19 7.5 V19.5 A1.5 1.5 0 0 1 17.5 21 H6.5 A1.5 1.5 0 0 1 5 19.5 V4.5 A1.5 1.5 0 0 1 6.5 3 Z"
    fill="#ffffff"
    stroke="#d7dae3"
    stroke-width="0.7"
  />
  <path d="M14.5 3 L19 7.5 H14.5 Z" fill="#e4e7ef" />
  <rect x="2" y="12" width="12" height="8" rx="1.6" fill="#475569" />
  <path
    d="M6.8 13.6 q-1.2 0 -1.2 1.1 v0.6 q0 0.7 -0.8 0.7 q0.8 0 0.8 0.7 v0.6 q0 1.1 1.2 1.1"
    fill="none"
    stroke="#ffffff"
    stroke-width="1"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M9.2 13.6 q1.2 0 1.2 1.1 v0.6 q0 0.7 0.8 0.7 q-0.8 0 -0.8 0.7 v0.6 q0 1.1 -1.2 1.1"
    fill="none"
    stroke="#ffffff"
    stroke-width="1"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>

<style>
  .jsondoc {
    flex: none;
    display: block;
  }
</style>
