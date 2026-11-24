import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveDeployment,
  deploymentIdentity,
  isAllowedApiBase,
} from "../src/domain/deployment";
import {
  deployment,
  initializeDeploymentSession,
  apiIdentity,
} from "../src/services/deployment";
import { endpoint } from "../src/services/http";
import { publicKey, encryptionEnabled } from "../src/services/encryption";
import { discoveredTenants } from "../src/domain/tenants";
import { installTestDeployment } from "./helpers/deployment";
import { parseInternalUsbSelector, assertSelectorMatches } from "../tools/deployment-selector";
import { parseLocalServiceSelector, assertLocalServiceSelectorMatches } from "../tools/local-service-selector";
const env = {
  VITE_API_BASE_URL: "https://api.example.invalid/business",
  VITE_AUTH_CLIENT_ID: "authorized-android",
  VITE_AUTH_RSA_PUBLIC_KEY: "synthetic-public-metadata",
  VITE_AUTH_TENANT_MODE: "discovery",
};
const localEnv = {
  ...env, DEQIN_BUILD_PROFILE: "local-service", VITE_LOCAL_SERVICE: "true",
  VITE_APP_PROFILE: "development", VITE_API_BASE_URL: "http://192.168.0.30:8080", VITE_AUTH_ENCRYPT: "true",
};
const localSelectorText = Object.entries(localEnv).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";

test("本地服务仅由已审核selector显式启用，不改变标准生产或开发边界", () => {
  const config = resolveDeployment(localEnv, "development", "app", { localService: true });
  assert.equal(config.localService, true);
  assert.equal(config.profile, "development");
  assert.equal(config.apiBaseUrl, "http://192.168.0.30:8080");
  assert.equal(isAllowedApiBase(config), true);
  assert.equal(resolveDeployment(env, "production", "app").localService, false);
  for (const mode of ["production", "development"]) {
    assert.throws(() => resolveDeployment(localEnv, mode, "app"), /selector/);
    assert.throws(() => resolveDeployment({ ...env, VITE_API_BASE_URL: localEnv.VITE_API_BASE_URL }, mode, "app"), /HTTPS/);
  }
  assert.throws(() => resolveDeployment(localEnv, "production", "app", { localService: true }), /selector/);
  for (const changed of [{ VITE_LOCAL_SERVICE: "false" }, { VITE_LOCAL_SERVICE: "1" }, { DEQIN_BUILD_PROFILE: "internal-usb" }])
    assert.throws(() => resolveDeployment({ ...localEnv, ...changed }, "development", "app", { localService: true }), /selector/);
});

test("本地服务HTTP仅允许规范私有IPv4及有效端口，运行时与构建判定一致", () => {
  const baseline = resolveDeployment(localEnv, "development", "app", { localService: true });
  for (const apiBaseUrl of ["http://10.0.0.1", "http://172.16.0.1:1", "http://172.31.255.254:65535", "http://192.168.0.30:8080"]) {
    assert.doesNotThrow(() => resolveDeployment({ ...localEnv, VITE_API_BASE_URL: apiBaseUrl }, "development", "app", { localService: true }));
    assert.equal(isAllowedApiBase({ ...baseline, apiBaseUrl }), true);
  }
  for (const apiBaseUrl of ["http://172.15.0.1", "http://172.32.0.1", "http://8.8.8.8:8080",
    "http://127.0.0.1:8080", "http://localhost:8080", "http://192.168.0.256:8080", "http://192.168.000.30:8080",
    "http://0xc0a8001e:8080", "http://3232235550:8080", "http://[::1]:8080", "http://192.168.0.30:0",
    "http://192.168.0.30:65536", "http://192.168.0.30:08080", "http://user@192.168.0.30:8080",
    "http://192.168.0.30:8080?token=x", "http://192.168.0.30:8080#fragment", "http://192.168.0.30:8080/api",
    "https://192.168.0.30:8080", "http://192.168.0.30\\@example.invalid"]) {
    assert.throws(() => resolveDeployment({ ...localEnv, VITE_API_BASE_URL: apiBaseUrl }, "development", "app", { localService: true }), /私有 IPv4/);
    assert.equal(isAllowedApiBase({ ...baseline, apiBaseUrl }), false, apiBaseUrl);
  }
  assert.equal(isAllowedApiBase({ ...baseline, profile: "production" }), false);
  assert.equal(isAllowedApiBase({ ...baseline, localService: false }), false);
});

test("本地selector拒绝额外字段及降级，核对当前stage的两组env和磁盘审批值", () => {
  const selected = parseLocalServiceSelector(localSelectorText);
  assert.doesNotThrow(() => assertLocalServiceSelectorMatches(selected, localEnv, localEnv));
  for (const changed of [localSelectorText + "VITE_LOCAL_SERVICE=true\n", localSelectorText + "PRIVATE_KEY=synthetic\n",
    localSelectorText.replace("VITE_AUTH_ENCRYPT=true", "VITE_AUTH_ENCRYPT=false"),
    localSelectorText.replace("192.168.0.30", "8.8.8.8"), localSelectorText.replace("=development", "=production"),
    localSelectorText.replace("synthetic-public-metadata", "line1\nline2")])
    assert.throws(() => parseLocalServiceSelector(changed), /selector/);
  const changed = { ...localEnv, VITE_API_BASE_URL: "http://192.168.0.31:8080" };
  assert.throws(() => assertLocalServiceSelectorMatches(selected, changed, changed), /VITE_API_BASE_URL/);
  assert.throws(() => assertLocalServiceSelectorMatches(selected, localEnv, changed), /VITE_API_BASE_URL/);
});

