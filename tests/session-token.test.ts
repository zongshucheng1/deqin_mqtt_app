import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSessionTokenStore,
  createKeychainSessionPort,
  type PlainSessionPort,
} from "../src/services/session-token";
function plainPort() {
  const values = new Map<string, string>([
    ["dq.token", "unpublished-plain-token"],
  ]);
  const calls = { get: 0, set: 0, remove: 0 };
  const port: PlainSessionPort = {
    get(key) {
      calls.get++;
      return values.get(key);
    },
    set(key, value) {
      calls.set++;
      values.set(key, value);
    },
    remove(key) {
      calls.remove++;
      values.delete(key);
    },
  };
  return { port, values, calls };
}
for (const platform of ["android", "ios"] as const) {
  test(`${platform}会话只用安全端口，旧明文仅删除且不读取迁移`, () => {
    const plain = plainPort();
    let secureValue = "keystore-session";
    const store = createSessionTokenStore(platform, plain.port, {
      get: () => secureValue,
      set: (value) => {
        secureValue = value;
      },
      clear: () => {
        secureValue = "";
      },
    });
    assert.equal(plain.values.has("dq.token"), false);
    assert.equal(store.get(), "keystore-session");
    store.set("new-platform-session");
    assert.equal(secureValue, "new-platform-session");
    store.clear();
    assert.equal(store.get(), "");
    assert.deepEqual(plain.calls, { get: 0, set: 0, remove: 1 });
  });
  test(`${platform}缺安全模块时拒绝读写清理，不回退普通storage`, () => {
    const plain = plainPort(),
      store = createSessionTokenStore(platform, plain.port);
    assert.throws(() => store.get(), /安全会话读取失败/);
    assert.throws(() => store.set("new-token"), /安全会话保存失败/);
    assert.throws(() => store.clear(), /安全会话清理失败/);
    assert.deepEqual(plain.calls, { get: 0, set: 0, remove: 1 });
  });
  test(`${platform}解密或写入异常保持失败且不泄露或降级为明文`, () => {
    const plain = plainPort();
    const fail = () => {
      throw new Error("sensitive-native-exception");
    };
    const store = createSessionTokenStore(platform, plain.port, {
      get: fail,
      set: fail,
      clear: fail,
    });
    for (const action of [
      () => store.get(),
      () => store.set("new-token"),
      () => store.clear(),
    ]) {
      assert.throws(
        action,
        (error: Error) =>
          /安全会话/.test(error.message) && !error.message.includes("sensitive"),
      );
    }
    assert.deepEqual(plain.calls, { get: 0, set: 0, remove: 1 });
  });
}
test("H5仅使用明确宿主存储端口，未适配平台不会默认为H5", () => {
  const plain = plainPort(),
    store = createSessionTokenStore("h5", plain.port);
  assert.equal(store.get(), "unpublished-plain-token");
  store.set("browser-session");
  assert.equal(store.get(), "browser-session");
  store.clear();
  assert.equal(store.get(), "");
  const unsupported = createSessionTokenStore("unsupported", plain.port);
  assert.throws(() => unsupported.get(), /尚未提供安全会话存储适配/);
  assert.throws(() => unsupported.set("token"), /尚未提供安全会话存储适配/);
});

test("iOS同步桥接解析Keychain结果，HTTP会话得到token而不是JSON", () => {
  const plain = plainPort();
  let token = "";
  const result = () => JSON.stringify({ success: true, token, error: "" });
  const store = createSessionTokenStore("ios", plain.port, createKeychainSessionPort({
    get: result,
    set: (value) => { token = value; return result(); },
    clear: () => { token = ""; return result(); },
  }));
  assert.equal(store.get(), "");
  store.set('signed-token-with-"quote');
  assert.equal(store.get(), 'signed-token-with-"quote');
  store.clear();
  assert.equal(store.get(), "");
  assert.deepEqual(plain.calls, { get: 0, set: 0, remove: 1 });
});

test("iOS Keychain拒绝访问或返回损坏结果时阻止登录，不使用错误串作token", () => {
  for (const raw of [
    '{"success":false,"token":"","error":"KEYCHAIN_ERROR_-25308"}',
    '{"success":true,"token":null}',
    '{"success":"true","token":"bad"}',
    'null',
    'invalid-json',
  ]) {
    const plain = plainPort();
    const reply = () => raw;
    const store = createSessionTokenStore("ios", plain.port, createKeychainSessionPort({
      get: reply, set: reply, clear: reply,
    }));
    assert.throws(() => store.get(), /安全会话读取失败/);
    assert.throws(() => store.set("token"), /安全会话保存失败/);
    assert.throws(() => store.clear(), /安全会话清理失败/);
    assert.deepEqual(plain.calls, { get: 0, set: 0, remove: 1 });
  }
});
