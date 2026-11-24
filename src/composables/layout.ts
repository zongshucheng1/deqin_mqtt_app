import { onMounted, onUnmounted, ref } from "vue";
export function useWideLayout() {
  const wide = ref(uni.getSystemInfoSync().windowWidth >= 700);
  const resized = (event: UniApp.WindowResizeResult) => {
    wide.value = event.size.windowWidth >= 700;
  };
  onMounted(() => uni.onWindowResize(resized));
  onUnmounted(() => uni.offWindowResize(resized));
  return wide;
}
