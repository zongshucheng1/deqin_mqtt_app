import { onMounted, onUnmounted, watch, type Ref } from "vue";
import { onBackPress } from "@dcloudio/uni-app";
import { confirm } from "./page";

/** A form's inputs remain in memory until it is saved or leaving is explicitly confirmed. */
export function useUnsavedExit(
  dirty: Ref<boolean>,
  busy: Ref<boolean>,
  options: { route?: boolean } = {},
) {
  let accepted = false;
  let asking = false;
  async function allowLeave(): Promise<boolean> {
    if (accepted) return true;
    if (busy.value || asking) return false;
    if (!dirty.value) return true;
    asking = true;
    try {
      accepted = await confirm(
        "放弃未保存内容？",
        "当前填写内容尚未提交，离开将丢失本次输入。请选择取消继续填写，或确认放弃。",
      );
      return accepted;
    } finally {
      asking = false;
    }
  }
  function saved() {
    accepted = true;
  }
  function reset() {
    accepted = false;
  }
  watch(dirty, (value, previous) => {
    if (value && !previous) reset();
  });
  // #ifdef H5
  let removeGuard: (() => void) | undefined,
    removeAfter: (() => void) | undefined;
  let router: any,
    routePath = "",
    originalRoute = "",
    popInFlight = false,
    restorePending = false;
  // Vue Router consumes its own history rollback before this listener. In hash mode a
  // direct URL entry can have delta=0; restore the canceled form URL after that rollback,
  // without asking again or interrupting uni-app's page-stack bookkeeping.
  const popstate = () => {
    if (restorePending) {
      restorePending = false;
      popInFlight = false;
      router?.options.history.replace(originalRoute);
    } else popInFlight = true;
  };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!accepted && (dirty.value || busy.value)) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  onMounted(() => {
    if (options.route === false) return;
    router = (getApp() as any).$router;
    routePath = router?.currentRoute.value.path || "";
    originalRoute = router?.currentRoute.value.fullPath || "";
    removeGuard = router?.beforeEach(
      async (
        to: { fullPath: string },
        from: { path: string; fullPath: string },
      ) => {
        if (from.path !== routePath || to.fullPath === from.fullPath)
          return true;
        const allowed = await allowLeave();
        if (!allowed && popInFlight) restorePending = true;
        if (allowed) popInFlight = false;
        return allowed;
      },
    );
    removeAfter = router?.afterEach(
      (_to: unknown, _from: unknown, failure: unknown) => {
        if (!failure) popInFlight = false;
      },
    );
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", popstate);
  });
  onUnmounted(() => {
    removeGuard?.();
    removeAfter?.();
    window.removeEventListener("beforeunload", beforeUnload);
    window.removeEventListener("popstate", popstate);
  });
  // #endif
  return {
    allowLeave,
    saved,
    reset,
    get accepted() {
      return accepted;
    },
  };
}
export function useGuardedBack(
  exit: ReturnType<typeof useUnsavedExit>,
  dirty: Ref<boolean>,
  busy: Ref<boolean>,
  modal?: { isOpen: () => boolean; close: () => Promise<void> },
) {
  async function back() {
    if (busy.value) return;
    if (modal?.isOpen()) {
      await modal.close();
      return;
    }
    if (!(await exit.allowLeave())) return;
    if (getCurrentPages().length > 1) uni.navigateBack();
    else uni.redirectTo({ url: "/pages/home/index" });
  }
  onBackPress(() => {
    if (exit.accepted) return false;
    if (busy.value) return true;
    if (modal?.isOpen() || dirty.value) {
      back();
      return true;
    }
    return false;
  });
  return back;
}
