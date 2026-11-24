<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
withDefaults(
  defineProps<{
    direction?: "down" | "right" | "left" | "up";
    variant?: "soft" | "plain";
    size?: number;
    color?: string;
  }>(),
  { direction: "down", variant: "soft", size: 16, color: "#91e6f3" },
);
</script>
<template>
  <view
    class="app-arrow"
    :class="'app-arrow-' + variant"
    :style="{
      width: (variant === 'soft' ? size + 4 : size) + 'px',
      height: (variant === 'soft' ? size + 4 : size) + 'px',
    }"
    aria-hidden="true"
    ><AppIcon :name="'chevron-' + direction" :size="size" :color="color"
  /></view>
</template>
