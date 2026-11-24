import { test } from "node:test";
import assert from "node:assert/strict";
import { loginBackHandler } from "../src/domain/login-back";

test("空白登录页没有技术设置弹层，Android返回保留系统默认行为", async () => {
  let exits = 0;
  const handler = loginBackHandler({
    busy: () => false,
    hasInput: () => false,
    allowExit: async () => {
      throw new Error("空白页面无需确认");
    },
    exit: () => {
      exits++;
    },
  });
  assert.equal(handler(), false);
  await Promise.resolve();
  assert.equal(exits, 0);
});

test("Android登录输入退出必须确认，拒绝保留页面，明确确认才退出一次", async () => {
  let allowed = false,
    exits = 0;
  const handler = loginBackHandler({
    busy: () => false,
    hasInput: () => true,
    allowExit: async () => allowed,
    exit: () => {
      exits++;
    },
  });
  assert.equal(handler(), true);
  await Promise.resolve();
  assert.equal(exits, 0);
  allowed = true;
  assert.equal(handler(), true);
  await Promise.resolve();
  assert.equal(exits, 1);
});

test("提交中拦截Android返回，空白登录页保留原生默认退出行为", () => {
  let busy = true;
  const handler = loginBackHandler({
    busy: () => busy,
    hasInput: () => false,
    allowExit: async () => false,
    exit: () => {},
  });
  assert.equal(handler(), true);
  busy = false;
  assert.equal(handler(), false);
});
