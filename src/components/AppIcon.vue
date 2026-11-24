<script setup lang="ts">
import { computed } from "vue";
const props = withDefaults(
  defineProps<{ name: string; size?: number; color?: string }>(),
  { size: 23, color: "#91e6f3" },
);
// Lucide icons, ISC license in assets/LUCIDE-LICENSE. Reused across Android and H5.
const paths: Record<string, string> = {
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-up": '<path d="m6 15 6-6 6 6"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2M8 18h2"/>',
  home: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  warehouse: '<path d="M3 21V7l9-4 9 4v14M3 10h18M7 21v-7h10v7M7 17h10"/>',
  scan: '<path d="M4 9V5a1 1 0 0 1 1-1h4m6 0h4a1 1 0 0 1 1 1v4m0 6v4a1 1 0 0 1-1 1h-4m-6 0H5a1 1 0 0 1-1-1v-4M3 12h18"/>',
  "qr-scan": '<path d="M3 7V4a1 1 0 0 1 1-1h3m10 0h3a1 1 0 0 1 1 1v3m0 10v3a1 1 0 0 1-1 1h-3m-10 0H4a1 1 0 0 1-1-1v-3"/><rect x="6" y="6" width="4" height="4" rx="0.5"/><rect x="14" y="6" width="4" height="4" rx="0.5"/><rect x="6" y="14" width="4" height="4" rx="0.5"/><path d="M14 14h4M14 17v1h1M18 17v1"/>',
  records:
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 11h6M9 15h6"/>',
  mine: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  RAW_WOOD: '<path d="m10 2-6 8h3l-4 6h6v6m5-19 6 8h-3l4 6h-6v5M9 16h3"/>',
  PEELING: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  DRYING:
    '<path d="M9 3v11a4 4 0 1 0 4 0V3a2 2 0 0 0-4 0M11 11v6M17 5h3M18 10l2 1M18 2l2-1"/><circle cx="11" cy="18" r="1"/>',
  WOOD_CORE:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  WHITE_BARK:
    '<path d="M20 4c-5 0-12 0-15 5a7 7 0 0 0 10 10c5-3 5-10 5-15ZM4 21 15 10"/>',
  print:
    '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6zM18 12h1"/>',
  statistics: '<path d="M3 3v18h18M7 16v-5M12 16V7M17 16v-9"/>',
};
const source = computed(
  () =>
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${props.color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[props.name] || paths.records}</svg>`)}`,
);
</script>
<template>
  <image
    :src="source"
    :style="{ width: size + 'px', height: size + 'px', display: 'block' }"
    :aria-label="name"
  />
</template>
