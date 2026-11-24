import { computed, onUnmounted, ref } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";

/** A cached uni-app page can remain mounted while another page is on top. */
export function usePageVisible() {
  const shown = ref(false), documentVisible = ref(true);
  onShow(() => { shown.value = true; });
  onHide(() => { shown.value = false; });
  // #ifdef H5
  const updateVisibility = () => {
    documentVisible.value = document.visibilityState !== "hidden";
  };
  updateVisibility();
  document.addEventListener("visibilitychange", updateVisibility);
  onUnmounted(() => document.removeEventListener("visibilitychange", updateVisibility));
  // #endif
  return computed(() => shown.value && documentVisible.value);
}
