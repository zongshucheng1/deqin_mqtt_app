import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, request } from "../src/services/http";
import { installSessionTokenStore } from "../src/services/session-token";
import { installTestDeployment } from "./helpers/deployment";

let response: unknown;
function setup(value: unknown, statusCode = 200) {
  installTestDeployment();
  response = value;
  installSessionTokenStore({ get: () => "test-session", set() {}, clear() {} });
  (globalThis as any).uni = {
    getStorageSync: (key: string) =>
      key === "dq.server" ? "https://isolated.invalid" : "",
    request: (options: any) => options.success({ statusCode, data: response }),
  };
}
const invalid = [
  null,
  "null",
  "<html>gateway</html>",
  "{}",
  { code: 200 },
  { code: 200, data: undefined },
  { code: 0, data: {} },
  [],
];
test("只有真实R成功封装和data可结清写入，异常或缺失响应都标为结果不明", async () => {
  for (const value of invalid) {
    setup(value);
    await assert.rejects(
      request("/inout/records", { method: "POST", write: true }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.code === "FORMAT" &&
        error.unknownResult,
    );
  }
});
test("读取的协议错误保持错误，合法data:null仍可表达真实空结果", async () => {
  for (const value of invalid) {
    setup(value);
    await assert.rejects(
      request("/inout/records"),
      (error: unknown) =>
        error instanceof ApiError &&
        error.code === "FORMAT" &&
        !error.unknownResult,
    );
  }
  setup(JSON.stringify({ code: 200, data: null }));
  assert.equal(await request("/inout/print-configs/RAW_WOOD"), null);
});
test("可信字段拒绝保留field/errorCode，HTTP与成功body矛盾不能结清写入", async () => {
  setup(
    JSON.stringify({
      code: 400,
      msg: "机号无效",
      field: "detail.machineNumber",
      errorCode: "INVALID_ARGUMENT",
    }),
    400,
  );
  await assert.rejects(
    request("/inout/records", { method: "POST", write: true }),
    (error: unknown) =>
      error instanceof ApiError &&
      !error.unknownResult &&
      error.field === "detail.machineNumber" &&
      error.errorCode === "INVALID_ARGUMENT",
  );
  setup(JSON.stringify({ code: 200, data: null }), 404);
  await assert.rejects(
    request("/inout/records", { method: "POST", write: true }),
    (error: unknown) => error instanceof ApiError && error.unknownResult,
  );
});
