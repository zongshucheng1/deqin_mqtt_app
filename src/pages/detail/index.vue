<script setup lang="ts">
import { ref, computed } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import AppShell from "../../components/AppShell.vue";
import RecordDetail from "../../components/RecordDetail.vue";
import { useUnsavedExit, useGuardedBack } from "../../composables/unsaved";
import { usePageVisible } from "../../composables/page-visible";
const pageVisible = usePageVisible();
const id = ref(""),
  detail = ref<{
    refresh: () => Promise<void>;
    dirty: boolean;
    busy: boolean;
    editing: boolean;
    closeEditing: () => Promise<void>;
  }>();
const busy = computed(() => !!detail.value?.busy),
  dirty = computed(() => !!detail.value?.dirty);
const exit = useUnsavedExit(dirty, busy);
const back = useGuardedBack(exit, dirty, busy, {
  isOpen: () => !!detail.value?.editing,
  close: async () => {
    await detail.value?.closeEditing();
  },
});
onLoad((q) => {
  id.value = String(q?.id || "");
});
onShow(() => {
  exit.reset();
  detail.value?.refresh();
});
</script>
<template>
  <AppShell title="记录详情" back :back-handler="back"
    ><RecordDetail v-if="id" ref="detail" :record-id="id" :active="pageVisible"
  /></AppShell>
</template>
