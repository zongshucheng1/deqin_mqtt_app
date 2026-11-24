export interface SecureSessionPort {
  get(): string;
  set(token: string): void;
  clear(): void;
}
export interface PlainSessionPort {
  get(key: string): unknown;
  set(key: string, value: string): void;
  remove(key: string): void;
}
export interface KeychainSessionBridge {
  get(): string;
  set(token: string): string;
  clear(): string;
}
export function createKeychainSessionPort(bridge: KeychainSessionBridge): SecureSessionPort {
  function decode(raw: string): string {
    const result = JSON.parse(raw);
    if (!result || result.success !== true || typeof result.token !== "string")
      throw new Error("iOS安全会话操作失败");
    return result.token;
  }
  return {
    get: () => decode(bridge.get()),
    set: (token) => { decode(bridge.set(token)); },
    clear: () => { decode(bridge.clear()); },
  };
}
export function createSessionTokenStore(
  platform: "android" | "ios" | "h5" | "unsupported",
  plain: PlainSessionPort,
  secure?: SecureSessionPort,
): SecureSessionPort {
  const key = "dq.token";
  if (platform === "android" || platform === "ios") {
    // The previous unpublished build used plain storage. Delete it without reading or migrating it.
    plain.remove(key);
    const required = () => {
      if (!secure)
        throw new Error("当前应用缺少安全会话模块，请更新完整安装包");
      return secure;
    };
    return {
      get() {
        try {
          const value = required().get();
          if (typeof value !== "string") throw new Error("INVALID_TOKEN");
          return value;
        } catch {
          throw new Error("安全会话读取失败，请更新完整安装包后重新登录");
        }
      },
      set(token) {
        if (!token || typeof token !== "string")
          throw new Error("服务器未返回有效登录会话");
        try {
          required().set(token);
        } catch {
          throw new Error("安全会话保存失败，尚未登录，请检查完整安装包");
        }
      },
      clear() {
        try {
          required().clear();
        } catch {
          throw new Error("安全会话清理失败，请检查应用安全存储后重新登录");
        }
      },
    };
  }
  if (platform === "h5")
    return {
      get: () => String(plain.get(key) || ""),
      set(token) {
        if (!token || typeof token !== "string")
          throw new Error("服务器未返回有效登录会话");
        plain.set(key, token);
      },
      clear: () => plain.remove(key),
    };
  const unsupported = () => {
    throw new Error("当前平台尚未提供安全会话存储适配");
  };
  return { get: unsupported, set: unsupported, clear: unsupported };
}
let installed: SecureSessionPort | undefined;
export function installSessionTokenStore(store: SecureSessionPort) {
  installed = store;
}
export const uniSessionStorage: PlainSessionPort = {
  get: (key) => uni.getStorageSync(key),
  set: (key, value) => uni.setStorageSync(key, value),
  remove: (key) => uni.removeStorageSync(key),
};
function active(): SecureSessionPort {
  if (installed) return installed;
  // #ifdef H5
  installed = createSessionTokenStore("h5", uniSessionStorage);
  return installed;
  // #endif
  throw new Error("安全会话存储尚未初始化，请检查完整安装包");
}
export const sessionToken: SecureSessionPort = {
  get: () => active().get(),
  set: (token) => active().set(token),
  clear: () => active().clear(),
};
