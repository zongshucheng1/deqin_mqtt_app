import { defineStore } from "pinia";
import type { Context, Factory } from "../domain/types";
import { request, endpoint } from "../services/http";
import { nativeHost,devicePrinting } from "../services/native";
import { requestScope } from "../domain/scope";
import { sessionToken } from "../services/session-token";
import { assertContext, platformRoleText } from "../domain/authorization";
import { apiIdentity } from "../services/deployment";
export const useSession = defineStore("session", {
  state: () => ({
    context: null as Context | null,
    factoryId: "",
    ready: false,
    loadGeneration: 0,
  }),
  getters: {
    factory: (state): Factory | undefined =>
      state.context?.factories.find((f) => f.factoryId === state.factoryId),
    manager: (state) =>
      !!state.ready &&
      state.context?.capabilities.manage === true &&
      !!state.context.factories.some((f) => f.factoryId === state.factoryId),
    worker: (state) =>
      !!state.ready &&
      state.context?.capabilities.work === true &&
      !!state.context.factories.some((f) => f.factoryId === state.factoryId),
    roleLabel: (state) => platformRoleText(state.context?.roleNames),
  },
  actions: {
    // Bind caches and journals to the actual immutable deployment, even when H5 uses a proxy.
    currentScope(): string {
      if (!this.ready || !this.context || !this.factory) return "";
      return requestScope(
        apiIdentity(),
        this.context.tenantId,
        this.context.userId,
        this.factoryId,
      );
    },
    restore() {
      this.factoryId = uni.getStorageSync("dq.factoryId") || "";
    },
    async load() {
      const generation = ++this.loadGeneration;
      const origin = endpoint(),
        token = sessionToken.get();
      this.ready = false;
      this.context = null;
      const context = await request<Context>("/inout/context");
      if (
        generation !== this.loadGeneration ||
        origin !== endpoint() ||
        token !== sessionToken.get()
      )
        throw new Error("登录身份已变化，请重新读取工厂授权");
      assertContext(context);
      if (!context.capabilities.work)
        throw new Error("当前账号尚未获准出入库作业，请在平台角色管理中授权");
      if (!context.factories.length) {
        this.context = null;
        this.ready = false;
        sessionToken.clear();
        throw new Error(
          context.permissions.includes("*:*:*")
            ? "当前客户暂无启用工厂，请在Web的APP管理→工厂管理维护"
            : "当前账号尚未分配工厂作业权限，请联系管理员或切换账号",
        );
      }
      this.context = context;
      const selected = uni.getStorageSync(this.selectionKey());
      if (typeof selected === "string") this.factoryId = selected;
      if (!context.factories.some((f) => f.factoryId === this.factoryId))
        this.factoryId = context.factories[0]?.factoryId || "";
      uni.setStorageSync(this.selectionKey(), this.factoryId);
      this.ready = true;
    },
    selectionKey(): string {
      return (
        "dq.factoryId:" +
        JSON.stringify([
          apiIdentity(),
          this.context?.tenantId,
          this.context?.userId,
        ])
      );
    },
    selectFactory(id: string) {
      if (!this.context?.factories.some((f) => f.factoryId === id))
        throw new Error("无权访问该工厂");
      if (id !== this.factoryId) {
        try {
          devicePrinting.stop();
          const status = nativeHost.status();
          if (status.running) {
            nativeHost.stop();
            nativeHost.clear();
            uni.showToast({
              title: "工厂已切换，原手机采集执行已停止",
              icon: "none",
            });
          }
        } catch {
          /* Native state never changes authorized query scope. */
        }
        uni.removeStorageSync("dq.hostId");
      }
      this.factoryId = id;
      uni.setStorageSync(this.selectionKey(), id);
    },
    can(permission: string) {
      return (
        this.context?.permissions.some(
          (p) => p === "*:*:*" || p === permission,
        ) || false
      );
    },
    logout() {
      this.loadGeneration++;
      try {
        devicePrinting.stop();
        nativeHost.stop();
        nativeHost.clear();
      } catch {
        /* A missing native module cannot prevent session removal. */
      }
      request("/auth/logout", { method: "POST" }).catch(() => {});
      try {
        sessionToken.clear();
      } catch (e) {
        uni.showToast({
          title: e instanceof Error ? e.message : "安全会话清理失败",
          icon: "none",
        });
      }
      uni.removeStorageSync("dq.tokenExpiresAt");
      this.context = null;
      this.ready = false;
      this.factoryId = "";
      uni.reLaunch({ url: "/pages/login/index" });
    },
  },
});
export async function requireSession(): Promise<boolean> {
  const session = useSession();
  if (!sessionToken.get()) {
    uni.reLaunch({ url: "/pages/login/index" });
    return false;
  }
  await session.load();
  if (!session.factoryId) throw new Error("当前账号未分配工厂作业权限");
  return true;
}
