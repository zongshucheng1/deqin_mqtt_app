<script setup lang="ts">
defineProps<{
  loading?: boolean;
  error?: string;
  empty?: boolean;
  emptyText?: string;
}>();
defineEmits<{ (e: "retry"): void }>();
</script>
<template>
  <view v-if="loading" class="empty" role="status">正在读取服务器数据…</view
  ><view v-else-if="error" class="error-box"
    ><view>{{ error }}</view
    ><button class="link" @click="$emit('retry')">重新加载</button></view
  ><view v-else-if="empty" class="empty">{{
    emptyText || "暂无符合条件的业务记录"
  }}</view
  ><slot v-else />
</template>