test("仅本地服务部署扩展身份，标准部署六项值和会话身份保持不变", () => {
  const standard = resolveDeployment(env, "production", "app");
  const identity = JSON.stringify([standard.profile, standard.apiBaseUrl, standard.clientId,
    standard.tenantMode, standard.tenantId, standard.rsaPublicKey]);
  assert.equal(deploymentIdentity(standard), identity);
  assert.equal(deploymentIdentity({ ...standard, localService: undefined }), identity);
  assert.equal(deploymentIdentity({ ...standard, localService: false }), identity);
  const local = resolveDeployment(localEnv, "development", "app", { localService: true });
  assert.equal(JSON.parse(deploymentIdentity(local)).at(-1), "local-service");
  assert.notEqual(deploymentIdentity(local), deploymentIdentity({ ...local, localService: false }));
});
test("内部selector严格拒绝重复额外字段和未审核多行值", () => {
  const source = "DEQIN_BUILD_PROFILE=internal-usb\nVITE_APP_PROFILE=development\nVITE_API_BASE_URL=http://127.0.0.1:8080\nVITE_AUTH_CLIENT_ID=reviewed-android\nVITE_AUTH_RSA_PUBLIC_KEY=synthetic-public\nVITE_AUTH_TENANT_MODE=discovery\nVITE_AUTH_ENCRYPT=true\n";
  const selected = parseInternalUsbSelector(source);
  assert.equal(selected.VITE_AUTH_CLIENT_ID, "reviewed-android");
  for (const changed of [source + "VITE_AUTH_CLIENT_ID=other\n", source + "EXTRA_PRIVATE=not-real\n", source.replace("synthetic-public", "line1\nline2"), source.replace("=development", "= development")])
    assert.throws(() => parseInternalUsbSelector(changed), /selector/);
});
test("GUI进程同时覆盖两组env也不能越过磁盘selector审核值", () => {
  const selected = { DEQIN_BUILD_PROFILE: "internal-usb", VITE_APP_PROFILE: "development", VITE_API_BASE_URL: "http://127.0.0.1:8080", VITE_AUTH_CLIENT_ID: "reviewed-android", VITE_AUTH_RSA_PUBLIC_KEY: "public", VITE_AUTH_TENANT_MODE: "discovery", VITE_AUTH_ENCRYPT: "true" };
  assert.doesNotThrow(() => assertSelectorMatches(selected, selected, selected));
  const overridden = { ...selected, VITE_AUTH_CLIENT_ID: "different-process-client" };
  assert.throws(() => assertSelectorMatches(selected, overridden, overridden), /VITE_AUTH_CLIENT_ID/);
});

