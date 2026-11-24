import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "../src/services/http";
import { installSessionTokenStore } from "../src/services/session-token";
import { installTestDeployment } from "./helpers/deployment";

let tokenReads = 0, tokenClears = 0, redirects = 0, statusCode = 401, responseCode = 401;
function setup(status: number, code: number) {
  installTestDeployment();
  tokenReads = tokenClears = redirects = 0;
  statusCode = status; responseCode = code;
  installSessionTokenStore({
    get() { tokenReads++; return "existing-session"; },
    set() {}, clear() { tokenClears++; },
  });
  (globalThis as any).uni = {
    getStorageSync: (key: string) => key === "dq.server" ? "https://isolated.invalid" : "",
    removeStorageSync() {},
    request: (options: any) => options.success({statusCode, data: JSON.stringify({code: responseCode, msg: "未授权"})}),
    reLaunch: (options: any) => { redirects++; options.complete?.(); },
    showToast() {},
  };
}
test("公开认证请求HTTP401仅拒绝，不读清安全会话或重新打开登录页", async () => {
  setup(401, 401);
  await assert.rejects(request("/auth/code", {auth: false}));
  assert.deepEqual({tokenReads, tokenClears, redirects}, {tokenReads: 0, tokenClears: 0, redirects: 0});
});
test("公开认证请求业务401保留原错误，不清空页面输入或已有会话", async () => {
  setup(200, 401);
  await assert.rejects(request("/auth/code", {auth: false}), /未授权/);
  assert.deepEqual({tokenReads, tokenClears, redirects}, {tokenReads: 0, tokenClears: 0, redirects: 0});
});
test("受保护请求401仍清理失效会话并转入登录", async () => {
  setup(401, 401);
  await assert.rejects(request("/inout/context"));
  assert.deepEqual({tokenReads, tokenClears, redirects}, {tokenReads: 1, tokenClears: 1, redirects: 1});
});
