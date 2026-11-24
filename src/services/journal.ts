import { ApiError, request } from "./http";
export interface PendingWrite {
  key: string;
  scope: string;
  operation: string;
  path: string;
  method: "POST" | "PUT" | "DELETE";
  payload: Record<string, unknown>;
  createdAt: number;
  uncertain: boolean;
}
const storageKey = "dq.pending";
export const pendingWrites = (): PendingWrite[] =>
  uni.getStorageSync(storageKey) || [];
const save = (items: PendingWrite[]) => uni.setStorageSync(storageKey, items);
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(value as object)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonical((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}
export function requestKey(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues)
    crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return (
    "app-" +
    Date.now().toString(36) +
    "-" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}
export function forgetConfirmed(key: string) {
  save(pendingWrites().filter((p) => p.key !== key));
}
function confirmMutationResult(value: unknown, operation: string) {
  const result =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  const id =
    result?.[operation.startsWith("command-review:") ? "commandId" : "id"];
  const validId = (candidate: unknown) =>
    typeof candidate === "string" && /^[1-9]\d*$/.test(candidate);
  if (
    !result ||
    !validId(id) ||
    (/^(create|outbound|delete|void):/.test(operation) &&
      (!validId(result.factoryId) || typeof result.quantity !== "string"))
  )
    throw new ApiError(
      "服务器未返回可确认的业务实体，请核对原提交结果",
      "FORMAT",
      true,
    );
}
export async function write<T>(
  scope: string,
  operation: string,
  path: string,
  method: "POST" | "PUT" | "DELETE",
  payload: Record<string, unknown>,
): Promise<T> {
  if (Object.keys(payload).some((key) => /password/i.test(key)))
    throw new Error("密码操作不能保存为持久重放请求");
  const items = pendingWrites();
  let pending = items.find(
    (p) => p.scope === scope && p.operation === operation,
  );
  const wasPending = !!pending;
  if (pending && canonical(pending.payload) !== canonical(payload))
    throw new ApiError(
      "上次提交结果尚未确认，请先到“我的 → 待确认操作”核对原请求，暂不能修改内容重建。",
      "PENDING_CONFLICT",
    );
  if (!pending) {
    pending = {
      key: requestKey(),
      scope,
      operation,
      path,
      method,
      payload,
      createdAt: Date.now(),
      uncertain: false,
    };
    items.push(pending);
    save(items);
  }
  try {
    const result = await request<T>(pending.path, {
      method: pending.method,
      data: { ...pending.payload, requestKey: pending.key },
      write: true,
    });
    confirmMutationResult(result, pending.operation);
    forgetConfirmed(pending.key);
    return result;
  } catch (error) {
    if (
      (error instanceof ApiError && error.unknownResult) ||
      pending.uncertain ||
      wasPending
    ) {
      pending.uncertain = true;
      save(pendingWrites().map((p) => (p.key === pending!.key ? pending! : p)));
    } else if (
      !(error instanceof ApiError) ||
      error.code !== "PENDING_CONFLICT"
    ) {
      forgetConfirmed(pending.key);
    }
    throw error;
  }
}
function checkScope(pending: PendingWrite, currentScope: () => string) {
  if (pending.scope !== currentScope())
    throw new ApiError(
      "服务器、租户、账号或工厂已切换，请返回原环境后核对原请求。",
      "PENDING_SCOPE_MISMATCH",
    );
}
export async function replay<T>(
  pending: PendingWrite,
  currentScope: () => string,
): Promise<T> {
  checkScope(pending, currentScope);
  if (
    !pendingWrites().some(
      (p) => p.key === pending.key && p.scope === pending.scope,
    )
  )
    throw new ApiError("此待确认请求已处理，请刷新列表。", "PENDING_NOT_FOUND");
  if (
    pending.operation.startsWith("create:") &&
    pending.payload.printingMode !== "SERVER"
  )
    throw new ApiError(
      "此为旧手机打印方式的入库请求，不能继续自动重放。原请求编号和内容已保留，请联系管理员核对旧请求。",
      "PENDING_LEGACY_PRINTING_MODE",
    );
  return write<T>(
    pending.scope,
    pending.operation,
    pending.path,
    pending.method,
    pending.payload,
  );
}
/** Typed not-committed proof permits replay only if the original mode is supported. */
export async function resolvePending<T>(
  pending: PendingWrite,
  currentScope: () => string,
): Promise<T> {
  checkScope(pending, currentScope);
  if (typeof pending.payload.factoryId !== "string")
    throw new ApiError(
      "原请求缺少有效工厂身份，不能重放。",
      "PENDING_FACTORY_MISSING",
    );
  try {
    const result = await request<{
      record?: T;
      result?: T;
      completed?: boolean;
    }>("/inout/requests/" + encodeURIComponent(pending.key), {
      data: { factoryId: pending.payload.factoryId },
    });
    checkScope(pending, currentScope);
    const value = result?.record ?? result?.result;
    if (value === undefined)
      throw new ApiError(
        "服务器未返回可核对的业务结果，请稍后重试。",
        "PENDING_RESULT_MISSING",
      );
    confirmMutationResult(value, pending.operation);
    forgetConfirmed(pending.key);
    return value;
  } catch (error) {
    checkScope(pending, currentScope);
    if (
      !(error instanceof ApiError) ||
      String(error.code) !== "404" ||
      error.errorCode !== "REQUEST_NOT_COMMITTED"
    )
      throw error;
  }
  return replay<T>(pending, currentScope);
}