test("生产配置必须预置API客户端和公钥，缺项在构建入口报出具体缺失字段", () => {
  for (const field of [
    "VITE_API_BASE_URL",
    "VITE_AUTH_CLIENT_ID",
    "VITE_AUTH_RSA_PUBLIC_KEY",
  ])
    assert.throws(
      () => resolveDeployment({ ...env, [field]: "" }, "production", "app"),
      new RegExp(field),
    );
  assert.equal(
    resolveDeployment(env, "production", "app").profile,
    "production",
  );
});
test("生产拒绝明文回环和LAN、URL凭据、查询和片段，不能用开发profile环境静默降级", () => {
  for (const address of [
    "http://127.0.0.1:8080",
    "http://192.168.1.1:8080",
    "https://user:pass@example.invalid",
    "https://example.invalid?token=x",
    "https://example.invalid/#fragment",
  ])
    assert.throws(
      () =>
        resolveDeployment(
          { ...env, VITE_API_BASE_URL: address },
          "production",
          "app",
        ),
      /HTTPS/,
    );
  assert.throws(
    () =>
      resolveDeployment(
        { ...env, VITE_APP_PROFILE: "development" },
        "production",
        "app",
      ),
    /mode/,
  );
});
test("开发明文仅允许精确127.0.0.1:8080，不允许localhost模拟器别名LAN变端口或路径", () => {
  const allowed = resolveDeployment(
    { ...env, VITE_API_BASE_URL: "http://127.0.0.1:8080" },
    "development",
    "app",
  );
  assert.equal(allowed.profile, "development");
  assert.equal(isAllowedApiBase(allowed), true);
  for (const address of [
    "http://localhost:8080",
    "http://10.0.2.2:8080",
    "http://127.0.0.1:8081",
    "http://127.0.0.1:8080/api",
    "http://192.168.1.8:8080",
    "http://127.1:8080",
  ])
    assert.throws(
      () =>
        resolveDeployment(
          { ...env, VITE_API_BASE_URL: address },
          "development",
          "app",
        ),
      /HTTPS/,
    );
});
test("禁用登录加密或把私钥放到公钥字段均在构建阶段拒绝", () => {
  assert.throws(
    () =>
      resolveDeployment(
        { ...env, VITE_AUTH_ENCRYPT: "false" },
        "production",
        "app",
      ),
    /禁止关闭/,
  );
  assert.throws(
    () =>
      resolveDeployment(
        { ...env, VITE_AUTH_RSA_PUBLIC_KEY: "-----BEGIN PRIVATE KEY-----" },
        "production",
        "app",
      ),
    /公钥/,
  );
});
test("公开部署配置只挑选允许字段，不将环境中的密码或私钥打入前端", () => {
  const config = resolveDeployment(
    {
      ...env,
      DATABASE_PASSWORD: "not-a-real-password",
      PRIVATE_KEY: "not-a-real-key",
      VITE_OTHER_SECRET: "not-a-real-secret",
    },
    "production",
    "app",
  );
  assert.equal(Object.isFrozen(config), true);
  assert.equal(JSON.stringify(config).includes("not-a-real"), false);
  assert.equal(config.tenantId, "");
});
test("HTTP公钥和客户端只取构建预置，旧版连接storage无法覆盖", () => {
  installTestDeployment({
    apiBaseUrl: "https://built.invalid",
    clientId: "built-client",
    rsaPublicKey: "built-public",
  });
  (globalThis as any).uni = { getStorageSync: () => "http://attacker.invalid" };
  assert.equal(endpoint(), "https://built.invalid");
  assert.equal(deployment().clientId, "built-client");
  assert.equal(publicKey(), "built-public");
  assert.equal(encryptionEnabled(), true);
});
test("H5代理使用相对请求，业务命名空间仍绑定真实后端而非same-origin", () => {
  const config = installTestDeployment({
    profile: "development",
    apiBaseUrl: "http://127.0.0.1:8080",
    h5Proxy: true,
  });
  assert.equal(endpoint(), "");
  assert.equal(apiIdentity(), "http://127.0.0.1:8080");
  assert.notEqual(
    deploymentIdentity(config),
    deploymentIdentity({ ...config, apiBaseUrl: "https://another.invalid" }),
  );
});
test("部署身份切换清会话和主机但保留结果不明journal及其原scope", () => {
  installTestDeployment();
  const pending = [
    { scope: '["https://old.invalid","a","u","f"]', key: "original" },
  ];
  const store = new Map<string, unknown>([
    ["dq.deploymentIdentity", "old-deployment"],
    ["dq.pending", pending],
    ["dq.server", "https://old.invalid"],
    ["dq.clientId", "old-client"],
  ]);
  let clears = 0,
    stops = 0;
  const ports = {
    get: (key: string) => store.get(key),
    set: (key: string, value: string) => {
      store.set(key, value);
    },
    remove: (key: string) => {
      store.delete(key);
    },
    clearSession: () => {
      clears++;
    },
    stopHost: () => {
      stops++;
    },
  };
  initializeDeploymentSession(ports);
  assert.equal(clears, 1);
  assert.equal(stops, 1);
  assert.equal(store.get("dq.pending"), pending);
  assert.equal(store.has("dq.server"), false);
  assert.equal(store.has("dq.clientId"), false);
  initializeDeploymentSession(ports);
  assert.equal(clears, 1);
  assert.equal(stops, 1);
});
test("会话清理失败不承认新部署身份，不能跳过下次清理", () => {
  installTestDeployment();
  let identity = "old";
  assert.throws(
    () =>
      initializeDeploymentSession({
        get: () => identity,
        set: (_key, value) => {
          identity = value;
        },
        remove() {},
        stopHost() {},
        clearSession() {
          throw new Error("secure-store-failure");
        },
      }),
    /secure-store-failure/,
  );
  assert.equal(identity, "old");
});
test("公共企业发现只接受实际企业名称和唯一字符串身份，空或格式异常不默认000000", () => {
  assert.deepEqual(
    discoveredTenants({
      tenantEnabled: true,
      voList: [
        { tenantId: "000001", companyName: "客户甲" },
        { tenantId: "000002", companyName: "客户乙" },
      ],
    }),
    [
      { tenantId: "000001", companyName: "客户甲" },
      { tenantId: "000002", companyName: "客户乙" },
    ],
  );
  for (const value of [
    undefined,
    {},
    { tenantEnabled: false },
    { tenantEnabled: true, voList: [] },
    { tenantEnabled: true, voList: [{ tenantId: 1, companyName: "甲" }] },
    { tenantEnabled: true, voList: [{ tenantId: "1", companyName: " " }] },
    {
      tenantEnabled: true,
      voList: [
        { tenantId: "1", companyName: "甲" },
        { tenantId: "1", companyName: "乙" },
      ],
    },
  ])
    assert.throws(() => discoveredTenants(value), /企业/);
});
