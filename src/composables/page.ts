import { ref } from "vue";
import { onShow, onPullDownRefresh } from "@dcloudio/uni-app";
import { requireSession } from "../stores/session";
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "操作失败，请稍后重试";
}
export function usePage(load: () => Promise<void>) {
  const loading = ref(false),
    error = ref(""),
    revision = ref(0);
  let queued = false;
  async function refresh() {
    revision.value++;
    if (loading.value) {
      queued = true;
      return;
    }
    loading.value = true;
    // Coalesce filter changes into the latest read. An older response must never
    // win over a newer factory/date/source selection.
    do {
      queued = false;
      error.value = "";
      try {
        if (await requireSession()) await load();
      } catch (e) {
        error.value = errorText(e);
      }
    } while (queued);
    loading.value = false;
    uni.stopPullDownRefresh();
  }
  onShow(refresh);
  onPullDownRefresh(refresh);
  return { loading, error, refresh, revision };
}
export function go(page: string, query = "") {
  uni.navigateTo({ url: `/pages/${page}/index${query ? "?" + query : ""}` });
}
export function confirm(title: string, content: string): Promise<boolean> {
  return new Promise((resolve) =>
    uni.showModal({
      title,
      content,
      confirmColor: "#087e99",
      success: (r) => resolve(r.confirm),
    }),
  );
}
export function toast(title: string) {
  uni.showToast({ title, icon: "none", duration: 2400 });
}
