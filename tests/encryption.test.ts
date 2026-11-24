import { test } from "node:test";
import assert from "node:assert/strict";
import {
  constants,
  createCipheriv,
  generateKeyPairSync,
  publicEncrypt,
  webcrypto,
} from "node:crypto";
import { createRequire } from "node:module";
import { encryptPayload } from "../src/services/encryption";
import { installTestDeployment } from "./helpers/deployment";

const { serverAesKey, decryptServerEnvelope } = createRequire(import.meta.url)(
  "./helpers/server-envelope.cjs",
);
// Created only in process memory. Never read deployment keys or persist this pair.
const pair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function isolated<T>(rng: unknown, action: () => T): T {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const originalUni = (globalThis as any).uni;
  const originalPlus = (globalThis as any).plus;
  const originalDeployment = (globalThis as any).__DEQIN_DEPLOYMENT__;
  installTestDeployment({ rsaPublicKey: pair.publicKey });
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: rng });
  (globalThis as any).plus = undefined;
  (globalThis as any).uni = {
    getStorageSync: (name: string) => name === "dq.publicKey" ? pair.publicKey : "",
  };
  try {
    return action();
  } finally {
    if (cryptoDescriptor) Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
    else Reflect.deleteProperty(globalThis, "crypto");
    (globalThis as any).uni = originalUni;
    (globalThis as any).plus = originalPlus;
    (globalThis as any).__DEQIN_DEPLOYMENT__ = originalDeployment;
  }
}

test("安全随机字节生成ASCII AES256密钥，按后端RSA/Base64/UTF8语义完整还原中文JSON", () => {
  const requested: number[] = [];
  isolated({ getRandomValues(bytes: Uint8Array) {
    requested.push(bytes.length);
    return bytes.fill(255);
  } }, () => {
    const payload = { grantType: "password", username: "合成联调", nested: { id: "9223372036854775806" } };
    const envelope = encryptPayload(payload);
    const key = serverAesKey(envelope.encryptedKey, pair.privateKey);
    assert.ok(key.length === 32 && /^[A-Za-z0-9+/]{32}$/.test(key.toString("utf8")));
    assert.equal(decryptServerEnvelope(envelope.body, envelope.encryptedKey, pair.privateKey), JSON.stringify(payload));
    assert.deepEqual(requested, [24]);
  });
});

test("每次请求重新生成安全密钥，密文不包含原JSON或使用带引号请求体", () => {
  isolated(webcrypto, () => {
    const payload = { username: "synthetic-user", password: "synthetic-only" };
    const first = encryptPayload(payload), second = encryptPayload(payload);
    assert.ok(!first.body.includes("synthetic") && !first.body.startsWith('"'));
    assert.ok(!serverAesKey(first.encryptedKey, pair.privateKey).equals(serverAesKey(second.encryptedKey, pair.privateKey)));
    assert.notEqual(first.body, second.body);
    for (const envelope of [first, second])
      assert.equal(decryptServerEnvelope(envelope.body, envelope.encryptedKey, pair.privateKey), JSON.stringify(payload));
  });
});

test("旧raw32二进制方案经后端UTF8转换无法恢复，回归模型能拒绝原缺陷", () => {
  const rawKey = Buffer.alloc(32, 255);
  const encryptedKey = publicEncrypt({ key: pair.publicKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(rawKey.toString("base64"), "utf8")).toString("base64");
  const cipher = createCipheriv("aes-256-ecb", rawKey, null);
  const body = Buffer.concat([cipher.update("{}", "utf8"), cipher.final()]).toString("base64");
  assert.throws(() => decryptServerEnvelope(body, encryptedKey, pair.privateKey), /Server AES byte length/);
});

test("H5无安全随机数能力时明确拒绝，不回退Math.random或明文登录", () => {
  isolated(undefined, () => assert.throws(() => encryptPayload({}), /安全随机数能力/));
});
