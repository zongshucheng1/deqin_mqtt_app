import { sessionToken } from "./session-token";
import { deployment, currentDeploymentIdentity, deploymentRevision } from "./deployment";
import { encryptPayload } from "./encryption";
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string | number = "BUSINESS",
    public unknownResult = false,
    public field?: string,
    public errorCode?: string,
  ) {
    super(message);
  }
}
export interface ApiResponse<T> {
  code: number | string;
  msg: string;
  data: T;
  field?: string;
  errorCode?: string;
}
let redirecting = false;
function sessionExpired() {
  try {
    sessionToken.clear();
  } catch {
    uni.showToast({
      title: "安全会话清理失败，请检查应用安全存储",
      icon: "none",
    });
  }
  uni.removeStorageSync("dq.tokenExpiresAt");
  if (!redirecting) {
    redirecting = true;
    uni.reLaunch({
      url: "/pages/login/index",
      complete: () => {
        redirecting = false;
      },
    });
  }
}
export function endpoint(): string {
  const config = deployment();
  // #ifdef H5
  if (config.h5Proxy) return "";
  // #endif
  return config.apiBaseUrl;
}
export async function request<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    data?: unknown;
    auth?: boolean;
    write?: boolean;
  } = {},
): Promise<T> {
  const encrypted =
    path === "/auth/login"
      ? encryptPayload(options.data)
      : null;
  return new Promise((resolve, reject) => {
    const token = options.auth === false ? "" : sessionToken.get();
    const url = endpoint();
    const identity = currentDeploymentIdentity();
    const revision = deploymentRevision();
    uni.request({
      url: url + path,
      method: options.method || "GET",
      data: (encrypted?.body || options.data) as any,
      dataType: "text",
      timeout: 18000,
      header: {
        "Content-Type": "application/json",
        clientid: deployment().clientId,
        ...(encrypted ? { "encrypt-key": encrypted.encryptedKey } : {}),
        ...(options.auth === false
          ? {}
          : token
            ? { Authorization: "Bearer " + token }
            : {}),
      },
      success: (result) => {
        if (revision !== deploymentRevision() || identity !== currentDeploymentIdentity()) {
          reject(new ApiError("连接地址已更改，请重新加载", "DEPLOYMENT_CHANGED", !!options.write));
          return;
        }
        if (result.statusCode === 401) {
          if (options.auth !== false) sessionExpired();
          reject(
            new ApiError(
              options.auth === false
                ? "登录请求未获授权，请核对账号或联系管理员"
                : "登录已失效，请重新登录",
              401,
            ),
          );
          return;
        }
        // A gateway 5xx/invalid response may hide an already committed operation.
        if (result.statusCode >= 500) {
          reject(
            new ApiError(
              "服务器暂时不可用" + (options.write ? "，提交结果待确认" : ""),
              result.statusCode,
              !!options.write,
            ),
          );
          return;
        }
        let parsed: unknown;
        try {
          parsed =
            typeof result.data === "string"
              ? JSON.parse(result.data)
              : result.data;
        } catch {
          reject(new ApiError("服务器响应格式异常", "FORMAT", !!options.write));
          return;
        }
        // Only a genuine platform R envelope can settle a persisted write.
        // Proxies may return HTML, null, or an unrelated JSON object with HTTP 200.
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          !Object.prototype.hasOwnProperty.call(parsed, "code") ||
          !["number", "string"].includes(
            typeof (parsed as { code?: unknown }).code,
          )
        ) {
          reject(
            new ApiError(
              "服务器响应格式异常，请核对原提交结果",
              "FORMAT",
              !!options.write,
            ),
          );
          return;
        }
        const body = parsed as ApiResponse<T>;
        const message = typeof body.msg === "string" ? body.msg : "";
        const field = typeof body.field === "string" ? body.field : undefined;
        const errorCode =
          typeof body.errorCode === "string" ? body.errorCode : undefined;
        if (body.code === 401 || body.code === "401") {
          if (options.auth !== false) sessionExpired();
          reject(
            new ApiError(
              message ||
                (options.auth === false
                  ? "登录请求未获授权，请核对账号或联系管理员"
                  : "登录已失效，请重新登录"),
              401,
            ),
          );
          return;
        }
        if (body.code !== 200 && body.code !== "200") {
          const failureCode = Number(body.code);
          if (
            !Number.isInteger(failureCode) ||
            failureCode < 400 ||
            failureCode > 599
          ) {
            reject(
              new ApiError(
                "服务器响应格式异常，请核对原提交结果",
                "FORMAT",
                !!options.write,
              ),
            );
            return;
          }
          reject(
            new ApiError(
              message || "请求失败",
              body.code,
              !!options.write && failureCode >= 500,
              field,
              errorCode,
            ),
          );
          return;
        }
        if (result.statusCode < 200 || result.statusCode >= 300) {
          reject(
            new ApiError(
              message || `请求失败 (${result.statusCode})`,
              result.statusCode,
              !!options.write,
            ),
          );
          return;
        }
        if (
          !Object.prototype.hasOwnProperty.call(body, "data") ||
          body.data === undefined
        ) {
          reject(
            new ApiError(
              "服务器未返回业务结果，请核对原提交结果",
              "FORMAT",
              !!options.write,
            ),
          );
          return;
        }
        if (
          body.data &&
          typeof body.data === "object" &&
          !Array.isArray(body.data)
        ) {
          const value = body.data as Record<string, unknown>;
          const invalidId = [
            "id",
            "factoryId",
            "recordId",
            "labelId",
            "fileOssId",
            "printerId",
            "hostId",
            "userId",
          ].some((key) => value[key] != null && typeof value[key] !== "string");
          if (
            invalidId ||
            (value.quantity != null && typeof value.quantity !== "string")
          ) {
            reject(
              new ApiError(
                "服务器ID或精确数量格式异常，请核对原提交结果",
                "FORMAT",
                !!options.write,
              ),
            );
            return;
          }
        }
        resolve(body.data);
      },
      fail: () =>
        reject(
          new ApiError(
            options.write
              ? "网络中断，提交结果待确认。请保留本次请求并核对，避免重复操作。"
              : "连接服务器失败，请检查网络后重试",
            "NETWORK",
            !!options.write,
          ),
        ),
    });
  });
}
